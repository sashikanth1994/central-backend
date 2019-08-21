// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const { wasUpdateSuccessful } = require('../../util/db');

module.exports = {
  getByBearerToken: (token) => ({ simply, Session }) =>
    simply.getOneWhere('sessions', [ { token }, [ 'expiresAt', '>', 'now()' ] ], Session),

  deleteByActorId: (actorId) => ({ db }) =>
    db('sessions').delete().where({ actorId }).then(wasUpdateSuccessful)
};

