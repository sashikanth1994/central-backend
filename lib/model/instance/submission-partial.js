// Copyright 2019 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

// SubmissionPartials are created solely by way of SubmissionPartial.fromXml
// given a submission XML file. XML parsing work is done, and critical information
// is extracted like the instanceId and the form version. This data is then stored
// on a SubmissionPartial instance, which has a #createAll method that can reify
// the temporary data into a real pair of Submission/SubmissionDef records
// in the database.

const uuid = require('uuid/v4');
const Instance = require('./instance');
const Option = require('../../util/option');
const Problem = require('../../util/problem');
const { consumeAndBuffer } = require('../../util/stream');
const { blankStringToNull } = require('../../util/util');
const { traverseXml, findOne, root, node, attr, text } = require('../../util/xml');


module.exports = Instance()(({ submissions, SubmissionPartial }) => class {

  // returns a { submission, submissionDef } object.
  createAll(form, maybeActor, deviceId = null) {
    // TODO it's awkward that this error/message is thrown here; should be closer to edge, or in db.
    if (this.version !== form.def.version)
      throw Problem.user.unexpectedValue({ field: 'version', value: this.version, reason: 'The submission could not be accepted because your copy of this form is an outdated version. Please get the latest version and try again.' });

    const actorId = Option.of(maybeActor).map((actor) => actor.id).orNull();
    const formattedDeviceId = blankStringToNull(deviceId);
    return submissions.create(this, form, actorId, formattedDeviceId);
  }

  // just a stub for now; we don't need this feature just yet.
  //createVersion(form, submission, maybeActor) { throw new Error('NYI'); }

  // Because the XML alone does not include information on the internal sequential
  // integer ID of the Form it is related to or the Actor that is creating it, this
  // method returns a PartialSubmission, which lacks that information. Call
  // .complete(form, maybeActor) on the PartialSubmission to get a true Submission.
  static fromXml(input) {
    const extract = (s) => traverseXml(s, [
      // we always expect these bits.
      attr('id'),
      findOne(root(), node('meta'), node('instanceID'))(text()),
      findOne(root(), node('instanceID'))(text()),
      attr('version'),

      // these bits will only exist on encrypted envelopes.
      findOne(root(), node('base64EncryptedKey'))(text()),
      findOne(root(), node('encryptedXmlFile'))(text()),
      findOne(root(), node('base64EncryptedElementSignature'))(text())
    ]);

    const process = (typeof input.pipe === 'function')
      ? consumeAndBuffer(input, extract)
      : Promise.all([ extract(input), Promise.resolve(input) ]);

    return process
      .then(([ [ idText, metaInstanceId, attrInstanceId, versionText, localKeyText, encDataAttachmentNameText, signatureText ], xml ]) => {
        const xmlFormId = idText.map(blankStringToNull).orElseGet(() => {
          throw Problem.user.missingParameter({ field: 'form ID xml attribute' });
        });
        const instanceId = metaInstanceId.orElseGet(() => attrInstanceId.orElseGet(uuid));
        const version = versionText.orElse('');

        const localKey = localKeyText.orNull();
        const encDataAttachmentName = encDataAttachmentNameText.orNull();
        const signature = signatureText.orNull();

        return new SubmissionPartial({
          xmlFormId, instanceId, version, xml,
          localKey, encDataAttachmentName, signature
        });
      });
  }
});

