// Copyright 2018 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const { map } = require('ramda');
const { isBlank, noop, without } = require('../util/util');
const { isTrue } = require('../util/http');
const Problem = require('../util/problem');
const { QueryOptions } = require('../util/db');
const { reject, getOrReject } = require('../util/promise');


// injects an empty/anonymous auth session into the request context.
const emptySessionInjector = ({ Auth }, context) => context.with({ auth: new Auth() });

// if one of (Bearer|Basic|Cookie) credentials are provided in the correct conditions
// then sessionHandler injects the appropriate session information to the context
// given the appropriate credentials. if credentials are given but don't match a
// session, aborts the request with a 401.
//
// otherwise, nothing is done. n.b. this means you must use the emptySessionInjector
// in conjunction with this function!
//
// TODO?: repetitive, but deduping it makes it even harder to understand.
const sessionHandler = ({ Session, User, Auth, crypto }, context) => {
  const authBySessionToken = (token, onFailure = noop) => Session.getByBearerToken(token)
    .then((session) => {
      if (!session.isDefined()) return onFailure();
      return context.with({ auth: new Auth({ _session: session }) });
    });

  const authHeader = context.headers.authorization;

  // Standard Bearer token auth:
  if (!isBlank(authHeader) && authHeader.startsWith('Bearer ')) {
    // fail if the user attempts multiple authentication schemes:
    if ((context.auth != null) && context.auth.isAuthenticated())
      return reject(Problem.user.authenticationFailed());

    // otherwise auth by the bearer token we found:
    return authBySessionToken(authHeader.slice(7), () => reject(Problem.user.authenticationFailed()));

  // Basic Auth, which is allowed over HTTPS only:
  } else if (!isBlank(authHeader) && authHeader.startsWith('Basic ')) {
    // fail if the user attempts multiple authentication schemes:
    if ((context.auth != null) && context.auth.isAuthenticated())
      return reject(Problem.user.authenticationFailed());

    // fail the request unless we are under HTTPS.
    // this logic does mean that if we are not under nginx it is possible to fool the server.
    // but it is the user's prerogative to undertake this bypass, so their security is in their hands.
    if ((context.protocol !== 'https') && (context.headers['x-forwarded-proto'] !== 'https'))
      return reject(Problem.user.httpsOnly());

    // we have to use a regex rather than .split(':') in case the password contains :s.
    const plainCredentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const match = /^([^:]+):(.+)$/.exec(plainCredentials);
    if (match == null) return reject(Problem.user.authenticationFailed());
    const [ , email, password ] = match;

    // actually do our verification.
    // TODO: email existence timing attack on whether bcrypt runs or not.
    return User.getByEmail(email)
      .then(getOrReject(Problem.user.authenticationFailed()))
      .then((user) => crypto.verifyPassword(password, user.password)
        .then((verified) => {
          if (verified === true)
            return context.with({ auth: new Auth({ _actor: user.actor }) });

          return reject(Problem.user.authenticationFailed());
        }));

  // Cookie Auth, which is more relaxed about not doing anything on failures.
  // but if the method is anything but GET we will need to check the CSRF token.
  } else if (context.headers.cookie != null) {
    // do nothing if the user attempts multiple authentication schemes:
    if ((context.auth != null) && context.auth.isAuthenticated())
      return;

    // fail the request unless we are under HTTPS.
    if ((context.protocol !== 'https') && (context.headers['x-forwarded-proto'] !== 'https'))
      return;

    // otherwise get the cookie contents.
    const token = /session=([^;]+)(?:;|$)/.exec(context.headers.cookie);
    if (token == null)
      return;

    // actually try to authenticate with it. no Problem on failure. short circuit
    // out if we have a GET request.
    const maybeSession = authBySessionToken(token[1]);
    if (context.method === 'GET') return maybeSession;

    // if non-GET run authentication as usual but we'll have to check CSRF afterwards.
    return maybeSession.then((cxt) => { // we have to use cxt rather than context for the linter
      // if authentication failed anyway, just do nothing.
      if ((cxt == null) || !cxt.auth.session().isDefined()) return;

      // if csrf missing or mismatch; fail outright.
      const csrf = cxt.body.__csrf;
      if (isBlank(csrf) || (cxt.auth.session().get().csrf !== csrf))
        return reject(Problem.user.authenticationFailed());

      // delete the token off the body so it doesn't mess with downstream
      // payload expectations.
      return cxt.with({ body: without([ '__csrf' ], cxt.body) });
    });
  }
};

// Like sessionParser, but rather than parse OAuth2-style Bearer tokens from the
// header, picks up field keys from the url. Splices in /after/ the versionParser;
// does not expect or understand the version prefix.
//
// If authentication is already provided via Bearer token, we reject with 401.
//
// In addition to rejecting with 401 if the token is invalid, we also reject if
// the token does not belong to a field key, as only field keys may be used in
// this manner. (TODO: we should not explain in-situ for security reasons, but we
// should explain /somewhere/.)
const fieldKeyHandler = ({ Session, Auth }, context) => {
  if (context.fieldKey.isEmpty()) return;

  if ((context.auth != null) && (context.auth.isAuthenticated()))
    // fail if the user attempts multiple authentication schemes:
    return reject(Problem.user.authenticationFailed());

  return Session.getByBearerToken(context.fieldKey.get())
    .then(getOrReject(Problem.user.authenticationFailed()))
    .then((session) => {
      if (session.actor.type !== 'field_key') return reject(Problem.user.authenticationFailed());
      return context.with({ auth: new Auth({ _session: session }) });
    });
};

// translates some simple things into specific context parameters.
const queryOptionsHandler = (_, context) => {
  const { headers, query } = context;
  const options = {};

  // set extended metadata:
  const extendedMeta = headers['x-extended-metadata'];
  if (isTrue(extendedMeta)) options.extended = true;

  // parse in paging parameters:
  if (query.offset != null) options.offset = parseInt(query.offset, 10);
  if (Number.isNaN(options.offset))
    return reject(Problem.user.invalidDataTypeOfParameter({ field: 'offset', expected: 'integer' }));
  if (query.limit != null) options.limit = parseInt(query.limit, 10);
  if (Number.isNaN(options.limit))
    return reject(Problem.user.invalidDataTypeOfParameter({ field: 'limit', expected: 'integer' }));

  // add an inert reference to all passed params:
  options.argData = map(decodeURIComponent, query);

  return context.with({ queryOptions: new QueryOptions(options) });
};


module.exports = { emptySessionInjector, sessionHandler, fieldKeyHandler, queryOptionsHandler };

