// Copyright 2018 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

const { getOrNotFound } = require('../util/promise');
const { success } = require('../util/http');

module.exports = (service, endpoint) => {
  service.get('/projects', endpoint(({ Project }, { auth, queryOptions }) =>
    Project.getAllByAuth(auth, queryOptions)));

  service.post('/projects', endpoint(({ Audit, Project }, { auth, body }) =>
    auth.canOrReject('project.create', Project.species())
      .then(() => Project.fromApi(body))
      .then((data) => data.create()
        .then((project) => Audit.log(auth.actor(), 'project.create', project, { data })
          .then(() => project)))));

  service.get('/projects/:id', endpoint(({ Project }, { auth, params, queryOptions }) =>
    Project.getById(params.id, queryOptions)
      .then(getOrNotFound)
      .then((project) => auth.canOrReject('project.read', project)
        .then(() => ((queryOptions.extended === true)
          ? auth.verbsOn(project).then((verbs) => Object.assign({ verbs }, project.forApi()))
          : project)))));

  service.patch('/projects/:id', endpoint(({ Audit, Project }, { auth, body, params }) =>
    Project.getById(params.id)
      .then(getOrNotFound)
      .then((project) => auth.canOrReject('project.update', project)
        .then(() => {
          const updatedFields = Project.fromApi(body);
          return Promise.all([
            project.with(updatedFields).update(),
            Audit.log(auth.actor(), 'project.update', project, { data: updatedFields })
          ]);
        })
        .then(([ updatedProject ]) => updatedProject))));

  service.delete('/projects/:id', endpoint(({ Audit, Project }, { auth, params }) =>
    Project.getById(params.id)
      .then(getOrNotFound)
      .then((project) => auth.canOrReject('project.delete', project)
        .then(() => Promise.all([
          project.delete(),
          Audit.log(auth.actor(), 'project.delete', project)
        ]))
        .then(success))));

  // TODO: when form versioning is opened to users, log the version changes here.
  service.post('/projects/:id/key', endpoint(({ Audit, Project }, { auth, params, body }) =>
    Project.getById(params.id)
      .then(getOrNotFound)
      .then((project) => auth.canOrReject('project.update', project)
        .then(() => Promise.all([
          project.setManagedEncryption(body.passphrase, body.hint),
          Audit.log(auth.actor(), 'project.update', project, { encrypted: true })
        ]))
        .then(success))));
};

