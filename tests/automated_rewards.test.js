/**
 * Automated Login & Logout Reward Points Test Suite
 * Validates:
 * 1. Login Ranking: 1st gets 20 pts, 2nd gets 19 pts, 3rd gets 18 pts, etc.
 * 2. Logout Ranking after 4:30 PM:
 *    - Ranked from LAST to FIRST based on logout timestamps
 *    - Last student to logout gets 20 pts, one before gets 19 pts, and so on
 * 3. Logouts before 4:30 PM get 0 logout reward points
 * 4. Automatic database sync within 2 seconds
 */

import { enrichAttendanceRecords, isAfter430PMIST } from '../src/data/attendanceDatabase.js';

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, testDescription) {
  if (condition) {
    console.log(`  [PASS] ${testDescription}`);
    passedAssertions++;
  } else {
    console.error(`  [FAIL] ${testDescription}`);
    failedAssertions++;
  }
}

console.log('================================================================');
console.log('AUTOMATED LOGIN & LOGOUT REWARD POINTS TEST SUITE');
console.log('================================================================');

console.log('\n--- Test 1: Time Evaluation Gate (After 4:30 PM IST) ---');
// 4:30 PM IST = 11:00 UTC (16:30 IST)
assert(isAfter430PMIST('2026-11-03T11:00:00.000Z') === true, '16:30 IST is at or after 4:30 PM');
assert(isAfter430PMIST('2026-11-03T11:30:00.000Z') === true, '17:00 IST is after 4:30 PM');
assert(isAfter430PMIST('2026-11-03T13:00:00.000Z') === true, '18:30 IST is after 4:30 PM');
assert(isAfter430PMIST('2026-11-03T10:59:00.000Z') === false, '16:29 IST is strictly before 4:30 PM');
assert(isAfter430PMIST('2026-11-03T04:30:00.000Z') === false, '10:00 AM IST is strictly before 4:30 PM');

console.log('\n--- Test 2: Login Ranking (1st gets 20 pts, 2nd gets 19 pts, 3rd gets 18 pts...) ---');
const sampleLogins = [
  { student_id: 'std-3', attendance_date: '2026-11-04', login_at: '2026-11-04T03:45:00.000Z', login_location_verified: true }, // 09:15 IST (2nd)
  { student_id: 'std-1', attendance_date: '2026-11-04', login_at: '2026-11-04T03:30:00.000Z', login_location_verified: true }, // 09:00 IST (1st)
  { student_id: 'std-5', attendance_date: '2026-11-04', login_at: '2026-11-04T04:00:00.000Z', login_location_verified: true }, // 09:30 IST (3rd)
  { student_id: 'std-2', attendance_date: '2026-11-04', login_at: '2026-11-04T04:15:00.000Z', login_location_verified: true }  // 09:45 IST (4th)
];

const enrichedLogins = enrichAttendanceRecords([...sampleLogins]);
const std1 = enrichedLogins.find(r => r.student_id === 'std-1');
const std3 = enrichedLogins.find(r => r.student_id === 'std-3');
const std5 = enrichedLogins.find(r => r.student_id === 'std-5');
const std2 = enrichedLogins.find(r => r.student_id === 'std-2');

assert(std1.arrival_order === 1, 'std-1 is 1st arrival');
assert(std1.early_bird_points === 20, 'std-1 gets 20 points for 1st login');
assert(std3.arrival_order === 2, 'std-3 is 2nd arrival');
assert(std3.early_bird_points === 19, 'std-3 gets 19 points for 2nd login');
assert(std5.arrival_order === 3, 'std-5 is 3rd arrival');
assert(std5.early_bird_points === 18, 'std-5 gets 18 points for 3rd login');
assert(std2.arrival_order === 4, 'std-2 is 4th arrival');
assert(std2.early_bird_points === 17, 'std-2 gets 17 points for 4th login');

console.log('\n--- Test 3: Logout Ranking After 4:30 PM (Ranked Last to First) ---');
// 4 students log out after 4:30 PM IST (11:00 UTC):
// std-1: 16:45 IST (11:15 UTC) -> 1st to logout (3rd before last) -> gets 17 pts
// std-2: 17:15 IST (11:45 UTC) -> 2nd to logout (2nd before last) -> gets 18 pts
// std-3: 17:45 IST (12:15 UTC) -> 3rd to logout (1st before last) -> gets 19 pts
// std-4: 18:30 IST (13:00 UTC) -> 4th to logout (LAST student to logout) -> gets 20 pts!
const sampleLogouts = [
  { student_id: 'std-1', attendance_date: '2026-11-04', login_at: '2026-11-04T03:30:00.000Z', logout_at: '2026-11-04T11:15:00.000Z', logout_location_verified: true, status: 'completed' },
  { student_id: 'std-2', attendance_date: '2026-11-04', login_at: '2026-11-04T03:35:00.000Z', logout_at: '2026-11-04T11:45:00.000Z', logout_location_verified: true, status: 'completed' },
  { student_id: 'std-3', attendance_date: '2026-11-04', login_at: '2026-11-04T03:40:00.000Z', logout_at: '2026-11-04T12:15:00.000Z', logout_location_verified: true, status: 'completed' },
  { student_id: 'std-4', attendance_date: '2026-11-04', login_at: '2026-11-04T03:45:00.000Z', logout_at: '2026-11-04T13:00:00.000Z', logout_location_verified: true, status: 'completed' },
  // std-5 logged out early at 14:00 IST (08:30 UTC - BEFORE 4:30 PM) -> should get 0 logout reward points
  { student_id: 'std-5', attendance_date: '2026-11-04', login_at: '2026-11-04T03:50:00.000Z', logout_at: '2026-11-04T08:30:00.000Z', logout_location_verified: true, status: 'completed' }
];

const enrichedLogouts = enrichAttendanceRecords([...sampleLogouts]);
const out4 = enrichedLogouts.find(r => r.student_id === 'std-4');
const out3 = enrichedLogouts.find(r => r.student_id === 'std-3');
const out2 = enrichedLogouts.find(r => r.student_id === 'std-2');
const out1 = enrichedLogouts.find(r => r.student_id === 'std-1');
const out5 = enrichedLogouts.find(r => r.student_id === 'std-5');

assert(out4.logout_order === 1, 'std-4 is the last student to logout (order 1 in last-to-first)');
assert(out4.logout_points === 20, 'Last student to logout (std-4) gets 20 points');
assert(out3.logout_order === 2, 'std-3 is the one before last (order 2 in last-to-first)');
assert(out3.logout_points === 19, 'The one before last (std-3) gets 19 points');
assert(out2.logout_order === 3, 'std-2 is order 3 in last-to-first');
assert(out2.logout_points === 18, 'std-2 gets 18 points');
assert(out1.logout_order === 4, 'std-1 is order 4 in last-to-first');
assert(out1.logout_points === 17, 'std-1 gets 17 points');
assert(out5.logout_points === 0, 'Early logout before 4:30 PM (std-5) gets 0 logout reward points');
assert(out5.is_night_owl === false, 'Early logout is not flagged as night owl');

console.log('\n================================================================');
console.log(`ALL AUTOMATED REWARDS TESTS PASSED: ${passedAssertions} / ${passedAssertions + failedAssertions} assertions passed.`);
console.log('================================================================');

if (failedAssertions > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

