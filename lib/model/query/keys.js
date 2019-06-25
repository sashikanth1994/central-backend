// Copyright 2019 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const { rowsToInstances } = require('../../util/db');

module.exports = {
  ensure: (key) => ({ db }) =>
    db.raw(`
with vals (public, "createdAt") as (values (?, now())),
  ins as (
    insert into keys (public, "createdAt")
    select * from vals
    on conflict (public) do nothing
    returning id)
select id from ins
union all
select id from vals join keys using (public)`, [ key.public ])
      .then(({ rows }) => rows[0].id),

  getActiveByFormId: (formId) => ({ db, Key }) =>
    db.select('*')
      .from('keys')
      .join(
        db.select('keyId').from('form_defs')
          .join('submission_defs', 'submission_defs.formDefId', 'form_defs.id')
          .where({ formId })
          .as('form_defs'),
        'form_defs.keyId', 'keys.id'
      )
      .then(rowsToInstances(Key))
};
