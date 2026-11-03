/**
 * Test Suite: One Device - One Account Login Restriction
 * Validates the core requirements:
 * 1. Device 1 -> Account A: Allowed
 * 2. Device 1 -> Account B: Blocked with message:
 *    "This device is already registered with another account. Only one account can be logged in from a single device."
 * 3. Device 2 -> Account B: Allowed
 * 4. Device 2 -> Account C: Blocked with message
 * 5. Device 1 -> Account A after logout: Allowed
 * 6. Multi-storage persistence and hardware fingerprint validation
 * 7. Admin Reset: Releases device association, allowing re-registration
 */

import assert from 'assert';

// Polyfill localStorage & WebSocket for Node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: k => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class DummyWebSocket {
    constructor() { this.readyState = 3; }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

const { authService, STUDENT_ACCOUNTS } = await import('../src/data/authService.js');
const { deviceService, ONE_ACCOUNT_PER_DEVICE_ERROR } = await import('../src/data/deviceService.js');

let totalTests = 0;
let passedTests = 0;

function assertTest(condition, description, detail = '') {
  totalTests++;
  try {
    assert(condition, `${description} ${detail}`);
    passedTests++;
    console.log(`  [PASS] ${description} ${detail ? `(${detail})` : ''}`);
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log('ONE DEVICE – ONE ACCOUNT LOGIN RESTRICTION TEST SUITE');
console.log('================================================================\n');

// Clean up any test device bindings before starting
const dev1_id = 'dev_test_device_alpha_1';
const dev1_hw = 'hw_fingerprint_alpha_1';

const dev2_id = 'dev_test_device_beta_2';
const dev2_hw = 'hw_fingerprint_beta_2';

await deviceService.adminResetDeviceBinding({ deviceId: dev1_id, requestingRole: 'admin' });
await deviceService.adminResetDeviceBinding({ deviceId: dev2_id, requestingRole: 'admin' });

// Test accounts from the enrolled 18 students
const accountA = STUDENT_ACCOUNTS.find(a => a.student_id === 'std-1'); // KAVINRAJ M
const accountB = STUDENT_ACCOUNTS.find(a => a.student_id === 'std-2'); // Lokeshwaran M
const accountC = STUDENT_ACCOUNTS.find(a => a.student_id === 'std-3'); // Naveen Sushant G

assertTest(Boolean(accountA && accountB && accountC), 'Verified official test student accounts exist');

// -----------------------------------------------------------------------------
// Test 1: Device 1 -> Account A: Allowed
// -----------------------------------------------------------------------------
console.log('--- Test 1: Device 1 -> Account A: Allowed ---');
const loginResult1 = await authService.signIn({
  fullName: accountA.student_name,
  identifier: accountA.email,
  password: accountA.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev1_id,
  hardwareHash: dev1_hw
});

assertTest(loginResult1.success === true, 'Device 1 successfully authenticates Account A (KAVINRAJ M)', loginResult1.message);
assertTest(loginResult1.user.student_id === 'std-1', 'Authenticated student_id is std-1');

// Verify that Device 1 is now bound to Account A
const bindingsAfterLogin1 = await deviceService.getAllRegisteredDevices();
const dev1Binding = bindingsAfterLogin1.find(b => b.device_id === dev1_id);
assertTest(Boolean(dev1Binding), 'Device 1 binding exists in authoritative device registry');
assertTest(dev1Binding.student_id === 'std-1', 'Device 1 is bound specifically to Account A (std-1)');
console.log('');

// -----------------------------------------------------------------------------
// Test 2: Device 1 -> Account B: Blocked
// -----------------------------------------------------------------------------
console.log('--- Test 2: Device 1 -> Account B: Blocked ---');
const loginResult2 = await authService.signIn({
  fullName: accountB.student_name,
  identifier: accountB.email,
  password: accountB.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev1_id,
  hardwareHash: dev1_hw
});

assertTest(loginResult2.success === false, 'Device 1 rejects login attempt from Account B (Lokeshwaran M)');
assertTest(
  loginResult2.message === ONE_ACCOUNT_PER_DEVICE_ERROR,
  'Returns exact required error message',
  loginResult2.message
);
assertTest(
  loginResult2.code === 'DEVICE_ACCOUNT_RESTRICTION',
  'Flags error with DEVICE_ACCOUNT_RESTRICTION code'
);
console.log('');

// -----------------------------------------------------------------------------
// Test 3: Device 2 -> Account B: Allowed
// -----------------------------------------------------------------------------
console.log('--- Test 3: Device 2 -> Account B: Allowed ---');
const loginResult3 = await authService.signIn({
  fullName: accountB.student_name,
  identifier: accountB.email,
  password: accountB.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev2_id,
  hardwareHash: dev2_hw
});

assertTest(loginResult3.success === true, 'Device 2 successfully authenticates Account B (Lokeshwaran M)', loginResult3.message);
assertTest(loginResult3.user.student_id === 'std-2', 'Authenticated student_id is std-2');

const bindingsAfterLogin3 = await deviceService.getAllRegisteredDevices();
const dev2Binding = bindingsAfterLogin3.find(b => b.device_id === dev2_id);
assertTest(Boolean(dev2Binding), 'Device 2 binding exists in authoritative device registry');
assertTest(dev2Binding.student_id === 'std-2', 'Device 2 is bound specifically to Account B (std-2)');
console.log('');

// -----------------------------------------------------------------------------
// Test 4: Device 2 -> Account C: Blocked
// -----------------------------------------------------------------------------
console.log('--- Test 4: Device 2 -> Account C: Blocked ---');
const loginResult4 = await authService.signIn({
  fullName: accountC.student_name,
  identifier: accountC.email,
  password: accountC.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev2_id,
  hardwareHash: dev2_hw
});

assertTest(loginResult4.success === false, 'Device 2 rejects login attempt from Account C (Naveen Sushant G)');
assertTest(
  loginResult4.message === ONE_ACCOUNT_PER_DEVICE_ERROR,
  'Returns exact required error message',
  loginResult4.message
);
console.log('');

// -----------------------------------------------------------------------------
// Test 5: Logout Behaviour & Re-Login (Device 1 -> Account A after logout: Allowed)
// -----------------------------------------------------------------------------
console.log('--- Test 5: Logout Behaviour & Re-Login (Device 1 -> Account A: Allowed) ---');
// Perform logout
await authService.signOut();
assertTest(authService.isAuthenticated() === false, 'User session successfully cleared on logout');

// Verify that Device 1 association is NOT deleted by logout
const bindingsAfterLogout = await deviceService.getAllRegisteredDevices();
const dev1StillBound = bindingsAfterLogout.find(b => b.device_id === dev1_id);
assertTest(Boolean(dev1StillBound), 'Logging out does NOT remove the device association');
assertTest(dev1StillBound.student_id === 'std-1', 'Device 1 remains associated with Account A');

// Attempt Account B login on Device 1 after logout (Must still be BLOCKED)
const loginResult5Blocked = await authService.signIn({
  fullName: accountB.student_name,
  identifier: accountB.email,
  password: accountB.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev1_id,
  hardwareHash: dev1_hw
});
assertTest(loginResult5Blocked.success === false, 'Device 1 still blocks Account B even after Account A logged out');
assertTest(loginResult5Blocked.message === ONE_ACCOUNT_PER_DEVICE_ERROR, 'Error message remains exact');

// Attempt Account A login on Device 1 after logout (MUST BE ALLOWED)
const loginResult5Allowed = await authService.signIn({
  fullName: accountA.student_name,
  identifier: accountA.email,
  password: accountA.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev1_id,
  hardwareHash: dev1_hw
});
assertTest(loginResult5Allowed.success === true, 'Device 1 allows Account A to log in again after logout', loginResult5Allowed.message);
assertTest(loginResult5Allowed.user.student_id === 'std-1', 'Authenticated student_id is std-1');
console.log('');

// -----------------------------------------------------------------------------
// Test 6: Incognito / Cross-Browser Hardware Fingerprint Bypass Protection
// -----------------------------------------------------------------------------
console.log('--- Test 6: Hardware Fingerprint Bypass Protection (Incognito / New Browser on same machine) ---');
// Even if deviceId cookie/localStorage is cleared (new deviceId generated), matching hardwareHash blocks Account B
const incognitoDeviceId = 'dev_new_incognito_' + Date.now();
const incognitoResult = await authService.signIn({
  fullName: accountA.student_name,
  identifier: accountA.email,
  password: accountA.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: incognitoDeviceId,
  hardwareHash: dev1_hw // Same physical GPU/canvas/hardware fingerprint
});
assertTest(incognitoResult.success === true, 'Allows Account A on same machine even with fresh browser session');

const incognitoIntruderResult = await authService.signIn({
  fullName: accountB.student_name,
  identifier: accountB.email,
  password: accountB.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: incognitoDeviceId,
  hardwareHash: dev1_hw // Same physical machine
});
assertTest(incognitoIntruderResult.success === false, 'Blocks Account B on same hardware even with fresh browser token');
assertTest(incognitoIntruderResult.message === ONE_ACCOUNT_PER_DEVICE_ERROR, 'Exact block message returned');
console.log('');

// -----------------------------------------------------------------------------
// Test 7: Administrator Reset Capability
// -----------------------------------------------------------------------------
console.log('--- Test 7: Authorized Administrator Reset Capability ---');
// Unauthorized student cannot reset device association
const unauthReset = await deviceService.adminResetDeviceBinding({
  deviceId: dev1_id,
  requestingRole: 'student'
});
assertTest(unauthReset.success === false, 'Rejects reset attempt by non-administrator');

// Authorized Administrator releases Device 1
const adminReset = await deviceService.adminResetDeviceBinding({
  deviceId: dev1_id,
  requestingRole: 'admin'
});
assertTest(adminReset.success === true, 'Administrator successfully releases Device 1 association');

// Now Account B CAN be associated with Device 1
const loginResult7 = await authService.signIn({
  fullName: accountB.student_name,
  identifier: accountB.email,
  password: accountB.defaultPassword,
  role: 'student',
  isGpsVerified: true,
  deviceId: dev1_id,
  hardwareHash: dev1_hw
});
assertTest(loginResult7.success === true, 'Device 1 is now successfully re-assigned to Account B after admin reset');

// Clean up test bindings
await deviceService.adminResetDeviceBinding({ deviceId: dev1_id, requestingRole: 'admin' });
await deviceService.adminResetDeviceBinding({ deviceId: dev2_id, requestingRole: 'admin' });
console.log('');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('================================================================');
console.log(`ALL DEVICE RESTRICTION TESTS PASSED: ${passedTests} / ${totalTests} assertions passed.`);
console.log('One Device – One Account Policy Verified Successfully.');
console.log('================================================================\n');

process.exit(0);

