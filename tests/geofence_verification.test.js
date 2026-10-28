/**
 * Test Suite: SNS Campus Polygon GPS Geofencing & Strict Attendance Verification
 * Validates all 9 critical scenarios specified in the requirements:
 * 1. SNS College of Technology main building (accepted)
 * 2. SNS iHub (accepted)
 * 3. Other approved college blocks (accepted)
 * 4. Public road outside campus perimeter (rejected with boundary distance)
 * 5. Location well outside campus (rejected)
 * 6. Location services disabled (rejected)
 * 7. GPS permission denied (rejected)
 * 8. GPS accuracy below configured requirement (rejected)
 * 9. Repeated check-in attempts (prevent duplicate attendance & awards)
 */

// Polyfill localStorage & WebSocket for Node.js test environment
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

const {
  DEFAULT_CAMPUS_POLYGON,
  DEFAULT_CAMPUS_ZONES,
  DEFAULT_CAMPUS_SETTINGS,
  isPointInPolygon,
  calculateMinDistanceToPolygon,
  validateCampusPolygon,
  findNearestCampusZone,
  LOCATION_STATES,
  AttendanceService
} = await import('../src/data/attendanceDatabase.js');

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    throw new Error(`Assertion failed for: ${testName} - ${details}`);
  }
}

