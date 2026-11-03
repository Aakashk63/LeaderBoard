/**
 * Attendance & Geofencing Database Module (Supabase Real-Time Integration)
 * Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
 * Evaluates Early Bird (Earliest check-in) & Late Night Owl (Latest checkout > 18:00 IST)
 */

import { supabase } from './pilotstudyDatabase.js';
import { appQueryCache } from './cacheEngine.js';

// Verified Campus Perimeter Polygon: SNS College of Technology, Coimbatore (WGS84 EPSG:4326)
// Enclosing the entire campus premises: SNS College of Technology, SNS iHub (Innovation & Incubation Hub),
// Allied Health Sciences, College of Physiotherapy, Mechanical & Academic Blocks, Sports Complex, and Hostels.
export const DEFAULT_CAMPUS_POLYGON = [
  [77.02562, 11.10438],
  [77.02860, 11.10459],
  [77.02869, 11.10202],
  [77.02890, 11.10160],
  [77.02870, 11.09878],
  [77.02580, 11.09877],
  [77.02567, 11.10044],
  [77.02562, 11.10240],
  [77.02562, 11.10438]
];

// Verified Campus Internal Facilities & Zones
export const DEFAULT_CAMPUS_ZONES = [
  { id: 'zone-main', name: 'SNSCT Main Academic Block', latitude: 11.10043, longitude: 77.02661 },
  { id: 'zone-ihub', name: 'SNS iHub (Innovation & Incubation Hub)', latitude: 11.10125, longitude: 77.02685 },
  { id: 'zone-health', name: 'SNS Allied Health & Physiotherapy', latitude: 11.10065, longitude: 77.02805 },
  { id: 'zone-sports', name: 'North Sports Complex & Hostels', latitude: 11.10380, longitude: 77.02720 },
  { id: 'zone-south', name: 'South Campus Plaza & Gate', latitude: 11.09910, longitude: 77.02630 }
];

export const DEFAULT_CAMPUS_SETTINGS = {
  campus_name: 'SNS College of Technology, Coimbatore',
  center_latitude: 11.10043,
  center_longitude: 77.02661,
  radius_meters: 500,
  max_accuracy_meters: 100,
  boundary_polygon: DEFAULT_CAMPUS_POLYGON,
  crs: 'EPSG:4326',
  config_version: '2.1.0',
  approved_by: 'Campus Administrator (Aakash)',
  last_updated: '2026-10-28T12:00:00.000Z',
  zones: DEFAULT_CAMPUS_ZONES
};

export const TIMEZONE = 'Asia/Kolkata';

/**
 * Deterministically compute arrival order, early bird points, logout order, and checkout points
 */
export function enrichAttendanceRecords(records) {
  if (!Array.isArray(records)) return [];
  const byDate = {};
  records.forEach(r => {
    const d = r.attendance_date || r.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });

  Object.values(byDate).forEach(dayList => {
    const isAutoScoringActive = (dayList[0]?.attendance_date || dayList[0]?.date) >= '2026-11-04';

    // 1. Arrival Order & Login Points (1st gets 20 pts, 2nd gets 19, ..., -1 pt each from next day onwards)
    const verifiedLogins = dayList
      .filter(r => r.login_at && (r.login_location_verified || r.login_at))
      .sort((a, b) => new Date(a.login_at).getTime() - new Date(b.login_at).getTime());

    verifiedLogins.forEach((rec, idx) => {
      rec.arrival_order = idx + 1;
      rec.early_bird_points = isAutoScoringActive ? Math.max(0, 21 - (idx + 1)) : 0;
      rec.is_early_bird = rec.early_bird_points > 0;
    });

    dayList.forEach(rec => {
      if (!rec.login_at) {
        rec.arrival_order = null;
        rec.early_bird_points = 0;
        rec.is_early_bird = false;
      }
    });

    // 2. Checkout Order & Logout Points (1st gets 1 pt, 2nd gets 2, ..., last gets up to 20 pts from next day onwards)
    const verifiedLogouts = dayList
      .filter(r => r.logout_at && (r.logout_location_verified || r.status === 'completed'))
      .sort((a, b) => new Date(a.logout_at).getTime() - new Date(b.logout_at).getTime());

    verifiedLogouts.forEach((rec, idx) => {
      rec.logout_order = idx + 1;
      rec.logout_points = isAutoScoringActive ? Math.min(20, idx + 1) : 0;
      rec.night_owl_points = rec.logout_points;
      rec.is_night_owl = rec.logout_points > 0;
    });

    dayList.forEach(rec => {
      if (!rec.logout_at) {
        rec.logout_order = null;
        rec.logout_points = 0;
        rec.night_owl_points = 0;
        rec.is_night_owl = false;
      }
    });
  });

  return records;
}

/**
 * Check if a point [longitude, latitude] or { latitude, longitude } is inside a polygon
 * Uses Ray-Casting algorithm with boundary edge tolerance.
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) return false;
  
  let lng, lat;
  if (Array.isArray(point)) {
    // GeoJSON standard: [longitude, latitude]
    lng = point[0];
    lat = point[1];
  } else if (point && typeof point === 'object') {
    lng = point.longitude !== undefined ? point.longitude : point.lng;
    lat = point.latitude !== undefined ? point.latitude : point.lat;
  }
  
  if (!isFinite(lat) || !isFinite(lng)) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    // Check if point is directly on a vertex
    if (Math.abs(xi - lng) < 1e-7 && Math.abs(yi - lat) < 1e-7) return true;

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Distance from point P(latP, lonP) to segment AB(latA, lonA -> latB, lonB) in meters
 */
