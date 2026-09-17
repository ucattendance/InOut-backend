'use strict';

const assert = require('assert');
const role = require('../middleware/role');

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

const mockRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const runRoleCheck = (userRole, requiredRole) => {
  const roleMw = role(requiredRole);
  const res = mockRes();
  let nextCalled = false;
  roleMw({ user: { role: userRole } }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
};

const adminOnlyRoutes = [
  'holiday: get all',
  'holiday: create',
  'holiday: filter',
  'holiday: update',
  'holiday: delete',
  'schedule: get all',
  'schedule: update',
];

for (const route of adminOnlyRoutes) {
  try {
    const { res, nextCalled } = runRoleCheck('employee', 'admin');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(nextCalled, false);
    pass(`${route}: employee is denied`);
  } catch (e) {
    fail(`${route}: employee is denied`, e);
  }

  try {
    const { res, nextCalled } = runRoleCheck('admin', 'admin');
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200);
    pass(`${route}: admin is allowed`);
  } catch (e) {
    fail(`${route}: admin is allowed`, e);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
