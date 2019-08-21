const should = require('should');
const { DateTime } = require('luxon');

should.Assertion.add('httpDate', function() {
  this.params = { operator: 'to be an HTTP date string' };
  DateTime.fromHTTP(this.obj).isValid.should.equal(true);
});

should.Assertion.add('isoDate', function() {
  this.params = { operator: 'to be an ISO date string' };
  DateTime.fromISO(this.obj).isValid.should.equal(true);
});

should.Assertion.add('recentIsoDate', function() {
  this.params = { operator: 'to be a recent ISO date string' };
  this.obj.should.be.an.isoDate();
  DateTime.fromISO(this.obj).plus({ minutes: 2 }).should.be.greaterThan(DateTime.local());
});

should.Assertion.add('token', function(length = 64) {
  this.params = { operator: 'to be a token string' };
  this.obj.should.match(new RegExp(`^[a-z0-9!$]{${length}}$`, 'i'));
});

should.Assertion.add('uuid', function() {
  this.params = { operator: 'to be a uuid string' };
  this.obj.should.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

should.Assertion.add('md5Sum', function() {
  this.params = { operator: 'to be an md5 sum string' };
  this.obj.should.match(/^[0-9a-f]{32}$/i);
});

should.Assertion.add('base64string', function() {
  this.params = { operator: 'to be a base64 string' };
  this.obj.should.match(/^[0-9a-z/+=]+$/i);
});

should.Assertion.add('Actor', function() {
  this.params = { operator: 'to be an Actor' };

  Object.keys(this.obj).should.containDeep([ 'createdAt', 'displayName', 'id', 'updatedAt' ]);
  this.obj.id.should.be.a.Number();
  this.obj.displayName.should.be.a.String();
  this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();

  should.not.exist(this.obj.acteeId);
  should.not.exist(this.obj.meta);
});

should.Assertion.add('User', function() {
  this.params = { operator: 'to be a User' };

  this.obj.should.be.an.Actor();
  Object.keys(this.obj).should.containDeep([ 'email' ]);
  this.obj.email.should.be.a.String();
});

should.Assertion.add('Submission', function() {
  this.params = { operator: 'to be a Submission' };

  Object.keys(this.obj).should.containDeep([ 'instanceId', 'createdAt', 'updatedAt', 'submitterId' ]);
  this.obj.instanceId.should.be.a.String();
  this.obj.submitterId.should.be.a.Number();
  this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();
});

should.Assertion.add('ExtendedSubmission', function() {
  this.params = { operator: 'to be an extended Submission' };

  Object.keys(this.obj).should.containDeep([ 'instanceId', 'createdAt', 'updatedAt', 'submitter' ]);
  this.obj.instanceId.should.be.a.String();
  this.obj.submitter.should.be.an.Actor();
  this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();
});

should.Assertion.add('Session', function() {
  this.params = { operator: 'to be a Session' };

  Object.keys(this.obj).should.containDeep([ 'expiresAt', 'createdAt', 'token' ]);
  this.obj.expiresAt.should.be.an.isoDate();
  this.obj.createdAt.should.be.an.isoDate();
  this.obj.token.should.be.a.token();
});

should.Assertion.add('FieldKey', function() {
  this.params = { operator: 'to be a Field Key' };

  should(this.obj).be.an.Actor();
  Object.keys(this.obj).should.containDeep([ 'createdBy', 'token' ]);
  if (this.obj.token != null) this.obj.token.should.be.a.token();
});

should.Assertion.add('ExtendedFieldKey', function() {
  this.params = { operator: 'to be an Extended Field Key' };

  should(this.obj).be.a.FieldKey();
  this.obj.createdBy.should.be.an.Actor();
  this.obj.should.have.property('lastUsed');
  if (this.obj.lastUsed != null) this.obj.lastUsed.should.be.an.isoDate();
});

should.Assertion.add('Form', function() {
  this.params = { operator: 'to be a Form' };

  Object.keys(this.obj).should.containDeep([ 'projectId', 'xmlFormId', 'createdAt', 'updatedAt', 'name', 'version', 'hash' ]);
  this.obj.projectId.should.be.a.Number();
  this.obj.xmlFormId.should.be.a.String();
  this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();
  if (this.obj.name != null) this.obj.name.should.be.a.String();
  if (this.obj.version != null) this.obj.version.should.be.a.String();
  this.obj.hash.should.be.an.md5Sum();
});

should.Assertion.add('ExtendedForm', function() {
  this.params = { operator: 'to be a ExtendedForm' };

  this.obj.should.be.a.Form();
  Object.keys(this.obj).should.containDeep([ 'submissions', 'lastSubmission' ]);
  if (this.obj.submissions != null) this.obj.submissions.should.be.a.Number();
  if (this.obj.lastSubmission != null) this.obj.lastSubmission.should.be.an.isoDate();
});

should.Assertion.add('Project', function() {
  this.params = { operator: 'to be a Project' };

  Object.keys(this.obj).should.containDeep([ 'id', 'name', 'createdAt', 'updatedAt' ]);
  this.obj.id.should.be.a.Number();
  this.obj.name.should.be.a.String();
  this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();
});

should.Assertion.add('ExtendedProject', function() {
  this.params = { operator: 'to be a Project' };

  this.obj.should.be.a.Project();
  Object.keys(this.obj).should.containDeep([ 'forms', 'appUsers', 'lastSubmission' ]);
  this.obj.forms.should.be.a.Number();
  this.obj.appUsers.should.be.a.Number();
  if (this.obj.lastSubmission != null) this.obj.lastSubmission.should.be.an.isoDate();
});

should.Assertion.add('Role', function() {
  this.params = { operator: 'to be a Role' };

  Object.keys(this.obj).should.containDeep([ 'id', 'name', 'verbs', 'createdAt', 'updatedAt' ]);
  if (this.obj.system != null) this.obj.system.should.be.a.String();
  this.obj.verbs.should.an.Array();
  this.obj.verbs.forEach((verb) => verb.should.be.a.String());
  if (this.obj.createdAt != null) this.obj.createdAt.should.be.an.isoDate();
  if (this.obj.updatedAt != null) this.obj.updatedAt.should.be.an.isoDate();
});

should.Assertion.add('Audit', function() {
  this.params = { operator: 'to be an Audit' };

  Object.keys(this.obj).should.containDeep([ 'actorId', 'action', 'acteeId', 'details', 'loggedAt' ]);
  this.obj.actorId.should.be.a.Number();
  this.obj.action.should.be.a.String();
  this.obj.acteeId.should.be.a.uuid();
  this.obj.loggedAt.should.be.an.isoDate();
});

should.Assertion.add('Key', function() {
  this.params = { operator: 'to be an Key' };

  Object.keys(this.obj).should.containDeep([ 'hint', 'managed', 'public' ]);
});

should.Assertion.add('SimpleCsv', function() {
  this.params = { operator: 'to be a full simple.csv export with three rows' };

  const csv = this.obj.split('\n').map((row) => row.split(','));
  csv.length.should.equal(5); // header + 3 data rows + newline
  csv[0].should.eql([ 'SubmissionDate', 'meta-instanceID', 'name', 'age', 'KEY', 'SubmitterID', 'SubmitterName', 'Status' ]);
  csv[1].shift().should.be.an.recentIsoDate();
  csv[1].should.eql([ 'three','Chelsea','38','three','5','Alice' ]);
  csv[2].shift().should.be.an.recentIsoDate();
  csv[2].should.eql([ 'two','Bob','34','two','5','Alice' ]);
  csv[3].shift().should.be.an.recentIsoDate();
  csv[3].should.eql([ 'one','Alice','30','one','5','Alice' ]);
  csv[4].should.eql([ '' ]);
});

