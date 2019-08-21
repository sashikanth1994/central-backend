// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.


const { join } = require('path');
const { zipPart } = require('../util/zip');
const sanitize = require('sanitize-filename');

// Given the Postgres rowstream returned by SubmissionAttachment.streamForExport
// here we use the util/zip multifile zipstreamer to archive all attachments into
// the archive. Will decrypt contents with the decryptor if necessary.
const streamAttachments = (inStream, decryptor) => {
  const archive = zipPart();

  // this sanitization means that two filenames could end up identical.
  // luckily, this is not actually illegal in the zip spec; two files can live at precisely
  // the same location, and the conflict is dealt with interactively by the unzipping client.
  inStream.on('data', (att) => {
    const content = (att.localKey == null)
      ? att.content
      : decryptor(att.content, att.keyId, att.localKey, att.instanceId, att.index);

    archive.append(content, { name: join('media', sanitize(att.name)) });
  });
  inStream.on('end', () => archive.finalize());

  return archive;
};

module.exports = { streamAttachments };

