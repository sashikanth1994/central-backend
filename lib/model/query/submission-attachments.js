// Copyright 2018 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.
//
// Submission Attachments are files that are expected to exist given the submission
// xml data and the form XForms xml definition.

const Problem = require('../../util/problem');
const { wasUpdateSuccessful, rowsToInstances, translateProblem } = require('../../util/db');

module.exports = {
  // we want to enforce a consistent ordering so we don't use simply.
  getAllBySubmissionDefId: (submissionDefId) => ({ db, SubmissionAttachment }) =>
    db.select('*')
      .from('submission_attachments')
      .where({ submissionDefId })
      .orderBy('name')
      .then(rowsToInstances(SubmissionAttachment)),

  // The attachment will already contain information about its relationship to this
  // Submission, as it is a join entity.
  create: (attachment) => ({ simply }) =>
    simply.create('submission_attachments', attachment)
      // TODO: i think maybe this isn't necessary anymore?
      .catch(translateProblem(
        ((problem) => problem.code === Problem.user.uniquenessViolation({}).code), // TODO: easier comparison
        ((problem) => Problem.user.uniquenessViolation({ fields: [ '(attachment file names)' ], values: [ problem.problemDetails.values[1] ] }))
      )),

  // we have to implement our own update here since submission attachments have no
  // int id primary key; it's just a join table.
  // here we don't do .returning('*') and give back the new record since it's a
  // big binary blob we'd rather not ship around all over.
  update: (sa) => ({ db }) =>
    db.update({ blobId: sa.blobId }).into('submission_attachments')
      .where({ submissionDefId: sa.submissionDefId, name: sa.name })
      .then(wasUpdateSuccessful),

  // Returns a hybrid set of information from the Attachments and Blobs tables.
  streamForExport: (formId, keyIds = []) => ({ db }) =>
    db
      .select('submission_attachments.name', 'blobs.content', 'submission_attachments.index', 'form_defs.keyId', 'submissions.instanceId', 'submission_defs.localKey')
      .from('submission_defs')
      .where({ 'submissions.formId': formId, deletedAt: null })
      .innerJoin(
        db.select(db.raw('max(id) as id'))
          .from('submission_defs')
          .groupBy('submissionId')
          .as('latest'),
        'submission_defs.id', 'latest.id'
      )
      .innerJoin('submissions', 'submissions.id', 'submission_defs.submissionId')
      .innerJoin('form_defs', 'submission_defs.formDefId', 'form_defs.id')
      .innerJoin('submission_attachments', 'submission_attachments.submissionDefId', 'latest.id')
      .innerJoin('blobs', 'blobs.id', 'submission_attachments.blobId')
      .whereRaw('submission_attachments.name is distinct from submission_defs."encDataAttachmentName"')
      .where((where) => where
        .whereNull('form_defs.keyId')
        .orWhereIn('form_defs.keyId', keyIds))
      .stream()
};