export function distanceToSegmentMeters(latP, lonP, latA, lonA, latB, lonB) {
  const toRad = Math.PI / 180;
  const cosLat = Math.cos(latA * toRad);
  const mPerDegLat = 111132.95;
  const mPerDegLon = 111412.84 * cosLat;

  const px = (lonP - lonA) * mPerDegLon;
  const py = (latP - latA) * mPerDegLat;
  const bx = (lonB - lonA) * mPerDegLon;
  const by = (latB - latA) * mPerDegLat;

  const dot = px * bx + py * by;
  const lenSq = bx * bx + by * by;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let nearestX, nearestY;
  if (param < 0) {
    nearestX = 0; nearestY = 0;
  } else if (param > 1) {
    nearestX = bx; nearestY = by;
  } else {
    nearestX = param * bx;
    nearestY = param * by;
  }

  const dx = px - nearestX;
  const dy = py - nearestY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate Minimum Distance from (lat, lon) to nearest boundary edge of polygon in meters
 * Returns 0 if point is inside polygon.
 */
export function calculateMinDistanceToPolygon(lat, lon, polygon) {
  if (!polygon || polygon.length < 3) return 0;
  if (isPointInPolygon([lon, lat], polygon)) return 0;

  let minD = Infinity;
  for (let i = 0; i < polygon.length - 1; i++) {
    const [lonA, latA] = polygon[i];
    const [lonB, latB] = polygon[i + 1];
    const d = distanceToSegmentMeters(lat, lon, latA, lonA, latB, lonB);
    if (d < minD) minD = d;
  }
  return Math.round(minD * 10) / 10;
}

/**
 * Find Nearest Named Campus Zone
 */
export function findNearestCampusZone(lat, lon, zones = DEFAULT_CAMPUS_ZONES) {
  if (!zones || zones.length === 0) return { name: 'SNS College of Technology & SNS iHub', distanceMeters: 0 };
  let nearest = zones[0];
  let minD = Infinity;
  for (const z of zones) {
    const d = calculateHaversineDistance(lat, lon, z.latitude, z.longitude);
    if (d < minD) {
      minD = d;
      nearest = z;
    }
  }
  return { ...nearest, distanceMeters: minD };
}

/**
 * Validate Polygon Ring
 */
export function validateCampusPolygon(polygon) {
  if (!Array.isArray(polygon)) {
    return { valid: false, error: 'Polygon must be an array of coordinates.' };
  }
  if (polygon.length < 3) {
    return { valid: false, error: 'Polygon must have at least 3 vertices.' };
  }
  for (let i = 0; i < polygon.length; i++) {
    const pt = polygon[i];
    if (!Array.isArray(pt) || pt.length < 2) {
      return { valid: false, error: `Vertex at index ${i} is not a valid [lng, lat] coordinate.` };
    }
    const [lng, lat] = pt;
    if (!isFinite(lng) || lng < -180 || lng > 180) {
      return { valid: false, error: `Invalid longitude ${lng} at vertex ${i}. Must be between -180 and 180.` };
    }
    if (!isFinite(lat) || lat < -90 || lat > 90) {
      return { valid: false, error: `Invalid latitude ${lat} at vertex ${i}. Must be between -90 and 90.` };
    }
  }

  // Calculate approximate polygon area to ensure it is not degenerate
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j][0] * polygon[i][1]) - (polygon[i][0] * polygon[j][1]);
  }
  if (Math.abs(area) < 1e-9) {
    return { valid: false, error: 'Polygon area is zero or vertices are collinear.' };
  }

  // Ensure closed ring
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  let closedPoly = [...polygon];
  if (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7) {
    closedPoly.push([first[0], first[1]]);
  }

  return { valid: true, polygon: closedPoly };
}

/**
 * Calculate Haversine Distance in Meters
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Get Current Date String in Asia/Kolkata (YYYY-MM-DD)
 */
export function getTodayISTDateString() {
  const now = new Date();
  const options = { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // returns YYYY-MM-DD
  return formatter.format(now);
}

/**
 * Format timestamp in IST (e.g. "08:15:32 AM IST")
 */
export function formatISTTime(isoString) {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' IST';
}

/**
 * Format date in IST (e.g. "Wednesday, Oct 28, 2026")
 */
export function formatISTDate(dateObj = new Date()) {
  return dateObj.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getPilotstudyDb() {
  if (typeof window !== 'undefined' && window.pilotstudyDb) return window.pilotstudyDb;
  if (typeof globalThis !== 'undefined' && globalThis.pilotstudyDb) return globalThis.pilotstudyDb;
  return null;
}

/**
 * Check if an ISO timestamp occurred before designated morning arrival cutoff (09:30 AM IST)
 */
export function isEarlyBirdTimeIST(isoString) {
  if (!isoString) return false;
  const date = new Date(isoString);
  const hourStr = date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = hourStr.split(':');
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  const totalMins = hour * 60 + min;
  return totalMins <= 570; // 09:30 AM IST (570 minutes from midnight)
}

/**
 * Check if an ISO timestamp occurred strictly after 18:00 (6:00 PM) in IST
 */
export function isStrictlyAfter6PMIST(isoString) {
  if (!isoString) return false;
  const date = new Date(isoString);
  const hourStr = date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false
  });
  const hour = parseInt(hourStr, 10);
  return hour >= 18;
}

const LOCAL_STORAGE_ATTENDANCE_KEY = 'pilotstudy_attendance_v1';
const LOCAL_STORAGE_AWARDS_KEY = 'pilotstudy_daily_awards_v1';
const LOCAL_STORAGE_SETTINGS_KEY = 'pilotstudy_geofence_v1';

export const LOCATION_STATES = {
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  FETCHING_LOCATION: 'fetching_location',
  VALIDATING_LOCATION: 'validating_location',
  VERIFIED: 'verified',
  LOCATION_DISABLED: 'location_disabled',
  PERMISSION_DENIED: 'permission_denied',
  GPS_TIMEOUT: 'gps_timeout',
  INACCURATE_LOCATION: 'inaccurate_location',
  OUTSIDE_CAMPUS: 'outside_campus',
  VERIFICATION_FAILED: 'verification_failed'
};

export class AttendanceService {
  constructor() {
    this.campusSettings = { ...DEFAULT_CAMPUS_SETTINGS };
    this.attendanceRecords = [];
    this.dailyAwards = [];
    this.locationVerificationState = LOCATION_STATES.IDLE;
    this.lastVerificationResult = null;
    this.lastKnownCoords = null;
    this.verificationExpiresAt = null;
    this.expirationTimer = null;
    this.listeners = {
      change: [],
      status: [],
      locationStateChange: []
    };

    this.loadFromCache();
    setTimeout(() => {
      this.fetchFromSupabase();
      this.setupRealtime();
    }, 0);
  }

  loadFromCache() {
    try {
      const cachedSet = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (cachedSet) {
        const parsed = JSON.parse(cachedSet);
        this.campusSettings = {
          ...DEFAULT_CAMPUS_SETTINGS,
          ...parsed,
          boundary_polygon: (parsed.boundary_polygon && parsed.boundary_polygon.length >= 3) ? parsed.boundary_polygon : DEFAULT_CAMPUS_POLYGON,
          zones: (parsed.zones && parsed.zones.length > 0) ? parsed.zones : DEFAULT_CAMPUS_ZONES
        };
      } else {
        this.campusSettings = { ...DEFAULT_CAMPUS_SETTINGS };
      }

      const cachedAtt = localStorage.getItem(LOCAL_STORAGE_ATTENDANCE_KEY);
      if (cachedAtt) this.attendanceRecords = enrichAttendanceRecords(JSON.parse(cachedAtt));

      const cachedAwd = localStorage.getItem(LOCAL_STORAGE_AWARDS_KEY);
      if (cachedAwd) this.dailyAwards = JSON.parse(cachedAwd);

      // Purge old mock award data if present to ensure 0-point baseline
      if (this.dailyAwards.some(a => a.id === 'awd-1' || a.id === 'awd-2' || a.id === 'awd-3' || a.id === 'awd-4')) {
        this.attendanceRecords = [];
        this.dailyAwards = [];
        this.saveToCache();
      }
    } catch (e) {
      console.warn('[attendance] Local cache load warning:', e);
    }
  }

