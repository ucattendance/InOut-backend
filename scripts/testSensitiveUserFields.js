'use strict';

const assert = require('assert');
const {
  canViewSensitiveFields,
  maskSensitiveUserFields,
  maskSensitiveUserList,
  MASK,
} = require('../utils/sensitiveUserFields');

let passed = 0;
let failed = 0;

const pass = (name) => {
  passed += 1;
  console.log(`PASS  ${name}`);
};

const fail = (name, err) => {
  failed += 1;
  console.error(`FAIL  ${name}`);
  console.error(err && err.stack ? err.stack : err);
};

const sampleUser = {
  _id: 'user-1',
  name: 'Alice',
  salary: 50000,
  pan: 'ABCDE1234F',
  uan: '123456789012',
  esiNumber: 'ESI001',
  empGrade: 'L2',
  bankDetails: {
    bankingName: 'Alice Smith',
    bankAccountNumber: '1234567890',
    ifscCode: 'HDFC0001234',
    upiId: 'alice@upi',
    officeBranch: 'Chennai',
  },
};

try {
  assert.strictEqual(canViewSensitiveFields({ _id: 'admin-1', role: 'admin' }, 'user-1'), true);
  assert.strictEqual(canViewSensitiveFields({ _id: 'user-1', role: 'employee' }, 'user-1'), true);
  assert.strictEqual(canViewSensitiveFields({ _id: 'user-2', role: 'employee' }, 'user-1'), false);
  pass('canViewSensitiveFields: admin and self only');
} catch (e) {
  fail('canViewSensitiveFields: admin and self only', e);
}

try {
  const adminView = maskSensitiveUserFields(sampleUser, { _id: 'admin-1', role: 'admin' });
  assert.strictEqual(adminView.salary, 50000);
  assert.strictEqual(adminView.bankDetails.bankAccountNumber, '1234567890');
  pass('mask: admin sees full salary and bank details');
} catch (e) {
  fail('mask: admin sees full salary and bank details', e);
}

try {
  const selfView = maskSensitiveUserFields(sampleUser, { _id: 'user-1', role: 'employee' });
  assert.strictEqual(selfView.salary, 50000);
  assert.strictEqual(selfView.bankDetails.bankAccountNumber, '1234567890');
  pass('mask: user sees own salary and bank details');
} catch (e) {
  fail('mask: user sees own salary and bank details', e);
}

try {
  const peerView = maskSensitiveUserFields(sampleUser, { _id: 'user-2', role: 'employee' });
  assert.strictEqual(peerView.salary, undefined);
  assert.strictEqual(peerView.pan, undefined);
  assert.strictEqual(peerView.uan, undefined);
  assert.strictEqual(peerView.esiNumber, undefined);
  assert.strictEqual(peerView.empGrade, undefined);
  assert.strictEqual(peerView.bankDetails.bankAccountNumber, MASK);
  assert.strictEqual(peerView.bankDetails.ifscCode, MASK);
  assert.strictEqual(peerView.bankDetails.officeBranch, 'Chennai');
  pass('mask: peer cannot see salary, statutory fields, or bank account; officeBranch kept');
} catch (e) {
  fail('mask: peer cannot see salary, statutory fields, or bank account; officeBranch kept', e);
}

try {
  const list = maskSensitiveUserList([sampleUser, { ...sampleUser, _id: 'user-2' }], {
    _id: 'user-2',
    role: 'employee',
  });
  assert.strictEqual(list[0].salary, undefined);
  assert.strictEqual(list[1].salary, 50000);
  pass('maskSensitiveUserList: applies per-target rules');
} catch (e) {
  fail('maskSensitiveUserList: applies per-target rules', e);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
