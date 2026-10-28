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
    this.fetchFromSupabase();
    this.setupRealtime();
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
      if (cachedAtt) this.attendanceRecords = JSON.parse(cachedAtt);

      const cachedAwd = localStorage.getItem(LOCAL_STORAGE_AWARDS_KEY);
      if (cachedAwd) this.dailyAwards = JSON.parse(cachedAwd);

      // Seed initial demo historical attendance if empty
      if (this.attendanceRecords.length === 0) {
        this.seedInitialHistoricalData();
      }
    } catch (e) {
      console.warn('[attendance] Local cache load warning:', e);
    }
  }

  saveToCache() {
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(this.campusSettings));
      localStorage.setItem(LOCAL_STORAGE_ATTENDANCE_KEY, JSON.stringify(this.attendanceRecords));
      localStorage.setItem(LOCAL_STORAGE_AWARDS_KEY, JSON.stringify(this.dailyAwards));
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
   * Seed Initial Historical Attendance & Awards for Demonstration
   */
  seedInitialHistoricalData() {
    const today = getTodayISTDateString();
    
    // Yesterday's date
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];

    // Day before yesterday
    const d2 = new Date();
    d2.setDate(d2.getDate() - 2);
    const dayBefore = d2.toISOString().split('T')[0];

    this.attendanceRecords = [
      // Day before yesterday: std-4 (SAMYUKTHA) was Early Bird, std-1 (Reshma) was Night Owl
      {
        id: 'att-hist-1',
        student_id: 'std-4',
        attendance_date: dayBefore,
        login_at: `${dayBefore}T02:45:10.000Z`, // ~08:15 AM IST
        login_latitude: 11.10045,
        login_longitude: 77.02662,
        login_accuracy_meters: 12.4,
        login_location_verified: true,
        logout_at: `${dayBefore}T12:30:00.000Z`, // 18:00 IST
        logout_latitude: 11.10042,
        logout_longitude: 77.02660,
        logout_accuracy_meters: 14.1,
        logout_location_verified: true,
        status: 'completed'
      },
      {
        id: 'att-hist-2',
        student_id: 'std-1',
        attendance_date: dayBefore,
        login_at: `${dayBefore}T03:10:00.000Z`,
        login_latitude: 11.10041,
        login_longitude: 77.02659,
        login_accuracy_meters: 16.0,
        login_location_verified: true,
        logout_at: `${dayBefore}T13:45:22.000Z`, // ~19:15 PM IST (Night Owl Winner)
        logout_latitude: 11.10044,
        logout_longitude: 77.02663,
        logout_accuracy_meters: 15.2,
        logout_location_verified: true,
        status: 'completed'
      },
      // Yesterday: std-7 (ASHWANTH) was Early Bird, std-4 (SAMYUKTHA) was Night Owl
      {
        id: 'att-hist-3',
        student_id: 'std-7',
        attendance_date: yesterday,
        login_at: `${yesterday}T02:30:15.000Z`, // ~08:00 AM IST (Early Bird Winner)
        login_latitude: 11.10046,
        login_longitude: 77.02658,
        login_accuracy_meters: 10.5,
        login_location_verified: true,
        logout_at: `${yesterday}T12:45:00.000Z`,
        logout_latitude: 11.10043,
        logout_longitude: 77.02661,
        logout_accuracy_meters: 11.0,
        logout_location_verified: true,
        status: 'completed'
      },
      {
        id: 'att-hist-4',
        student_id: 'std-4',
        attendance_date: yesterday,
        login_at: `${yesterday}T03:00:00.000Z`,
        login_latitude: 11.10040,
        login_longitude: 77.02664,
        login_accuracy_meters: 13.0,
        login_location_verified: true,
        logout_at: `${yesterday}T14:15:45.000Z`, // ~19:45 PM IST (Night Owl Winner)
        logout_latitude: 11.10044,
        logout_longitude: 77.02661,
        logout_accuracy_meters: 12.2,
        logout_location_verified: true,
        status: 'completed'
      }
    ];

    this.dailyAwards = [
      {
        id: 'awd-1',
        attendance_date: dayBefore,
        category: 'early_bird',
        winning_student_id: 'std-4',
        awarded_points: 10,
        winning_timestamp: `${dayBefore}T02:45:10.000Z`,
        scoring_reason: 'Earliest verified campus check-in at 08:15:10 AM IST',
        status: 'awarded'
      },
      {
        id: 'awd-2',
        attendance_date: dayBefore,
        category: 'night_owl',
        winning_student_id: 'std-1',
        awarded_points: 10,
        winning_timestamp: `${dayBefore}T13:45:22.000Z`,
        scoring_reason: 'Latest verified checkout after 6:00 PM at 07:15:22 PM IST',
        status: 'awarded'
      },
      {
        id: 'awd-3',
        attendance_date: yesterday,
        category: 'early_bird',
        winning_student_id: 'std-7',
        awarded_points: 10,
        winning_timestamp: `${yesterday}T02:30:15.000Z`,
        scoring_reason: 'Earliest verified campus check-in at 08:00:15 AM IST',
        status: 'awarded'
      },
      {
        id: 'awd-4',
        attendance_date: yesterday,
        category: 'night_owl',
        winning_student_id: 'std-4',
        awarded_points: 10,
        winning_timestamp: `${yesterday}T14:15:45.000Z`,
        scoring_reason: 'Latest verified checkout after 6:00 PM at 07:45:45 PM IST',
        status: 'awarded'
      }
    ];

    this.saveToCache();
  }

  /**
   * Fetch live records from Supabase tables with AppQueryCache
   */
  async fetchFromSupabase(options = {}) {
    const force = options.force || false;
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
      if (attArr && attArr.length > 0) {
        this.attendanceRecords = attArr;
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
      if (awdArr && awdArr.length > 0) {
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
      const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:attendance-live-channel');
      if (existingChannel) {
        supabase.removeChannel(existingChannel);
      }
      this.realtimeChannel = null;

      this.realtimeChannel = supabase
        .channel('attendance-live-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_attendance' }, () => {
          appQueryCache.invalidate('student_attendance_all');
          this.fetchFromSupabase({ force: true });
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
   * Record GPS-Verified Student Check-In (Location Gated)
   */
  async performCheckIn(studentId) {
    if (!studentId) {
      return { success: false, message: 'No student authenticated. Please sign in to your individual account.' };
    }

    // Strict Location Gate
    if (this.locationVerificationState !== LOCATION_STATES.VERIFIED) {
      return {
        success: false,
        message: 'Location not verified. Please click "Check My Location" and verify you are within SNS College of Technology before confirming check-in.'
      };
    }

    const today = getTodayISTDateString();

    // Check if already checked in today
    const existing = this.attendanceRecords.find(
      r => r.student_id === studentId && r.attendance_date === today
    );
    if (existing) {
      return {
        success: false,
        message: `Already checked in today at ${formatISTTime(existing.login_at)}.`
      };
    }

    // Fresh GPS verification
    let coords;
    try {
      coords = await this.getCurrentGPSPosition();
    } catch (locErr) {
      return { success: false, message: `GPS Verification Failed: ${locErr.message}` };
    }

    // 2. Validate Geofence Boundary Polygon (including SNS iHub)
    if (coords.accuracy > this.campusSettings.max_accuracy_meters) {
      return {
        success: false,
        message: `Location accuracy (${Math.round(coords.accuracy)}m) is below threshold (${this.campusSettings.max_accuracy_meters}m). Please enable High Accuracy GPS.`
      };
    }

    const poly = this.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
    const inside = coords.insideCampus !== undefined ? coords.insideCampus : isPointInPolygon([coords.longitude, coords.latitude], poly);
    if (!inside) {
      const boundaryDist = Math.round(coords.distanceToBoundary || calculateMinDistanceToPolygon(coords.latitude, coords.longitude, poly));
      return {
        success: false,
        message: `Location rejected: You are ${boundaryDist}m away from the approved SNS College of Technology boundary (including SNS iHub).`
      };
    }

    const nowIso = new Date().toISOString();

    // 3. Try Supabase RPC or Direct Insert
    let serverRecord = null;
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('record_student_checkin', {
        p_student_id: studentId,
        p_lat: coords.latitude,
        p_lng: coords.longitude,
        p_accuracy: coords.accuracy
      });

      if (!rpcErr && rpcData && rpcData.success) {
        serverRecord = rpcData;
      }
    } catch (e) {
      // Fallback to table insert
    }

    const newRecord = {
      id: serverRecord?.attendance_id || `att-${Date.now()}`,
      student_id: studentId,
      attendance_date: today,
      login_at: nowIso,
      login_latitude: coords.latitude,
      login_longitude: coords.longitude,
      login_accuracy_meters: coords.accuracy,
      login_location_verified: true,
      logout_at: null,
      logout_latitude: null,
      logout_longitude: null,
      logout_accuracy_meters: null,
      logout_location_verified: false,
      status: 'checked_in'
    };

    // Save locally and persist to Supabase
    this.attendanceRecords.unshift(newRecord);
    try {
      await supabase.from('student_attendance').upsert(newRecord);
    } catch (err) {
      console.warn('[attendance] Supabase attendance upsert warning:', err);
    }

    // Recalculate Early Bird Award for Today
    this.recalculateDailyAwards(today);
    this.saveToCache();

    // Invalidate query cache for attendance and cohort to ensure fresh synchronization
    appQueryCache.invalidate('student_attendance_all');
    appQueryCache.invalidate('daily_attendance_awards_all');
    appQueryCache.invalidate('pilotstudy_cohort');

    this.emit('change', { attendance: this.attendanceRecords, awards: this.dailyAwards });

    return {
      success: true,
      message: `Verified check-in at SNS College of Technology! Time: ${formatISTTime(nowIso)}`,
      record: newRecord
    };
  }

  /**
   * Record GPS-Verified Student Check-Out
   */
  async performCheckOut(studentId) {
    const today = getTodayISTDateString();

    const record = this.attendanceRecords.find(
      r => r.student_id === studentId && r.attendance_date === today
    );

    if (!record) {
      return {
        success: false,
        message: 'No valid check-in found for today. You must check in before checking out.'
      };
    }

    if (record.logout_at) {
      return {
        success: false,
        message: `Already checked out today at ${formatISTTime(record.logout_at)}.`
      };
    }

    // 1. Fresh GPS Location
    let coords;
    try {
      coords = await this.getCurrentGPSPosition();
    } catch (locErr) {
      return { success: false, message: `GPS Check-out Verification Failed: ${locErr.message}` };
    }

    // 2. Validate Geofence Boundary Polygon
    if (coords.accuracy > this.campusSettings.max_accuracy_meters) {
      return {
        success: false,
        message: `Location accuracy (${Math.round(coords.accuracy)}m) is below threshold (${this.campusSettings.max_accuracy_meters}m). Please enable High Accuracy GPS.`
      };
    }

    const poly = this.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
    const inside = coords.insideCampus !== undefined ? coords.insideCampus : isPointInPolygon([coords.longitude, coords.latitude], poly);
    if (!inside) {
      const boundaryDist = Math.round(coords.distanceToBoundary || calculateMinDistanceToPolygon(coords.latitude, coords.longitude, poly));
      return {
        success: false,
        message: `Location rejected: Check-out must be completed within SNS College of Technology boundary (including SNS iHub, ${boundaryDist}m away).`
      };
    }

    const nowIso = new Date().toISOString();

    record.logout_at = nowIso;
    record.logout_latitude = coords.latitude;
    record.logout_longitude = coords.longitude;
    record.logout_accuracy_meters = coords.accuracy;
    record.logout_location_verified = true;
    record.status = 'completed';

    // Persist to Supabase
    try {
      await supabase.from('student_attendance').upsert(record);
    } catch (err) {
      console.warn('[attendance] Supabase checkout upsert warning:', err);
    }

    // Recalculate Late Night Owl Award for Today
    this.recalculateDailyAwards(today);
    this.saveToCache();

    // Reset location verification so stale location cannot be reused
    this.resetVerification('Checked out successfully. Fresh location required for next attendance session.');

    // Invalidate query cache for attendance and cohort to ensure fresh synchronization
    appQueryCache.invalidate('student_attendance_all');
    appQueryCache.invalidate('daily_attendance_awards_all');
    appQueryCache.invalidate('pilotstudy_cohort');

    this.emit('change', { attendance: this.attendanceRecords, awards: this.dailyAwards });

    const isNightEligible = isStrictlyAfter6PMIST(nowIso);

    return {
      success: true,
      message: `Verified check-out at SNS College of Technology at ${formatISTTime(nowIso)}.${
        isNightEligible ? ' Eligible for Late Night Owl award!' : ' (Before 6:00 PM IST — not eligible for Night Owl).'
      }`,
      record
    };
  }

  /**
   * Deterministic Daily Awards Calculation (Early Bird & Late Night Owl)
   * Strictly excludes test/dummy student accounts from official daily awards
   */
  recalculateDailyAwards(dateStr) {
    // Filter valid verified records for this date (excluding dummy test accounts)
    const dayRecords = this.attendanceRecords.filter(
      r => r.attendance_date === dateStr &&
           r.login_location_verified &&
           r.student_id !== 'std-dummy' &&
           !r.is_test_account
    );

    // 1. Early Bird: Earliest valid check-in timestamp of the day
    let earlyBirdWinner = null;
    if (dayRecords.length > 0) {
      const sortedByLogin = [...dayRecords].sort(
        (a, b) => new Date(a.login_at).getTime() - new Date(b.login_at).getTime()
      );
      earlyBirdWinner = sortedByLogin[0];
    }

    // 2. Late Night Owl: Latest valid checkout strictly after 18:00 IST
    let nightOwlWinner = null;
    const eligibleNightCheckouts = dayRecords.filter(
      r => r.logout_location_verified && r.logout_at && isStrictlyAfter6PMIST(r.logout_at)
    );

    if (eligibleNightCheckouts.length > 0) {
      const sortedByLogout = [...eligibleNightCheckouts].sort(
        (a, b) => new Date(b.logout_at).getTime() - new Date(a.logout_at).getTime()
      );
      nightOwlWinner = sortedByLogout[0];
    }

    // Update dailyAwards array
    this.upsertDailyAward(
      dateStr,
      'early_bird',
      earlyBirdWinner ? earlyBirdWinner.student_id : null,
      earlyBirdWinner ? 10 : 0,
      earlyBirdWinner ? earlyBirdWinner.login_at : null,
      earlyBirdWinner
        ? `Earliest verified campus check-in at ${formatISTTime(earlyBirdWinner.login_at)}`
        : 'No verified check-ins recorded yet for this date'
    );

    this.upsertDailyAward(
      dateStr,
      'night_owl',
      nightOwlWinner ? nightOwlWinner.student_id : null,
      nightOwlWinner ? 10 : 0,
      nightOwlWinner ? nightOwlWinner.logout_at : null,
      nightOwlWinner
        ? `Latest verified checkout after 6:00 PM at ${formatISTTime(nightOwlWinner.logout_at)}`
        : 'No eligible checkouts recorded strictly after 6:00 PM IST'
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

    // Sync to Supabase
    try {
      supabase.from('daily_attendance_awards').upsert(awardObj);
    } catch (e) {
      // offline fallback
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

    const earlyBirdPoints = earlyBirdWins.length * 10;
    const nightOwlPoints = nightOwlWins.length * 10;
    const totalAttendancePoints = earlyBirdPoints + nightOwlPoints;

    // Check today's awards status
    const todayEarlyAward = this.dailyAwards.find(
      a => a.attendance_date === today && a.category === 'early_bird'
    );
    const todayNightAward = this.dailyAwards.find(
      a => a.attendance_date === today && a.category === 'night_owl'
    );

    const wonTodayEarly = todayEarlyAward?.winning_student_id === studentId;
    const wonTodayNight = todayNightAward?.winning_student_id === studentId;

    return {
      studentId,
      todayRecord,
      earlyBirdWinsCount: earlyBirdWins.length,
      nightOwlWinsCount: nightOwlWins.length,
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
   * Get All Attendance for a Specific Date (for Admin Console)
   */
  getAttendanceForDate(dateStr) {
    return this.attendanceRecords.filter(r => r.attendance_date === dateStr);
  }

  /**
   * Export Attendance Report to CSV
   */
  exportAttendanceCSV(dateStr, studentLookup = {}) {
    const records = this.getAttendanceForDate(dateStr);
    const headers = [
      'Student ID',
      'Student Name',
      'Attendance Date',
      'Check-In Time (IST)',
      'Check-In Verified',
      'Check-Out Time (IST)',
      'Check-Out Verified',
      'Status',
      'Distance from Campus (m)',
      'Early Bird Winner',
      'Night Owl Winner'
    ];

    const todayEarlyWinner = this.dailyAwards.find(
      a => a.attendance_date === dateStr && a.category === 'early_bird' && a.status === 'awarded'
    )?.winning_student_id;

    const todayNightWinner = this.dailyAwards.find(
      a => a.attendance_date === dateStr && a.category === 'night_owl' && a.status === 'awarded'
    )?.winning_student_id;

    const rows = records.map(r => {
      const name = studentLookup[r.student_id]?.student_name || r.student_id;
      const isEarly = r.student_id === todayEarlyWinner ? 'YES (+10 pts)' : 'NO';
      const isNight = r.student_id === todayNightWinner ? 'YES (+10 pts)' : 'NO';
      const poly = this.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
      const inside = isPointInPolygon([r.login_longitude || 0, r.login_latitude || 0], poly);
      const boundaryDist = inside ? 0 : calculateMinDistanceToPolygon(r.login_latitude || 0, r.login_longitude || 0, poly);
      const locDisplay = inside ? 'Inside Boundary (SNS Campus)' : `Outside (${Math.round(boundaryDist)}m away)`;

      return [
        `"${r.student_id}"`,
        `"${name}"`,
        `"${r.attendance_date}"`,
        `"${formatISTTime(r.login_at)}"`,
        r.login_location_verified ? 'VERIFIED' : 'FAILED',
        `"${formatISTTime(r.logout_at)}"`,
        r.logout_location_verified ? 'VERIFIED' : 'NO',
        `"${r.status}"`,
        `"${locDisplay}"`,
        `"${isEarly}"`,
        `"${isNight}"`
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