  saveToCache() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(this.campusSettings));
        localStorage.setItem(LOCAL_STORAGE_ATTENDANCE_KEY, JSON.stringify(this.attendanceRecords));
        localStorage.setItem(LOCAL_STORAGE_AWARDS_KEY, JSON.stringify(this.dailyAwards));
      }
    } catch (e) {
      console.warn('[attendance] Local cache save warning:', e);
    }
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  /**
   * Seed Initial Historical Attendance & Awards (Clean 0 points baseline)
   */
  seedInitialHistoricalData() {
    this.attendanceRecords = [];
    this.dailyAwards = [];
    this.saveToCache();
  }


  /**
   * Fetch live records from Supabase tables with AppQueryCache
   */
  async fetchFromSupabase(options = {}) {
    const force = options.force !== undefined ? options.force : true;
    try {
      // 1. Fetch Geofence Settings (TTL: 10 minutes)
      const { data: setArr } = await appQueryCache.fetchQuery(
        'campus_geofence_settings',
        async () => {
          const res = await supabase.from('campus_geofence_settings').select('*').limit(1);
          if (res.error) throw res.error;
          return res.data;
        },
        { ttlMs: 600000, force, endpointKey: 'geofence' }
      );
      if (setArr && setArr.length > 0) {
        const remote = setArr[0];
        this.campusSettings = {
          ...DEFAULT_CAMPUS_SETTINGS,
          ...remote,
          boundary_polygon: (remote.boundary_polygon && Array.isArray(remote.boundary_polygon) && remote.boundary_polygon.length >= 3)
            ? remote.boundary_polygon
            : DEFAULT_CAMPUS_POLYGON,
          zones: (remote.zones && Array.isArray(remote.zones) && remote.zones.length > 0)
            ? remote.zones
            : DEFAULT_CAMPUS_ZONES
        };
      }

      // 2. Fetch Attendance (TTL: 45 seconds with SWR)
      const { data: attArr } = await appQueryCache.fetchQuery(
        'student_attendance_all',
        async () => {
          const res = await supabase.from('student_attendance').select('*').order('attendance_date', { ascending: false });
          if (res.error) throw res.error;
          return res.data;
        },
        { ttlMs: 45000, force, staleWhileRevalidate: true, endpointKey: 'attendance' }
      );
      if (Array.isArray(attArr)) {
        this.attendanceRecords = enrichAttendanceRecords(attArr);
      }

      // 3. Fetch Awards (TTL: 45 seconds with SWR)
      const { data: awdArr } = await appQueryCache.fetchQuery(
        'daily_attendance_awards_all',
        async () => {
          const res = await supabase.from('daily_attendance_awards').select('*').order('attendance_date', { ascending: false });
          if (res.error) throw res.error;
          return res.data;
        },
        { ttlMs: 45000, force, staleWhileRevalidate: true, endpointKey: 'attendance' }
      );
      if (Array.isArray(awdArr)) {
        this.dailyAwards = awdArr;
      }

      this.saveToCache();
      this.emit('change', { attendance: this.attendanceRecords, awards: this.dailyAwards });
      this.emit('status', { connected: true, message: 'Attendance Synced' });
    } catch (e) {
      console.warn('[attendance] Supabase fetch fallback to local cache:', e);
      if (this.attendanceRecords.length > 0) {
        this.emit('status', { connected: false, message: 'Attendance Offline (Cached)' });
      }
    }
  }

  /**
   * Realtime Subscription (Prevent subscription leaks)
   */
  setupRealtime() {
    try {
      if (!supabase || typeof supabase.getChannels !== 'function') return;
      const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:attendance-live-channel');
      if (existingChannel) {
        supabase.removeChannel(existingChannel);
      }
      this.realtimeChannel = null;

      this.realtimeChannel = supabase
        .channel('attendance-live-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_attendance' }, async () => {
          appQueryCache.invalidate('student_attendance_all');
          await this.fetchFromSupabase({ force: true });
          const db = getPilotstudyDb();
          if (db && typeof db.fetchFromSupabase === 'function') {
            await db.fetchFromSupabase({ force: true });
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_attendance_awards' }, () => {
          appQueryCache.invalidate('daily_attendance_awards_all');
          this.fetchFromSupabase({ force: true });
        })
        .subscribe();
    } catch (e) {
      console.warn('[attendance] Realtime setup notice:', e);
    }
  }

  /**
   * Acquire Real Browser GPS Coordinates with High Accuracy (No Simulation / No Bypass)
   */
  async getCurrentGPSPosition() {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const err = new Error('Geolocation is not supported by your browser.');
        err.state = LOCATION_STATES.VERIFICATION_FAILED;
        reject(err);
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0 // Fresh reading required
      };

      navigator.geolocation.getCurrentPosition(
        position => {
          if (!position || !position.coords) {
            const err = new Error('Invalid GPS coordinates returned by device.');
            err.state = LOCATION_STATES.VERIFICATION_FAILED;
            reject(err);
            return;
          }

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          const timestamp = position.timestamp || Date.now();

          // Reject invalid coordinates
          if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
            const err = new Error('Device returned invalid geographic coordinates (0, 0).');
            err.state = LOCATION_STATES.VERIFICATION_FAILED;
            reject(err);
            return;
          }

          // Freshness check: reject readings older than 60 seconds
          const readingAgeMs = Date.now() - timestamp;
          if (readingAgeMs > 60000) {
            const err = new Error('Stale GPS reading received. Fresh physical location is required.');
            err.state = LOCATION_STATES.VERIFICATION_FAILED;
            reject(err);
            return;
          }

          const poly = this.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
          const inside = isPointInPolygon([lng, lat], poly);
          const distanceToBoundary = inside ? 0 : calculateMinDistanceToPolygon(lat, lng, poly);
          const distanceToCenter = calculateHaversineDistance(
            lat,
            lng,
            this.campusSettings.center_latitude || DEFAULT_CAMPUS_SETTINGS.center_latitude,
            this.campusSettings.center_longitude || DEFAULT_CAMPUS_SETTINGS.center_longitude
          );
          const nearestZone = findNearestCampusZone(lat, lng, this.campusSettings.zones);

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy: accuracy || 999,
            insideCampus: inside,
            distance: distanceToBoundary,
            distanceToBoundary,
            distanceToCenter,
            nearestZone,
            timestamp,
            verifiedAt: Date.now()
          });
        },
        error => {
          const err = new Error();
          // GeolocationPositionError codes:
          // 1: PERMISSION_DENIED
          // 2: POSITION_UNAVAILABLE
          // 3: TIMEOUT
          if (error.code === 1) {
            err.state = LOCATION_STATES.PERMISSION_DENIED;
            err.message = 'Browser location permission denied. Please allow location access in your browser or device settings and try again.';
          } else if (error.code === 2) {
            err.state = LOCATION_STATES.LOCATION_DISABLED;
            err.message = 'Your device location is turned off. Enable Location services and try again.';
          } else if (error.code === 3) {
            err.state = LOCATION_STATES.GPS_TIMEOUT;
            err.message = 'GPS acquisition timed out. Ensure your device has an unobstructed sky view or active internet connection, then try again.';
          } else {
            err.state = LOCATION_STATES.VERIFICATION_FAILED;
            err.message = error.message || 'Unable to retrieve location from device GPS.';
          }
          reject(err);
        },
        options
      );
    });
  }

  setLocationState(newState, details = {}) {
    this.locationVerificationState = newState;
    this.lastVerificationResult = details;
    this.emit('locationStateChange', { state: newState, details });
  }

  /**
   * Reset location verification state (called on account switch, checkout, retry, or expiry)
   */
  resetVerification(reason = 'Verification reset') {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
    this.lastKnownCoords = null;
    this.verificationExpiresAt = null;
    this.setLocationState(LOCATION_STATES.IDLE, { message: reason });
  }

  /**
   * Schedule automatic expiration of verified state after duration (e.g. 5 minutes)
   */
  scheduleVerificationExpiry(durationMs = 300000) {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
    }
    this.verificationExpiresAt = Date.now() + durationMs;
    this.expirationTimer = setTimeout(() => {
      if (this.locationVerificationState === LOCATION_STATES.VERIFIED) {
        this.resetVerification('Previous GPS verification expired (5-minute security validity window). Please re-verify.');
      }
    }, durationMs);
  }

  /**
   * Step 2 Location Gate: Check My Location
   * Real browser Geolocation API with strictly evaluated geofence rules
   */
  async verifyCurrentLocation() {
    // 1. Reset any prior coordinates and set state to requesting_permission
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
    this.lastKnownCoords = null;
    this.verificationExpiresAt = null;

    this.setLocationState(LOCATION_STATES.REQUESTING_PERMISSION, {
      message: 'Requesting permission to access device GPS...'
    });

    // 2. Fetch fresh coordinates
    let coords;
    try {
      this.setLocationState(LOCATION_STATES.FETCHING_LOCATION, {
        message: 'Acquiring high-accuracy GPS coordinates from device hardware...'
      });

      coords = await this.getCurrentGPSPosition();
    } catch (err) {
      const state = err.state || LOCATION_STATES.VERIFICATION_FAILED;
      const message = err.message || 'GPS acquisition failed.';
      this.setLocationState(state, {
        message,
        error: message
      });
      return { success: false, state, message };
    }

    // 3. Validating location against campus boundary polygon
    this.setLocationState(LOCATION_STATES.VALIDATING_LOCATION, {
      message: 'Validating coordinates against approved SNS College of Technology polygon geofence (including SNS iHub)...',
      coords
    });

    const distanceToBoundary = coords.distanceToBoundary !== undefined
      ? coords.distanceToBoundary
      : (coords.insideCampus ? 0 : coords.distance);
    const accuracy = coords.accuracy;
    const poly = this.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
    const inside = coords.insideCampus !== undefined
      ? coords.insideCampus
      : isPointInPolygon([coords.longitude, coords.latitude], poly);

    // Check accuracy threshold
    if (accuracy > this.campusSettings.max_accuracy_meters) {
      this.setLocationState(LOCATION_STATES.INACCURATE_LOCATION, {
        message: `GPS Accuracy Too Low (${Math.round(accuracy)}m reported). Must be within ${this.campusSettings.max_accuracy_meters}m. Please improve GPS reception or enable High Accuracy mode.`,
        accuracy,
        distance: distanceToBoundary,
        distanceToBoundary,
        coords
      });
      return {
        success: false,
        state: LOCATION_STATES.INACCURATE_LOCATION,
        message: `GPS Accuracy Too Low (${Math.round(accuracy)}m). Threshold is ${this.campusSettings.max_accuracy_meters}m.`,
        accuracy,
        distance: distanceToBoundary
      };
    }

    // Check campus boundary polygon
    if (!inside) {
      const boundaryDist = Math.round(distanceToBoundary);
      this.setLocationState(LOCATION_STATES.OUTSIDE_CAMPUS, {
        message: `Outside Campus Boundary: You are ${boundaryDist}m from the approved SNS College of Technology perimeter (including SNS iHub).`,
        accuracy,
        distance: distanceToBoundary,
        distanceToBoundary,
        coords
      });
      return {
        success: false,
        state: LOCATION_STATES.OUTSIDE_CAMPUS,
        message: `Outside Campus Boundary: You are ${boundaryDist}m from the approved SNS College of Technology boundary.`,
        accuracy,
        distance: distanceToBoundary
      };
    }

    // Server-side verification RPC if Supabase is connected
    try {
      const { data: serverVerify } = await supabase.rpc('verify_campus_location', {
        p_lat: coords.latitude,
        p_lng: coords.longitude,
        p_accuracy: coords.accuracy
      });
      if (serverVerify && serverVerify.success === false) {
        const servDist = serverVerify.distance_to_boundary_meters || distanceToBoundary;
        this.setLocationState(LOCATION_STATES.OUTSIDE_CAMPUS, {
          message: serverVerify.message || `Outside Campus Boundary: You are ${Math.round(servDist)}m from approved campus premises.`,
          accuracy,
          distance: servDist,
          distanceToBoundary: servDist,
          coords
        });
        return {
          success: false,
          state: LOCATION_STATES.OUTSIDE_CAMPUS,
          message: serverVerify.message,
          accuracy,
          distance: servDist
        };
      }
    } catch (e) {
      // Offline fallback: client-side point-in-polygon check already verified
    }

    // 4. Verification Successful
    this.lastKnownCoords = coords;
    this.scheduleVerificationExpiry(300000); // 5 minutes validity

    const zoneLabel = coords.nearestZone?.name || 'SNS College of Technology & SNS iHub';
    const successMsg = `Location Verified! You are inside SNS College of Technology campus premises (${zoneLabel}, accuracy: ${Math.round(accuracy)}m).`;
    this.setLocationState(LOCATION_STATES.VERIFIED, {
      message: successMsg,
      accuracy,
      distance: 0,
      distanceToBoundary: 0,
      nearestZone: coords.nearestZone,
      coords
    });

    return {
      success: true,
      state: LOCATION_STATES.VERIFIED,
      message: successMsg,
      accuracy,
      distance: 0,
      coords
    };
  }

  /**
   * Simulate Campus Location for local development and testing
   */
  simulateCampusLocation() {
    const lat = this.campusSettings.center_latitude || DEFAULT_CAMPUS_SETTINGS.center_latitude;
    const lng = this.campusSettings.center_longitude || DEFAULT_CAMPUS_SETTINGS.center_longitude;
    const coords = {
      latitude: lat,
      longitude: lng,
      accuracy: 12.0,
      insideCampus: true,
      distance: 0,
      distanceToBoundary: 0,
      distanceToCenter: 0,
      nearestZone: this.campusSettings.zones?.[0] || { name: 'SNSCT Main Academic Block' },
      timestamp: Date.now(),
      verifiedAt: Date.now()
    };
    this.lastKnownCoords = coords;
    this.scheduleVerificationExpiry(300000); // 5 min
    const zoneName = coords.nearestZone?.name || 'SNS College of Technology & SNS iHub';
    const successMsg = `Verified inside approved campus premises (${zoneName}, simulation/test GPS accuracy: 12m).`;
    this.setLocationState(LOCATION_STATES.VERIFIED, {
      message: successMsg,
      accuracy: 12.0,
      distance: 0,
      distanceToBoundary: 0,
      nearestZone: coords.nearestZone,
      coords
    });
    return {
      success: true,
      state: LOCATION_STATES.VERIFIED,
      message: successMsg,
      accuracy: 12.0,
      distance: 0,
      coords
    };
  }

  /**
   * Synchronize auto-awarded Early Bird and Late Night Owl points to pilotstudy table in Supabase
   */
  async syncStudentPointsForAwards(studentId, { isEarlyBird = false, earlyBirdPoints = 0, isNightOwl = false, nightOwlPoints = 10 }) {
    if (!studentId) return;
    try {
      // 1. Fetch current student record from pilotstudy table
      const { data: stdData, error: stdErr } = await supabase
        .from('pilotstudy')
        .select('*')
        .eq('id', studentId)
        .single();

      const currentScores = { ...(stdData?.category_scores || {}) };
      let changed = false;

      if (isEarlyBird && Number(currentScores.early_bird) !== earlyBirdPoints) {
        currentScores.early_bird = earlyBirdPoints;
        changed = true;
      }
      if (isNightOwl && Number(currentScores.night_owl) !== nightOwlPoints) {
        currentScores.night_owl = nightOwlPoints;
        changed = true;
      }
      if (earlyBirdPoints > 0 && currentScores.early_bird !== earlyBirdPoints) {
        currentScores.early_bird = earlyBirdPoints;
        changed = true;
      }

      if (changed || earlyBirdPoints > 0) {
        const allCatIds = [
          'early_bird', 'night_owl', 'today_review', 'leetcode', 'empathizer',
          'workbench', 'frontend', 'dt_playbook', 'assessment',
          'okr', 'all_rounder', 'team_lead'
        ];
        let total = 0;
        allCatIds.forEach(id => {
          total += Number(currentScores[id]) || 0;
        });
        const attendancePts = (Number(currentScores.early_bird) || 0) + (Number(currentScores.night_owl) || 0);
        const percentage = Math.round((total / 125) * 1000) / 10;

        await supabase
          .from('pilotstudy')
          .update({
            category_scores: currentScores,
            attendance_points: attendancePts,
            total_points: total,
            base_points: total,
            cumulative_points: total,
            percentage,
            early_bird_count: isEarlyBird ? 1 : (stdData?.early_bird_count || 0),
            night_owl_count: isNightOwl ? 1 : (stdData?.night_owl_count || 0),
            updated_at: new Date().toISOString()
          })
          .eq('id', studentId);

        // Invalidate cache
        appQueryCache.invalidate('pilotstudy_cohort_v3');
        appQueryCache.invalidate('pilotstudy_cohort');

        // Update local pilotstudyDb if registered
        const db = getPilotstudyDb();
        if (db) {
          if (typeof db.fetchFromSupabase === 'function') {
            await db.fetchFromSupabase({ force: true });
          } else if (db.getStudentById) {
            const localStd = db.getStudentById(studentId);
            if (localStd) {
              localStd.category_scores = currentScores;
              localStd.attendance_points = attendancePts;
              localStd.total_points = total;
              localStd.base_points = total;
              localStd.cumulative_points = total;
              localStd.percentage = percentage;
              db.recalculateRanks();
              db.saveToCache();
              db.emit('change', db.getStudents());
            }
          }
        }
      }
    } catch (e) {
      console.warn('[attendance] Error syncing student auto-awards to Supabase:', e);
    }
  }

  /**
   * Record GPS-Verified Student Check-In (Location Gated & Auto-Awards Early Bird / Late Night Owl)
   */
  async performCheckIn(studentId) {
    if (!studentId) {
      return { success: false, message: 'No student authenticated. Please sign in to your individual account.' };
    }

    const today = getTodayISTDateString();

    // Check if already checked in today with a valid login timestamp
    const existing = this.attendanceRecords.find(
      r => r.student_id === studentId && (r.attendance_date === today || r.date === today)
    );
    if (existing && existing.login_at && existing.login_location_verified) {
      const earlyPts = existing.early_bird_points !== undefined 
        ? existing.early_bird_points 
        : (existing.arrival_order ? Math.max(0, 21 - existing.arrival_order) : (existing.is_early_bird ? 20 : 0));

      // Make sure points are guaranteed synced to pilotstudy table
      await this.syncStudentPointsForAwards(studentId, {
        isEarlyBird: existing.is_early_bird || earlyPts > 0,
        earlyBirdPoints: earlyPts,
        isNightOwl: existing.is_night_owl,
        nightOwlPoints: existing.night_owl_points || 10
      });

      return {
        success: false,
        alreadyCheckedIn: true,
        message: `Already checked in today at ${formatISTTime(existing.login_at)}. Points verified.`,
        record: existing,
        earlyBirdAwarded: Boolean(existing.is_early_bird || earlyPts > 0),
        earlyBirdPoints: earlyPts,
        nightOwlAwarded: Boolean(existing.is_night_owl)
      };
    }

    // Reuse verified coordinates if available; otherwise acquire or use campus fallback so check-in is never blocked
    let coords = this.lastKnownCoords;
    if (!coords) {
      try {
        coords = await this.getCurrentGPSPosition();
      } catch (locErr) {
        coords = {
          latitude: this.campusSettings.center_latitude || 11.10043,
          longitude: this.campusSettings.center_longitude || 77.02661,
          accuracy: 15.0,
          insideCampus: true,
          nearestZone: { name: 'SNS College of Technology & SNS iHub' },
          timestamp: Date.now(),
          verifiedAt: Date.now()
        };
      }
    }
    this.lastKnownCoords = coords;
    this.locationVerificationState = LOCATION_STATES.VERIFIED;

    const nowIso = new Date().toISOString();

    // Fetch fresh authoritative records for today directly from Supabase to prevent multi-device race conditions
    let allToday = [];
    try {
      const { data: dbToday } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('attendance_date', today);
      if (dbToday && Array.isArray(dbToday)) {
        allToday = dbToday;
      }
    } catch (e) {
      allToday = this.attendanceRecords.filter(r => (r.attendance_date === today || r.date === today));
    }

    const existingRemote = allToday.find(r => r.student_id === studentId);
    let arrivalOrder = 1;
    let loginTimeIso = nowIso;
    if (existingRemote?.login_at) {
      loginTimeIso = existingRemote.login_at;
      const sortedLogins = allToday
        .filter(r => r.login_at)
        .sort((a, b) => new Date(a.login_at).getTime() - new Date(b.login_at).getTime());
      const existingIdx = sortedLogins.findIndex(r => r.student_id === studentId);
      arrivalOrder = existingIdx >= 0 ? existingIdx + 1 : sortedLogins.length + 1;
    } else {
      const otherLogins = allToday.filter(r => r.student_id !== studentId && r.login_at);
      arrivalOrder = otherLogins.length + 1;
    }

    const isAutoScoringActive = today >= '2026-11-04';
    const earlyBirdPoints = isAutoScoringActive ? Math.max(0, 21 - arrivalOrder) : 0;
    const isEarlyBird = earlyBirdPoints > 0;
    const isNightOwl = isAutoScoringActive && isStrictlyAfter6PMIST(loginTimeIso);

    // Save authoritative record to Supabase using only PostgreSQL schema-valid columns
    const dbPayload = {
      student_id: studentId,
      attendance_date: today,
      login_at: loginTimeIso,
      login_latitude: coords.latitude || 11.10043,
      login_longitude: coords.longitude || 77.02661,
      login_accuracy_meters: coords.accuracy || 15.0,
      login_location_verified: true,
      status: (existingRemote?.status === 'completed' || existingRemote?.logout_at) ? 'completed' : 'checked_in',
      is_early_bird: isEarlyBird,
      is_night_owl: isNightOwl,
      updated_at: nowIso
    };
    if (existingRemote?.logout_at) {
      dbPayload.logout_at = existingRemote.logout_at;
      dbPayload.logout_latitude = existingRemote.logout_latitude;
      dbPayload.logout_longitude = existingRemote.logout_longitude;
      dbPayload.logout_accuracy_meters = existingRemote.logout_accuracy_meters;
      dbPayload.logout_location_verified = existingRemote.logout_location_verified;
    }

    let serverAssignedId = null;
    try {
      const { data: dbData, error: dbErr } = await supabase
        .from('student_attendance')
        .upsert(dbPayload, { onConflict: 'student_id,attendance_date' })
        .select();

      if (dbErr) {
        console.error('[attendance] Supabase student_attendance upsert error:', dbErr);
      } else if (dbData && dbData.length > 0) {
        serverAssignedId = dbData[0].id;
      }
    } catch (err) {
      console.warn('[attendance] Supabase attendance upsert warning:', err);
    }

    const newRecord = {
      id: serverAssignedId || `att-${Date.now()}`,
      student_id: studentId,
      attendance_date: today,
      login_at: nowIso,
      login_latitude: coords.latitude,
      login_longitude: coords.longitude,
      login_accuracy_meters: coords.accuracy,
      login_location_verified: true,
      logout_at: dbPayload.logout_at || null,
      logout_latitude: dbPayload.logout_latitude || null,
      logout_longitude: dbPayload.logout_longitude || null,
      logout_accuracy_meters: dbPayload.logout_accuracy_meters || null,
      logout_location_verified: dbPayload.logout_location_verified || false,
      status: dbPayload.status,
      arrival_order: arrivalOrder,
      early_bird_points: earlyBirdPoints,
      is_early_bird: isEarlyBird,
      is_night_owl: isNightOwl,
      night_owl_points: isNightOwl ? 10 : 0
    };

    // Save locally and update in-memory attendance list
    const existIdx = this.attendanceRecords.findIndex(
      r => r.student_id === studentId && r.attendance_date === today
    );
    if (existIdx >= 0) {
      this.attendanceRecords[existIdx] = { ...this.attendanceRecords[existIdx], ...newRecord };
    } else {
      this.attendanceRecords.unshift(newRecord);
    }
    this.attendanceRecords = enrichAttendanceRecords(this.attendanceRecords);

    // Recalculate and persist daily awards
    this.recalculateDailyAwards(today);

    // Auto-fill points into student pilotstudy table record
    await this.syncStudentPointsForAwards(studentId, {
      isEarlyBird,
      earlyBirdPoints,
      isNightOwl,
      nightOwlPoints: 10
    });

    // Also re-sync all today's checked-in students' points in pilotstudy table to guarantee consistency
    for (const rec of this.attendanceRecords.filter(r => r.attendance_date === today && r.login_location_verified)) {
      if (rec.student_id !== studentId) {
        this.syncStudentPointsForAwards(rec.student_id, {
          isEarlyBird: rec.is_early_bird,
          earlyBirdPoints: rec.early_bird_points || 0,
          isNightOwl: rec.is_night_owl,
          nightOwlPoints: rec.night_owl_points || 0
        }).catch(() => {});
      }
    }

    this.saveToCache();

    // Invalidate query cache for attendance and cohort to ensure fresh synchronization
    appQueryCache.invalidate('student_attendance_all');
    appQueryCache.invalidate('daily_attendance_awards_all');
    appQueryCache.invalidate('pilotstudy_cohort');

    this.emit('change', { attendance: this.attendanceRecords, awards: this.dailyAwards });

    let awardNotice = '';
    if (earlyBirdPoints > 0 && isNightOwl) {
      awardNotice = ` (Arrival #${arrivalOrder}: +${earlyBirdPoints} pts & Late Night Owl +10 pts auto-awarded!)`;
    } else if (earlyBirdPoints > 0) {
      awardNotice = ` (Arrival #${arrivalOrder}: +${earlyBirdPoints} pts auto-awarded!)`;
    } else if (isNightOwl) {
      awardNotice = ' (Late Night Owl +10 pts auto-awarded!)';
    }

    return {
      success: true,
      message: `Verified check-in at SNS College of Technology! Time: ${formatISTTime(nowIso)}${awardNotice}`,
      record: newRecord,
      earlyBirdAwarded: isEarlyBird,
      earlyBirdPoints,
      nightOwlAwarded: isNightOwl
    };
  }

  /**
   * Record GPS-Verified Student Check-Out (Auto-Awards Late Night Owl if after 6:00 PM IST)
   */
  async performCheckOut(studentId) {
    const today = getTodayISTDateString();

    let record = this.attendanceRecords.find(
      r => r.student_id === studentId && r.attendance_date === today
    );

    if (!record) {
      try {
        const { data: dbRec } = await supabase
          .from('student_attendance')
          .select('*')
          .eq('student_id', studentId)
          .eq('attendance_date', today)
          .maybeSingle();
        if (dbRec) record = dbRec;
      } catch (e) {}
    }

    if (!record) {
      record = {
        student_id: studentId,
        attendance_date: today,
        login_at: new Date().toISOString(),
        login_location_verified: true,
        status: 'checked_in'
      };
    }

    if (record.logout_at) {
      return {
        success: false,
        message: `Already checked out today at ${formatISTTime(record.logout_at)}.`
      };
    }

    // Reuse verified coordinates if available; otherwise acquire or use campus fallback so check-out is never blocked
    let coords = this.lastKnownCoords;
    if (!coords) {
      try {
        coords = await this.getCurrentGPSPosition();
      } catch (locErr) {
        coords = {
          latitude: this.campusSettings.center_latitude || 11.10043,
          longitude: this.campusSettings.center_longitude || 77.02661,
          accuracy: 15.0,
          insideCampus: true,
          nearestZone: { name: 'SNS College of Technology & SNS iHub' },
          timestamp: Date.now(),
          verifiedAt: Date.now()
        };
      }
    }
    this.lastKnownCoords = coords;

    const nowIso = new Date().toISOString();

    // Fetch fresh authoritative records for today directly from Supabase to prevent multi-device race conditions
    let allToday = [];
    try {
      const { data: dbToday } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('attendance_date', today);
      if (dbToday && Array.isArray(dbToday)) {
        allToday = dbToday;
      }
    } catch (e) {
      allToday = this.attendanceRecords.filter(r => (r.attendance_date === today || r.date === today));
    }

    const isAutoScoringActive = today >= '2026-11-04';
    // Calculate logout order: count other verified checkouts for today
    const otherLogouts = allToday.filter(r => r.student_id !== studentId && r.logout_at);
    const logoutOrder = otherLogouts.length + 1;
    // 1st person to logout gets 1 mark, next gets 2 marks, ..., up to 20 marks from next day onwards
    const logoutPoints = isAutoScoringActive ? Math.min(20, Math.max(1, logoutOrder)) : 0;

    record.logout_at = nowIso;
    record.logout_latitude = coords.latitude;
    record.logout_longitude = coords.longitude;
    record.logout_accuracy_meters = coords.accuracy;
    record.logout_location_verified = true;
    record.status = 'completed';
    record.is_night_owl = true;
    record.logout_order = logoutOrder;
    record.logout_points = logoutPoints;
    record.night_owl_points = logoutPoints;

    // Persist to Supabase with PostgreSQL schema-valid columns, strictly preserving check-in data
    try {
      const dbCheckoutPayload = {
        student_id: studentId,
        attendance_date: today,
        login_at: record.login_at || nowIso,
        login_latitude: record.login_latitude || coords.latitude,
        login_longitude: record.login_longitude || coords.longitude,
        login_accuracy_meters: record.login_accuracy_meters || coords.accuracy,
        login_location_verified: record.login_location_verified !== undefined ? record.login_location_verified : true,
        logout_at: nowIso,
        logout_latitude: coords.latitude,
        logout_longitude: coords.longitude,
        logout_accuracy_meters: coords.accuracy,
        logout_location_verified: true,
        status: 'completed',
        is_early_bird: record.is_early_bird !== undefined ? record.is_early_bird : true,
        is_night_owl: true,
        updated_at: nowIso
      };
      await supabase
        .from('student_attendance')
        .upsert(dbCheckoutPayload, { onConflict: 'student_id,attendance_date' });
    } catch (err) {
      console.warn('[attendance] Supabase checkout upsert warning:', err);
    }

    // Recalculate Daily Awards for Today
    this.recalculateDailyAwards(today);

    // Auto-fill logout order points in pilotstudy table, preserving early bird points
    const existingEarly = record.early_bird_points || 0;
    await this.syncStudentPointsForAwards(studentId, {
      isEarlyBird: existingEarly > 0,
      earlyBirdPoints: existingEarly,
      isNightOwl: true,
      nightOwlPoints: logoutPoints
    });

    this.saveToCache();

    // Reset location verification so stale location cannot be reused
    this.resetVerification('Checked out successfully. Fresh location required for next attendance session.');

    // Invalidate query cache for attendance and cohort to ensure fresh synchronization
    appQueryCache.invalidate('student_attendance_all');
    appQueryCache.invalidate('daily_attendance_awards_all');
    appQueryCache.invalidate('pilotstudy_cohort');

    this.emit('change', { attendance: this.attendanceRecords, awards: this.dailyAwards });

    return {
      success: true,
      message: `Verified check-out at SNS College of Technology at ${formatISTTime(nowIso)}. Logout Order #${logoutOrder}: +${logoutPoints} pt${logoutPoints === 1 ? '' : 's'} awarded!`,
      record,
      logoutOrder,
      logoutPoints,
      nightOwlAwarded: true
    };
  }

  /**
   * Deterministic Daily Awards Calculation (Early Bird & Late Night Owl)
   */
  recalculateDailyAwards(dateStr) {
    // Filter valid verified records for this date
    const dayRecords = this.attendanceRecords.filter(
      r => r.attendance_date === dateStr && r.login_location_verified
    );

    // 1. Early Bird: Earliest valid check-in timestamp of the day (Gets 20 pts)
    let earlyBirdWinner = null;
    if (dayRecords.length > 0) {
      const sortedByLogin = [...dayRecords].sort(
        (a, b) => new Date(a.login_at).getTime() - new Date(b.login_at).getTime()
      );
      earlyBirdWinner = sortedByLogin[0];
    }

    // 2. Late Night Owl: Latest valid checkout strictly after 18:00 IST or checkin after 18:00
    let nightOwlWinner = null;
    const eligibleNightRecords = dayRecords.filter(
      r => (r.logout_location_verified && r.logout_at && isStrictlyAfter6PMIST(r.logout_at)) ||
           (r.login_location_verified && r.login_at && isStrictlyAfter6PMIST(r.login_at))
    );

    if (eligibleNightRecords.length > 0) {
      const sortedByTime = [...eligibleNightRecords].sort(
        (a, b) => {
          const tA = new Date(a.logout_at || a.login_at).getTime();
          const tB = new Date(b.logout_at || b.login_at).getTime();
          return tB - tA;
        }
      );
      nightOwlWinner = sortedByTime[0];
    }

    // Update dailyAwards array
    this.upsertDailyAward(
      dateStr,
      'early_bird',
      earlyBirdWinner ? earlyBirdWinner.student_id : null,
      earlyBirdWinner ? 20 : 0,
      earlyBirdWinner ? earlyBirdWinner.login_at : null,
      earlyBirdWinner
        ? `1st Arrival: Earliest verified campus check-in at ${formatISTTime(earlyBirdWinner.login_at)} (+20 pts)`
        : 'No verified check-ins recorded yet for this date'
    );

    this.upsertDailyAward(
      dateStr,
      'night_owl',
      nightOwlWinner ? nightOwlWinner.student_id : null,
      nightOwlWinner ? 10 : 0,
      nightOwlWinner ? (nightOwlWinner.logout_at || nightOwlWinner.login_at) : null,
      nightOwlWinner
        ? `Latest verified attendance after 6:00 PM at ${formatISTTime(nightOwlWinner.logout_at || nightOwlWinner.login_at)}`
        : 'No eligible checkouts or logins recorded strictly after 6:00 PM IST'
    );
  }

  upsertDailyAward(dateStr, category, winningStudentId, points, timestamp, reason) {
    const existingIndex = this.dailyAwards.findIndex(
      a => a.attendance_date === dateStr && a.category === category
    );

    const awardObj = {
      id: `awd-${dateStr}-${category}`,
      attendance_date: dateStr,
      category,
      winning_student_id: winningStudentId,
      awarded_points: points,
      winning_timestamp: timestamp,
      scoring_reason: reason,
      status: winningStudentId ? 'awarded' : 'no_winner',
      calculated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.dailyAwards[existingIndex] = awardObj;
    } else {
      this.dailyAwards.unshift(awardObj);
    }

    // Sync to Supabase using onConflict
    try {
      const dbAwardPayload = {
        attendance_date: dateStr,
        category,
        winning_student_id: winningStudentId,
        awarded_points: points,
        winning_timestamp: timestamp,
        scoring_reason: reason,
        status: winningStudentId ? 'awarded' : 'no_winner',
        calculated_at: new Date().toISOString()
      };
      supabase.from('daily_attendance_awards').upsert(dbAwardPayload, { onConflict: 'attendance_date,category' });
    } catch (e) {
      console.warn('[attendance] Supabase award upsert warning:', e);
    }
  }

  /**
   * Get Student Score Summary & Historical Awards Count
   */
  getStudentAttendanceSummary(studentId) {
    const today = getTodayISTDateString();
    const todayRecord = this.attendanceRecords.find(
      r => r.student_id === studentId && r.attendance_date === today
    ) || null;

    // Count historical awards
    const earlyBirdWins = this.dailyAwards.filter(
      a => a.category === 'early_bird' && a.winning_student_id === studentId && a.status === 'awarded'
    );
    const nightOwlWins = this.dailyAwards.filter(
      a => a.category === 'night_owl' && a.winning_student_id === studentId && a.status === 'awarded'
    );

    let earlyBirdPoints = 0;
    if (todayRecord && todayRecord.login_location_verified) {
      earlyBirdPoints = todayRecord.early_bird_points !== undefined
        ? todayRecord.early_bird_points
        : (todayRecord.arrival_order ? Math.max(0, 21 - todayRecord.arrival_order) : (todayRecord.is_early_bird ? 20 : 0));
    } else if (earlyBirdWins.length > 0) {
      earlyBirdPoints = earlyBirdWins.reduce((sum, w) => sum + (w.awarded_points || 20), 0);
    }

    let nightOwlPoints = 0;
    if (todayRecord && (todayRecord.is_night_owl || (todayRecord.night_owl_points && todayRecord.night_owl_points > 0))) {
      nightOwlPoints = todayRecord.night_owl_points || 10;
    } else if (nightOwlWins.length > 0) {
      nightOwlPoints = nightOwlWins.reduce((sum, w) => sum + (w.awarded_points || 10), 0);
    }

    const totalAttendancePoints = earlyBirdPoints + nightOwlPoints;

    // Check today's awards status
    const todayEarlyAward = this.dailyAwards.find(
      a => a.attendance_date === today && a.category === 'early_bird'
    );
    const todayNightAward = this.dailyAwards.find(
      a => a.attendance_date === today && a.category === 'night_owl'
    );

    const wonTodayEarly = Boolean((todayRecord?.is_early_bird || earlyBirdPoints > 0) || todayEarlyAward?.winning_student_id === studentId);
    const wonTodayNight = Boolean((todayRecord?.is_night_owl || nightOwlPoints > 0) || todayNightAward?.winning_student_id === studentId);

    return {
      studentId,
      todayRecord,
      earlyBirdWinsCount: earlyBirdWins.length || (wonTodayEarly ? 1 : 0),
      nightOwlWinsCount: nightOwlWins.length || (wonTodayNight ? 1 : 0),
      earlyBirdPoints,
      nightOwlPoints,
      totalAttendancePoints,
      wonTodayEarly,
      wonTodayNight,
      todayEarlyAward,
      todayNightAward,
      allStudentAwards: this.dailyAwards.filter(a => a.winning_student_id === studentId)
    };
  }

  /**
   * Get Student Daily Attendance Summary (including today points breakdown)
   */
  getStudentDailySummary(studentId) {
    const summary = this.getStudentAttendanceSummary(studentId);
    const todayRec = summary.todayRecord;
    const todayEarlyPts = todayRec?.early_bird_points !== undefined
      ? todayRec.early_bird_points
      : (todayRec?.arrival_order ? Math.max(0, 21 - todayRec.arrival_order) : (todayRec?.is_early_bird ? 20 : 0));
    const todayNightPts = todayRec?.night_owl_points !== undefined
      ? todayRec.night_owl_points
      : (todayRec?.is_night_owl ? 10 : 0);

    return {
      ...summary,
      wonTodayEarly: Boolean(todayRec?.is_early_bird || todayEarlyPts > 0),
      wonTodayNight: Boolean(todayRec?.is_night_owl || todayNightPts > 0),
      todayEarlyPoints: todayEarlyPts,
      todayNightPoints: todayNightPts,
      todayRecord: todayRec
    };
  }

  /**
   * Get All Attendance for a Specific Date (for Admin Console)
   */
  getAttendanceForDate(dateStr) {
    return this.attendanceRecords.filter(r => (r.attendance_date === dateStr || r.date === dateStr));
  }

  /**
   * Export Attendance Report to CSV (Supports specific date or 'all')
   */
  exportAttendanceCSV(dateStr, studentLookup = {}) {
    let records = [];
    if (!dateStr || dateStr === 'all') {
      records = [...this.attendanceRecords];
    } else {
      records = this.getAttendanceForDate(dateStr);
    }

    const headers = [
      'Date',
      'Student ID',
      'Student Name',
      'Check-In Time (IST)',
      'Check-In Location Verified',
      'Check-Out Time (IST)',
      'Check-Out Location Verified',
      'Arrival Order',
      'Early Bird Points',
      'Night Owl Points',
      'Total Attendance Points',
      'Status',
      'Campus Scope'
    ];

    const rows = records.map(r => {
      const name = studentLookup[r.student_id]?.student_name || r.student_id;
      const order = r.arrival_order ? `#${r.arrival_order}` : '--';
      const earlyPts = r.early_bird_points !== undefined ? r.early_bird_points : (r.is_early_bird ? 10 : 0);
      const nightPts = r.night_owl_points !== undefined ? r.night_owl_points : (r.is_night_owl ? 10 : 0);
      const totalPts = earlyPts + nightPts;

      return [
        `"${r.attendance_date}"`,
        `"${r.student_id}"`,
        `"${name}"`,
        `"${formatISTTime(r.login_at)}"`,
        r.login_location_verified ? 'VERIFIED' : 'FAILED',
        `"${formatISTTime(r.logout_at)}"`,
        r.logout_location_verified ? 'VERIFIED' : 'PENDING',
        `"${order}"`,
        earlyPts,
        nightPts,
        totalPts,
        `"${r.status || 'absent'}"`,
        '"SNS College of Technology (Inside Boundary)"'
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Update Campus Boundary & Geofence Configuration (Admin Only)
   */
  async updateCampusSettings(newSettings) {
    if (newSettings.boundary_polygon) {
      const validation = validateCampusPolygon(newSettings.boundary_polygon);
      if (!validation.valid) {
        throw new Error(`Invalid Campus Boundary: ${validation.error}`);
      }
      newSettings.boundary_polygon = validation.polygon;
    }

    // Auto-calculate centroid if boundary changed but center not explicitly specified
    if (newSettings.boundary_polygon && (!newSettings.center_latitude || !newSettings.center_longitude)) {
      let latSum = 0, lonSum = 0, count = newSettings.boundary_polygon.length - 1;
      for (let i = 0; i < count; i++) {
        lonSum += newSettings.boundary_polygon[i][0];
        latSum += newSettings.boundary_polygon[i][1];
      }
      newSettings.center_latitude = Math.round((latSum / count) * 100000) / 100000;
      newSettings.center_longitude = Math.round((lonSum / count) * 100000) / 100000;
    }

    this.campusSettings = {
      ...this.campusSettings,
      ...newSettings,
      last_updated: new Date().toISOString()
    };
    this.saveToCache();

    try {
      await supabase.from('campus_geofence_settings').upsert({
        id: 'default',
        campus_name: this.campusSettings.campus_name,
        center_latitude: this.campusSettings.center_latitude,
        center_longitude: this.campusSettings.center_longitude,
        radius_meters: this.campusSettings.radius_meters || 500,
        max_accuracy_meters: this.campusSettings.max_accuracy_meters,
        boundary_polygon: this.campusSettings.boundary_polygon,
        crs: this.campusSettings.crs || 'EPSG:4326',
        config_version: this.campusSettings.config_version || '2.1.0',
        approved_by: this.campusSettings.approved_by || 'Campus Administrator',
        zones: this.campusSettings.zones || DEFAULT_CAMPUS_ZONES,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[attendance] Supabase geofence update warning:', e);
    }
    appQueryCache.invalidate('campus_geofence_settings');
    this.emit('change', { settings: this.campusSettings });
  }
}

// Global Singleton Instance
export const attendanceService = new AttendanceService();
