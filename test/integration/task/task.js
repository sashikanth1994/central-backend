const appRoot = require('app-root-path');
const should = require('should');
const { testTask } = require('../setup');
const { writeFile, symlink } = require('fs');
const { join } = require('path');
const { exec } = require('child_process');
const { identity } = require('ramda');
const { task, auditing, run } = require(appRoot + '/lib/task/task');
const Problem = require(appRoot + '/lib/util/problem');
const tmp = require('tmp');

describe('task: runner', () => {
  const success = `
    const { task, run } = require('./lib/task/task');
    run(Promise.resolve({ test: 'result' }));
  `;
  const failure = `
    const { task, run } = require('./lib/task/task');
    const Problem = require('./lib/util/problem');
    run(Promise.reject(Problem.internal.emptyResponse()));
  `;
  const runScript = (script) => new Promise((resolve) => tmp.dir((_, dirpath) => {
    const scriptPath = join(dirpath, 'script.js');
    writeFile(scriptPath, script, () =>
      symlink(join(appRoot.toString(), 'node_modules'), join(dirpath, 'node_modules'), () =>
        symlink(join(appRoot.toString(), 'lib'), join(dirpath, 'lib'), () =>
          exec(`${process.argv0} ${scriptPath}`, (error, stdout, stderr) =>
            resolve([ error, stdout, stderr ])))));
  }));

  it('should print success object to stdout', () => runScript(success)
    .then(([ , stdout ]) => stdout.should.equal(`'{"test":"result"}'\n`)));

  it('should print failure details to stderr and exit nonzero', () => runScript(failure)
    .then(([ error, , stderr ]) => {
      error.code.should.equal(1);
      stderr.should.match(/^Problem \[Error\]: The resource returned no data./);
    }));
});

describe('task: auditing', () => {
  context('on task success', () => {
    it('should log', testTask(({ simply, Audit }) =>
      auditing('testAction', Promise.resolve({ key: 'value' }))
        .then(() => simply.getAll('audits', Audit)
          .then((audits) => {
            audits.length.should.equal(1);
            audits[0].action.should.equal('testAction');
            audits[0].details.should.eql({ success: true, key: 'value' });
          }))));

    it('should fault but passthrough on log failure', testTask(({ Audit }) => {
      // hijack Audit.log to crash. new container is made for each test so we don't have
      // to restore a working one.
      Audit.log = () => Promise.reject(false);
      return auditing('testAction', Promise.resolve(true))
        .then((result) => {
          // too difficult to test stderr output.
          process.exitCode.should.equal(1);
          result.should.equal(true);
        });
    }));
  });

  context('on task failure', () => {
    it('should log', testTask(({ simply, Audit }) =>
      auditing('testAction', Promise.reject(Problem.user.missingParameter({ field: 'test' })))
        .then(identity, () => simply.getAll('audits', Audit)
          .then((audits) => {
            audits.length.should.equal(1);
            audits[0].action.should.equal('testAction');
            audits[0].details.message.should.equal('Required parameter test missing.');
            audits[0].details.code.should.equal(400.2);
          }))));

    it('should fault but passthrough on log failure', testTask(({ Audit }) => {
      // ditto above.
      Audit.log = () => Promise.reject(Problem.user.missingParameter({ field: 'test' }));
      return auditing('testAction', Promise.reject(true))
        .then(identity, (result) => {
          // too difficult to test stderr output.
          process.exitCode.should.equal(1);
          result.should.equal(true);
        });
    }));
  });
});

