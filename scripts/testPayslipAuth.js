'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'payslip-auth-test-secret';

const auth = require('../middleware/auth');
const role = require('../middleware/role');
const Payslip = require('../models/Payslip');
const { getPayslips } = require('../controllers/payslipController');

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

const runAuth = (req) => {
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
};

try {
  const { res, nextCalled } = runAuth({ headers: {} });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  pass('auth: missing Authorization header is denied');
} catch (e) {
  fail('auth: missing Authorization header is denied', e);
}

try {
  const { res, nextCalled } = runAuth({
    headers: { authorization: 'Bearer not-a-jwt' },
  });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  pass('auth: invalid token is denied');
} catch (e) {
  fail('auth: invalid token is denied', e);
}

try {
  const token = jwt.sign(
    { userId: 'emp1', role: 'employee', name: 'Emp', email: 'e@x.com' },
    process.env.JWT_SECRET
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const { res, nextCalled } = runAuth(req);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(req.user.role, 'employee');
  assert.strictEqual(req.user._id, 'emp1');
  pass('auth: valid Bearer JWT is accepted');
} catch (e) {
  fail('auth: valid Bearer JWT is accepted', e);
}

try {
  const roleMw = role('admin');
  const res = mockRes();
  let nextCalled = false;
  roleMw({ user: { role: 'employee' } }, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(nextCalled, false);
  pass('create: employee cannot create payslip');
} catch (e) {
  fail('create: employee cannot create payslip', e);
}

try {
  const roleMw = role('admin');
  const res = mockRes();
  let nextCalled = false;
  roleMw({ user: { role: 'admin' } }, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, 200);
  pass('create: admin can create payslip');
} catch (e) {
  fail('create: admin can create payslip', e);
}

const withFindMock = async (fn) => {
  const originalFind = Payslip.find;
  const calls = [];
  Payslip.find = (filter) => {
    calls.push(filter);
    return {
      sort: async () => [{ _id: 'p1', userId: filter.userId || 'all' }],
    };
  };
  try {
    await fn(calls);
  } finally {
    Payslip.find = originalFind;
  }
};

(async () => {
  try {
    await withFindMock(async (calls) => {
      const res = mockRes();
      await getPayslips({ user: { _id: 'emp1', role: 'employee' } }, res);
      assert.deepStrictEqual(calls[0], { userId: 'emp1' });
      assert.strictEqual(res.body[0].userId, 'emp1');
    });
    pass('get: employee query is scoped to own userId');
  } catch (e) {
    fail('get: employee query is scoped to own userId', e);
  }

  try {
    await withFindMock(async (calls) => {
      const res = mockRes();
      await getPayslips({ user: { _id: 'admin1', role: 'admin' } }, res);
      assert.deepStrictEqual(calls[0], {});
    });
    pass('get: admin query is unscoped');
  } catch (e) {
    fail('get: admin query is unscoped', e);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
