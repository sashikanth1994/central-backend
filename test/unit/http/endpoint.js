const should = require('should');
const { EventEmitter } = require('events');
const { createRequest, createResponse } = require('node-mocks-http');
const streamTest = require('streamtest').v2;
const { always, identity } = require('ramda');

const appRoot = require('app-root-path');
const { endpointBase, defaultErrorWriter, Context, defaultResultWriter, openRosaPreprocessor, openRosaBefore, openRosaResultWriter, openRosaErrorWriter, odataPreprocessor, odataBefore } = require(appRoot + '/lib/http/endpoint');
const { noop } = require(appRoot + '/lib/util/util');
const Problem = require(appRoot + '/lib/util/problem');
const Option = require(appRoot + '/lib/util/option');

const createModernResponse = () => {
  const result = createResponse({ eventEmitter: EventEmitter });
  // node-mocks-http does not have hasHeader yet.
  result.hasHeader = function(name) {
    return this.getHeader(name) != null;
  };

  // express adds this.
  result.status = function(code) {
    this.statusCode = code;
    return this;
  };

  return result;
};

describe('endpoints', () => {
  describe('defaultErrorWriter', () => {
    it('should adapt Problem code to http code', (done) => {
      const response = createModernResponse();
      response.on('end', () => {
        response.statusCode.should.equal(409);
        done();
      });
      defaultErrorWriter(new Problem(409.1138, 'test message'), null, response);
    });

    it('should set json return type', (done) => {
      const response = createModernResponse();
      response.on('end', () => {
        response.getHeader('Content-Type').should.equal('application/json');
        done();
      });
      defaultErrorWriter(new Problem(409.1138, 'test message'), null, response);
    });

    it('should provide Problem details in the body', (done) => {
      const response = createModernResponse();
      response.on('end', () => {
        response._getData().code.should.equal(409.1138);
        response._getData().message.should.equal('test message');
        response._getData().details.should.eql({ x: 1 });
        done();
      });
      defaultErrorWriter(new Problem(409.1138, 'test message', { x: 1 }), null, response);
    });

    it('should turn remaining errors into unknown Problems', (done) => {
      const response = createModernResponse();
      const error = new Error('oops');
      error.stack = ''; // strip stack so that our test output isn't super polluted
      response.on('end', () => {
        response.statusCode.should.equal(500);
        response._getData().message.should.equal('Completely unhandled exception: oops');
        done();
      });
      defaultErrorWriter(error, null, response);
    });

    it('should translate 403 replies to Tableau into 401 Basic auth directives', (done) => {
      const response = createModernResponse();
      const request = createRequest({
        headers: {
          'User-Agent': 'Tableau Desktop 10500.18.0305.1200; public; libcurl-client; 64-bit; en_US; Mac OS X 10.13.3;'
        }
      });
      response.on('end', () => {
        response.statusCode.should.equal(401);
        response.header('WWW-Authenticate').should.equal('Basic charset="UTF-8"');
        done();
      });
      defaultErrorWriter(Problem.user.insufficientRights(), request, response);
    });

    it('should not translate 403 to 401 if user agent header is not present', (done) => {
      const response = createModernResponse();
      const request = createRequest();
      response.on('end', () => {
        response.statusCode.should.equal(403);
        done();
      });
      defaultErrorWriter(Problem.user.insufficientRights(), request, response);
    });
  });

  describe('framework', () => {
    describe('preprocessors', () => {
      it('should run the format preprocessor', () => {
        let ran = false;
        const resource = endpointBase({
          preprocessor: () => { ran = true; },
          resultWriter: noop
        })()(always(true));

        return resource(createRequest(), createModernResponse())
          .then(() => { ran.should.equal(true); });
      });

      it('should run the format preprocessor before the middleware preprocessors', () => {
        const result = [];
        const push = (str) => () => { result.push(str); };

        const resource = endpointBase({
          preprocessor: push('format'),
          resultWriter: noop
        })(null, [ push('mid1'), push('mid2') ])(always(true));

        return resource(createRequest(), createModernResponse())
          .then(() => { result.should.eql([ 'format', 'mid1', 'mid2' ]); });
      });

      it('should fail the overall promise if the format preprocessor fails', () => {
        let failed = false;
        return endpointBase({
          preprocessor: () => Promise.reject(new Error('format failure')),
          resultWriter: noop
        })()()(createRequest(), createModernResponse(), (failure) => {
          failure.message.should.equal('format failure');
          failed = true;
        }).then(() => { failed.should.equal(true); });
      });

      it('should fail the overall promise if a middleware preprocessor fails', () => {
        let failed = false;
        return endpointBase({ resultWriter: noop })(null, [
          () => { return true; },
          () => Promise.reject(new Error('middleware failure'))
        ])()(createRequest(), createModernResponse(), (failure) => {
          failure.message.should.equal('middleware failure');
          failed = true;
        }).then(() => { failed.should.equal(true); });
      });

      it('should accept Promise results from preprocessors', () => {
        let waited = false;
        return endpointBase({ resultWriter: noop })(null, [
          () => new Promise((resolve) => {
            setTimeout(() => { waited = true; resolve(); }, 0);
          })
        ])(always(true))(createRequest(), createModernResponse()).then(() => {
          waited.should.equal(true);
        });
      });

      it('should provide appropriate call arguments to preprocessors', () => {
        let checked = false;
        return endpointBase({
          preprocessor: (container, context, request) => {
            container.should.equal(42);
            context.should.be.an.instanceof(Context);
            request.method.should.equal('TEST');
            checked = true;
          },
          resultWriter: noop
        })(42)(always(true))({ method: 'TEST' }).then(() => {
          checked.should.equal(true);
        });
      });

      it('should leave Context alone between preprocessors if nothing is returned', () => {
        let checked = false;
        return endpointBase({ resultWriter: noop })(null, [
          (_, context) => { context.method.should.equal('TEST'); },
          (_, context) => {
            context.method.should.equal('TEST');
            checked = true;
          }
        ])(always(true))({ method: 'TEST' }, createModernResponse()).then(() => {
          checked.should.equal(true);
        });
      });

      it('should accept the new Context if returned directly by a preprocessor', () => {
        let checked = false;
        return endpointBase({ resultWriter: noop })(null, [
          (_, context) => context.with({ test2: true }),
          (_, context) => {
            context.method.should.equal('TEST');
            context.test2.should.equal(true);
            checked = true;
          }
        ])(always(true))({ method: 'TEST' }, createModernResponse()).then(() => {
          checked.should.equal(true);
        });
      });

      it('should accept the new Context if returned within Promise by a preprocessor', () => {
        let checked = false;
        return endpointBase({ resultWriter: noop })(null, [
          (_, context) => new Promise((resolve) => {
            setTimeout(resolve(context.with({ test2: true })), 0);
          }),
          (_, context) => {
            context.method.should.equal('TEST');
            context.test2.should.equal(true);
            checked = true;
          }
        ])(always(true))({ method: 'TEST' }, createModernResponse()).then(() => {
          checked.should.equal(true);
        });
      });

      it('should pass along the final context result to the actual resource', () => {
        let checked = false;
        return endpointBase({ resultWriter: noop })(null, [
          (_, context) => context.with({ test2: true })
        ])((_, context) => {
          context.method.should.equal('TEST');
          context.test2.should.equal(true);
          checked = true;
          return true;
        })({ method: 'TEST' }, createModernResponse()).then(() => {
          checked.should.equal(true);
        });
      });
    });

    describe('before handler', () => {
      it('should run after preprocessors and before the resource', () => {
        let ran = [];
        const push = (str) => () => { ran.push(str); };
        return endpointBase({
          before: push('before'),
          resultWriter: noop
        })(null, [ push('pre') ])(() => {
          ran.push('resource');
          return true;
        })(createRequest(), createModernResponse()).then(() => {
          ran.should.eql([ 'pre', 'before', 'resource' ]);
        });
      });

      it('should receive the appropriate argument', () => {
        let checked = false;
        return endpointBase({
          before: (response) => {
            response.should.equal(42);
            checked = true;
          },
          resultWriter: noop
        })()(always(true))({ method: 'TEST' }, 42).then(() => {
          checked.should.equal(true);
        });
      });
    });

    describe('resource/finalize/output/error', () => {
      it('should fail the Promise if nothing is returned', () => {
        let failed = false;
        return endpointBase({})()(noop)(createRequest(), createModernResponse(), (failure) => {
          failure.problemCode.should.equal(500.3);
          failed = true;
        }).then(() => { failed.should.equal(true); });
      });

      it('should fail the Promise if an unhandled exception is returned', () => {
        let failed = false;
        return endpointBase({})()(() => { hello; })(createRequest(), createModernResponse(), (failure) => {
          failure.should.be.an.instanceof(ReferenceError);
          failed = true;
        }).then(() => { failed.should.equal(true); });
      });

      it('should passthrough to error handler if a Promise rejection occurs', () => {
        let errored = false;
        return endpointBase({
          errorWriter: (error) => {
            error.problemCode.should.equal(404.1);
            errored = true;
          }
        })()(() => Promise.reject(Problem.user.notFound()))(createRequest(), createModernResponse()).then(() => {
          errored.should.equal(true);
        });
      });

      // sort of tests two things, but.. eh
      it('should pass directly returned values to resultWriter, with appropriate args', () => {
        let outputted = false;
        return endpointBase({
          resultWriter: (result, request, response) => {
            result.should.equal(42);
            request.method.should.equal('TEST');
            response.should.equal(108);
            outputted = true;
          }
        })()(always(42))({ method: 'TEST' }, 108).then(() => {
          outputted.should.equal(true);
        });
      });

      it('should, given a function return, call it with appropriate args', () => {
        let outputted = false;
        return endpointBase({
          resultWriter: (result) => {
            result.should.equal(42);
            outputted = true;
          }
        })()(() => (request, response) => {
          request.method.should.equal('TEST');
          response.should.equal(108);
          return 42;
        })({ method: 'TEST' }, 108).then(() => {
          outputted.should.equal(true);
        });
      });

      it('should pass stream results through', () => {
        let outputted = false;
        return endpointBase({
          resultWriter: (result) => {
            result.pipe.should.be.a.Function();
            outputted = true;
          }
        })()(always({ pipe() {} }))({ method: 'TEST' }, 108).then(() => {
          outputted.should.equal(true);
        });
      });
    });

    describe('transaction management', () => {
      it('should initiate a transaction given a write request', () =>
        Promise.all([ 'POST', 'PUT', 'PATCH', 'DELETE' ].map((method) => {
          let transacted = false;
          const container = { transacting(cb) {
            transacted = true;
            return cb();
          } };

          return endpointBase({ resultWriter: noop })(container)(always(true))({ method })
            .then(() => { transacted.should.equal(true); });
        })));

      it('should not initiate a transaction given a read request', () =>
        Promise.all([ 'GET', 'HEAD', 'OPTIONS' ].map((method) => {
          let transacted = false;
          const container = { transacting(cb) {
            transacted = true;
            return cb();
          } };

          return endpointBase({ resultWriter: noop })(container)(always(true))({ method })
            .then(() => { transacted.should.equal(false); });
        })));

      it('should reject on the transacting promise on preprocessor failure', () => {
        // we still check the transacted flag just to be sure the rejectedWith assertion runs.
        let transacted = false;
        const container = { transacting(cb) {
          transacted = true;
          return cb().should.be.rejectedWith(Problem, { problemCode: 404.1 });
        } };

        return endpointBase({ resultWriter: noop })(container, [
          () => Promise.reject(Problem.user.notFound())
        ])(always(true))({ method: 'POST' })
          .then(() => { transacted.should.equal(true); });
      });

      it('should reject on the transacting promise on before failure', () => {
        // we still check the transacted flag just to be sure the rejectedWith assertion runs.
        let transacted = false;
        const container = { transacting(cb) {
          transacted = true;
          return cb().should.be.rejectedWith(Problem, { problemCode: 404.1 });
        } };

        return endpointBase({
          before() { throw Problem.user.notFound(); },
          resultWriter() {}
        })(container)(always(true))({ method: 'POST' })
          .then(() => { transacted.should.equal(true); });
      });

      it('should reject on the transacting promise on resource failure', () => {
        // we still check the transacted flag just to be sure the rejectedWith assertion runs.
        let transacted = false;
        const container = { transacting(cb) {
          transacted = true;
          return cb().should.be.rejectedWith(Problem, { problemCode: 404.1 });
        } };

        return endpointBase({
          resultWriter() {}
        })(container)(() => { throw Problem.user.notFound(); })({ method: 'POST' })
          .then(() => { transacted.should.equal(true); });
      });
    });
  });

  describe('default format (outputter)', () => {
    it('should attach a json Content-Type absent any other', () => {
      const response = createModernResponse();
      defaultResultWriter({}, createRequest(), response);
      response.getHeader('Content-Type').should.equal('application/json');
    });

    it('should not attach a json Content-Type if one is already present', () => {
      const response = createModernResponse();
      response.setHeader('Content-Type', 'application/xml');
      defaultResultWriter({}, createRequest(), response);
      response.getHeader('Content-Type').should.equal('application/xml');
    });

    it('should send the given plain response', () => {
      const response = createModernResponse();
      defaultResultWriter('hello', createRequest(), response);
      response._getData().should.equal('hello');
    });

    it('should send nothing given a 204 response', () => {
      const response = createModernResponse();
      response.status(204);
      defaultResultWriter({}, createRequest(), response);
      should.not.exist(response.body);
    });

    it('should send nothing given a 3xx response', () => {
      const response = createModernResponse();
      response.status(302);
      defaultResultWriter({}, createRequest(), response);
      should.not.exist(response.body);
    });

    it('should pipe through stream results', (done) => {
      let result, writeResult = (x) => { result = x };
      const requestTest = streamTest.fromChunks();
      const responseTest = streamTest.toText((_, result) => {
        result.should.equal('ateststream');
        done();
      });
      responseTest.hasHeader = function() { return true; };
      defaultResultWriter(streamTest.fromChunks([ 'a', 'test', 'stream' ]), requestTest, responseTest);
    });

    it('should immediately abort the database query if the request is aborted', (done) => {
      const requestTest = new EventEmitter();
      const responseTest = streamTest.toText((_, result) => {
        result.should.not.equal('ateststream');
      });
      responseTest.hasHeader = function() { return true; };
      const source = streamTest.fromChunks([ 'a', 'test', 'stream' ], 1000);
      source.end = done;
      defaultResultWriter(source, requestTest, responseTest);
      requestTest.emit('close');
    });

    it('should not crash if the request is aborted but the stream is not endable', () => {
      const requestTest = new EventEmitter();
      const responseTest = streamTest.toText((_, result) => {
        result.should.not.equal('ateststream');
      });
      responseTest.hasHeader = function() { return true; };
      const source = streamTest.fromChunks([ 'a', 'test', 'stream' ], 1000);
      defaultResultWriter(source, requestTest, responseTest);
      requestTest.emit('close');
    });
  });

  describe('openRosa', () => {
    describe('preprocessor', () => {
      it('should reject requests lacking a version', () =>
        openRosaPreprocessor(null, { headers: {} })
          .should.be.rejectedWith(Problem, { problemDetails: { field: 'X-OpenRosa-Version' } }));

      it('should reject requests with an unexpected version', () =>
        openRosaPreprocessor(null, { headers: { 'X-OpenRosa-Version': '2.0' } })
          .should.be.rejectedWith(Problem, { problemDetails: { field: 'X-OpenRosa-Version' } }));

      it('should allow requests with the correct version', () => {
        should.not.exist(openRosaPreprocessor(null, { headers: { 'x-openrosa-version': '1.0' } }));
      });
    });

    describe('before', () => {
      it('should set the appropriate headers', () => {
        const response = createModernResponse();
        openRosaBefore(response);

        response.get('Content-Language').should.equal('en');
        response.get('X-OpenRosa-Version').should.equal('1.0');
        response.get('X-OpenRosa-Accept-Content-Length').should.equal('20000000');
        response.get('Date').should.be.an.httpDate();
      });
    });

    describe('resultWriter', () => {
      const { createdMessage } = require(appRoot + '/lib/outbound/openrosa');

      it('should send the appropriate content with the appropriate header', () => {
        const response = createModernResponse();
        openRosaResultWriter(createdMessage({}), null, response);

        response.statusCode.should.equal(201);
        response.getHeader('Content-Type').should.equal('text/xml');
        response._getData().trim().should.equal('<OpenRosaResponse xmlns="http://openrosa.org/http/response" items="0">\n    <message nature=""></message>\n  </OpenRosaResponse>');
      });
    });

    describe('error', () => {
      it('should delegate to defaultErrorWriter for uncaught exceptions', () => {
        const response = createModernResponse();
        try {
          openRosaErrorWriter(new Error('test'), null, response);
        } catch (_) {}

        response.statusCode.should.equal(500);
        response.getHeader('Content-Type').should.equal('application/json');
        response._getData().message.should.equal('Completely unhandled exception: test');
      });

      it('should wrap problems in openrosa xml envelopes', () => {
        const response = createModernResponse();
        openRosaErrorWriter(Problem.user.notFound(), null, response);

        response.statusCode.should.equal(404);
        response.getHeader('Content-Type').should.equal('text/xml');
        response._getData().trim().should.equal('<OpenRosaResponse xmlns="http://openrosa.org/http/response" items="0">\n    <message nature="error">Could not find the resource you were looking for.</message>\n  </OpenRosaResponse>');
      });
    });
  });

  describe('odata', () => {
    describe('preprocessor', () => {
      it('should reject json requests to xml endpoints (header)', () => {
        const request = createRequest({ headers: { accept: 'application/json' } });
        return odataPreprocessor('xml')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 406.1 });
      });

      it('should reject json requests to xml endpoints (querystring)', () => {
        const request = createRequest({ url: '/odata.svc?$format=json' });
        return odataPreprocessor('xml')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 406.1 });
      });

      it('should reject xml requests to json endpoints (header)', () => {
        const request = createRequest({ headers: { accept: 'application/xml' } });
        return odataPreprocessor('json')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 406.1 });
      });

      it('should reject xml requests to json endpoints (querystring)', () => {
        const request = createRequest({ url: '/odata.svc?$format=xml' });
        return odataPreprocessor('json')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 406.1 });
      });

      it('should treat $format with precendence over accept', () => {
        const request = createRequest({ url: '/odata.svc?$format=json', headers: { accept: 'application/xml' } });
        return odataPreprocessor('xml')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 406.1 });
      });

      it('should reject requests for OData max-versions below 4.0', () => {
        const request = createRequest({ headers: { 'OData-MaxVersion': '3.0' } });
        return odataPreprocessor('json')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 404.1 });
      });

      it('should reject requests for unsupported OData features', () => {
        const request = createRequest({ url: '/odata.svc?$orderby=magic' });
        return odataPreprocessor('json')(null, new Context(request), request)
          .should.be.rejectedWith(Problem, { problemCode: 501.1 });
      });

      it('should allow appropriate requests through', () => {
        const request = createRequest({ url: '/odata.svc?$top=50', headers: { 'OData-MaxVersion': '4.0', accept: 'application/json' } });
        should.not.exist(odataPreprocessor('json')(null, new Context(request), request));
      });
    });

    describe('before', () => {
      it('should set the appropriate OData version', () => {
        const response = createModernResponse();
        odataBefore(response);

        response.get('OData-Version').should.equal('4.0');
      });
    });
  });
});

