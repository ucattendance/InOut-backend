'use strict';

/**
 * Duplicate attendance guard tests.
 * Run: node scripts/testAttendanceDuplicateGuard.js
 */
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const Attendance = require('../models/Attendance');
const {
  validateMarkAttendance,
  getIstDayBounds,
} = require('../utils/attendanceGuard');

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

const userId = new mongoose.Types.ObjectId();
const { start: dayStart } = getIstDayBounds(new Date());
const midDay = new Date(dayStart.getTime() + 4 * 60 * 60 * 1000);

const originalFind = Attendance.find.bind(Attendance);

const mockTodayRecords = (records) => {
  Attendance.find = (query) => {
    assert.ok(query.$or, 'expected userIdFilters in query');
    assert.ok(query.timestamp, 'expected IST day bounds in query');

    const chain = {
      sort() {
        return this;
      },
      select() {
        return this;
      },
      async lean() {
        return records;
      },
    };
    return chain;
  };
};

const restoreFind = () => {
  Attendance.find = originalFind;
};

(async () => {
  try {
    const bounds = getIstDayBounds(new Date('2026-08-28T12:00:00+05:30'));
    assert.strictEqual(bounds.dateKey, '2026-08-28');
    assert.ok(bounds.start < bounds.end);
    pass('unit: IST day bounds use Asia/Kolkata calendar day');
  } catch (e) {
    fail('unit: IST day bounds use Asia/Kolkata calendar day', e);
  }

  try {
    mockTodayRecords([]);
    const result = await validateMarkAttendance(userId, 'check-in', midDay);
    assert.strictEqual(result.ok, true);
    pass('guard: first check-in of the day is allowed');
  } catch (e) {
    fail('guard: first check-in of the day is allowed', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([{ type: 'check-in', timestamp: midDay }]);
    const result = await validateMarkAttendance(userId, 'check-in', midDay);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 409);
    assert.strictEqual(result.code, 'DUPLICATE_CHECK_IN');
    pass('guard: duplicate check-in is rejected');
  } catch (e) {
    fail('guard: duplicate check-in is rejected', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([{ type: 'check-in', timestamp: midDay }]);
    const result = await validateMarkAttendance(userId, 'check-out', midDay);
    assert.strictEqual(result.ok, true);
    pass('guard: check-out after check-in is allowed');
  } catch (e) {
    fail('guard: check-out after check-in is allowed', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([]);
    const result = await validateMarkAttendance(userId, 'check-out', midDay);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'CHECKOUT_WITHOUT_CHECKIN');
    pass('guard: check-out without check-in is rejected');
  } catch (e) {
    fail('guard: check-out without check-in is rejected', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([
      { type: 'check-in', timestamp: midDay },
      { type: 'check-out', timestamp: new Date(midDay.getTime() + 60 * 60 * 1000) },
    ]);
    const result = await validateMarkAttendance(userId, 'check-out', midDay);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'DUPLICATE_CHECK_OUT');
    pass('guard: duplicate check-out is rejected');
  } catch (e) {
    fail('guard: duplicate check-out is rejected', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([
      { type: 'check-in', timestamp: midDay },
      { type: 'check-out', timestamp: new Date(midDay.getTime() + 60 * 60 * 1000) },
    ]);
    const result = await validateMarkAttendance(userId, 'check-in', midDay);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ATTENDANCE_DAY_COMPLETE');
    pass('guard: check-in after day complete is rejected');
  } catch (e) {
    fail('guard: check-in after day complete is rejected', e);
  } finally {
    restoreFind();
  }

  try {
    mockTodayRecords([{ type: 'check-out', timestamp: midDay }]);
    const result = await validateMarkAttendance(userId, 'check-in', midDay);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ATTENDANCE_DAY_COMPLETE');
    pass('guard: check-in when only check-out exists is rejected');
  } catch (e) {
    fail('guard: check-in when only check-out exists is rejected', e);
  } finally {
    restoreFind();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