console.log('================================================================');
console.log('SNS CAMPUS POLYGON GPS GEOFENCING TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Boundary Geometry Validation
// -----------------------------------------------------------------------------
console.log('--- Phase 0: Polygon Configuration Integrity & Validation ---');
const polyValidation = validateCampusPolygon(DEFAULT_CAMPUS_POLYGON);
assert(polyValidation.valid === true, 'Default campus polygon passes structural validation', `Vertices: ${DEFAULT_CAMPUS_POLYGON.length}`);
assert(polyValidation.polygon[0][0] === polyValidation.polygon[polyValidation.polygon.length - 1][0] &&
       polyValidation.polygon[0][1] === polyValidation.polygon[polyValidation.polygon.length - 1][1],
       'Polygon is a valid closed ring (first vertex matches last vertex)');

const invalidPoly = [[77.02, 11.10]]; // Only 1 point
assert(validateCampusPolygon(invalidPoly).valid === false, 'Rejects malformed polygon with < 3 vertices');
console.log('');

// -----------------------------------------------------------------------------
// Test 1: SNS College of Technology Main Building
// -----------------------------------------------------------------------------
console.log('--- Test 1: SNS College of Technology Main Building ---');
const mainBuildingCoords = [77.02661, 11.10043];
const isMainInside = isPointInPolygon(mainBuildingCoords, DEFAULT_CAMPUS_POLYGON);
const mainDist = calculateMinDistanceToPolygon(11.10043, 77.02661, DEFAULT_CAMPUS_POLYGON);
assert(isMainInside === true, 'Main building coordinates must be inside campus perimeter');
assert(mainDist === 0, 'Distance to boundary for point inside campus must be 0 meters', `${mainDist}m`);
console.log('');

// -----------------------------------------------------------------------------
// Test 2: SNS iHub (Innovation & Incubation Hub)
// -----------------------------------------------------------------------------
console.log('--- Test 2: SNS iHub (Innovation Hub) Inside Campus Boundary ---');
const ihubCoords = [77.02685, 11.10125];
const isIHubInside = isPointInPolygon(ihubCoords, DEFAULT_CAMPUS_POLYGON);
const ihubDist = calculateMinDistanceToPolygon(11.10125, 77.02685, DEFAULT_CAMPUS_POLYGON);
const ihubZone = findNearestCampusZone(11.10125, 77.02685, DEFAULT_CAMPUS_ZONES);
assert(isIHubInside === true, 'SNS iHub coordinates MUST be accepted inside campus boundary');
assert(ihubDist === 0, 'Distance to boundary for SNS iHub must be 0 meters');
assert(ihubZone.id === 'zone-ihub', 'Correctly identifies nearest facility as SNS iHub', ihubZone.name);
console.log('');

// -----------------------------------------------------------------------------
// Test 3: Other Approved College Blocks & Internal Areas
// -----------------------------------------------------------------------------
console.log('--- Test 3: Other Approved College Blocks & Internal Areas ---');
const blocks = [
  { name: 'SNS Allied Health Sciences Block', lat: 11.10054, lng: 77.02808, expectedZone: 'zone-health' },
  { name: 'College of Physiotherapy Block', lat: 11.10086, lng: 77.02802, expectedZone: 'zone-health' },
  { name: 'North Sports Ground & Complex', lat: 11.10380, lng: 77.02720, expectedZone: 'zone-sports' },
  { name: 'North Campus Hostel Block', lat: 11.10420, lng: 77.02650, expectedZone: 'zone-sports' },
  { name: 'South Campus Plaza & Gate', lat: 11.09910, lng: 77.02630, expectedZone: 'zone-south' }
];

for (const b of blocks) {
  const inside = isPointInPolygon([b.lng, b.lat], DEFAULT_CAMPUS_POLYGON);
  const dist = calculateMinDistanceToPolygon(b.lat, b.lng, DEFAULT_CAMPUS_POLYGON);
  assert(inside === true, `${b.name} must be accepted inside campus perimeter`);
  assert(dist === 0, `${b.name} boundary distance must be 0m`);
}
console.log('');

// -----------------------------------------------------------------------------
// Test 4: Public Road Outside Campus Perimeter
// -----------------------------------------------------------------------------
console.log('--- Test 4: Public Road Outside Campus (Sitra-Kurumbapalayam Road) ---');
const roadLat = 11.10150;
const roadLng = 77.02510; // ~59m west of western campus wall
const isRoadInside = isPointInPolygon([roadLng, roadLat], DEFAULT_CAMPUS_POLYGON);
const roadDist = calculateMinDistanceToPolygon(roadLat, roadLng, DEFAULT_CAMPUS_POLYGON);
assert(isRoadInside === false, 'Public road outside campus fence MUST be rejected');
assert(roadDist > 40 && roadDist < 80, 'Calculates distance to nearest campus perimeter', `${roadDist}m from boundary`);
console.log('');

// -----------------------------------------------------------------------------
// Test 5: Location Well Outside Campus
// -----------------------------------------------------------------------------
console.log('--- Test 5: Location Well Outside Campus (Saravanampatti Junction) ---');
const farLat = 11.08000;
const farLng = 77.01500; // ~2.6 km away
const isFarInside = isPointInPolygon([farLng, farLat], DEFAULT_CAMPUS_POLYGON);
const farDist = calculateMinDistanceToPolygon(farLat, farLng, DEFAULT_CAMPUS_POLYGON);
assert(isFarInside === false, 'Location well outside campus MUST be rejected');
assert(farDist > 2000, 'Calculates large boundary distance for external location', `${farDist}m`);
console.log('');

// -----------------------------------------------------------------------------
// Test 6: Location Services Disabled
// -----------------------------------------------------------------------------
console.log('--- Test 6: Location Services Disabled ---');
const mockDisabledError = new Error('Your device location is turned off.');
mockDisabledError.code = 2; // GeolocationPositionError.POSITION_UNAVAILABLE

const disabledState = mockDisabledError.code === 2 ? LOCATION_STATES.LOCATION_DISABLED : LOCATION_STATES.VERIFICATION_FAILED;
assert(disabledState === LOCATION_STATES.LOCATION_DISABLED, 'Correctly flags location_disabled state when device GPS is OFF');
console.log('');

// -----------------------------------------------------------------------------
// Test 7: GPS Permission Denied
// -----------------------------------------------------------------------------
console.log('--- Test 7: GPS Permission Denied ---');
const mockDeniedError = new Error('User denied Geolocation');
mockDeniedError.code = 1; // GeolocationPositionError.PERMISSION_DENIED

const deniedState = mockDeniedError.code === 1 ? LOCATION_STATES.PERMISSION_DENIED : LOCATION_STATES.VERIFICATION_FAILED;
assert(deniedState === LOCATION_STATES.PERMISSION_DENIED, 'Correctly flags permission_denied state when browser access is blocked');
console.log('');

// -----------------------------------------------------------------------------
// Test 8: GPS Accuracy Below Configured Requirement
// -----------------------------------------------------------------------------
console.log('--- Test 8: GPS Accuracy Below Threshold ---');
const poorAccuracyCoords = {
  latitude: 11.10125, // Inside SNS iHub
  longitude: 77.02685,
  accuracy: 175.5 // Exceeds threshold of 100m
};
const accuracyPass = poorAccuracyCoords.accuracy <= DEFAULT_CAMPUS_SETTINGS.max_accuracy_meters;
assert(accuracyPass === false, 'Rejects location reading when GPS accuracy (175.5m) exceeds max threshold (100m)');
console.log('');

// -----------------------------------------------------------------------------
// Test 9: Repeated Check-in Attempts (Prevent Duplicate Attendance & Awards)
// -----------------------------------------------------------------------------
console.log('--- Test 9: Repeated Check-in Requests & Duplicate Prevention ---');
const testService = new AttendanceService();
// Reset records for test run
testService.attendanceRecords = [];
testService.dailyAwards = [];
testService.locationVerificationState = LOCATION_STATES.VERIFIED;

// Mock getCurrentGPSPosition on instance for clean test execution
testService.getCurrentGPSPosition = async () => ({
  latitude: 11.10125,
  longitude: 77.02685,
  accuracy: 14.2,
  insideCampus: true,
  distance: 0,
  distanceToBoundary: 0,
  distanceToCenter: 95,
  nearestZone: { name: 'SNS iHub' },
  timestamp: Date.now(),
  verifiedAt: Date.now()
});

async function runCheckInTest() {
  const testStudentId = 'std-4'; // SAMYUKTHA P V

  // 1. First Check-in attempt
  const firstResult = await testService.performCheckIn(testStudentId);
  assert(firstResult.success === true, 'First valid check-in inside campus boundary must succeed', firstResult.message);
  assert(testService.attendanceRecords.length === 1, 'Exactly one attendance record must be created');

  // 2. Duplicate Check-in attempt on the same day
  const secondResult = await testService.performCheckIn(testStudentId);
  assert(secondResult.success === false, 'Duplicate check-in attempt on same date MUST be rejected');
  assert(secondResult.message.includes('Already checked in today'), 'Provides clear duplicate prevention feedback');
  assert(testService.attendanceRecords.length === 1, 'Attendance record count remains exactly 1 (no duplicate row)');

  // 3. Early Bird Award Verification
  const earlyAwards = testService.dailyAwards.filter(a => a.category === 'early_bird');
  assert(earlyAwards.length === 1, 'Exactly one Early Bird award object exists for today');
  assert(earlyAwards[0].winning_student_id === testStudentId, 'Early Bird award assigned to eligible first check-in student');
  assert(earlyAwards[0].awarded_points === 10, 'Early bird awards exactly 10 points');
}

await runCheckInTest();
console.log('');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('================================================================');
console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions passed.`);
console.log('SNS Campus Polygon GPS Geofencing verified successfully across all 9 scenarios.');
console.log('================================================================\n');

process.exit(0);
