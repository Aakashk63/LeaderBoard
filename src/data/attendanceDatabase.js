/**
 * Attendance & Geofencing Database Module (Supabase Real-Time Integration)
 * Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
 * Evaluates Early Bird (Earliest check-in) & Late Night Owl (Latest checkout > 18:00 IST)
 */

import { supabase } from './pilotstudyDatabase.js';
import { appQueryCache } from './cacheEngine.js';

// SNS College of Technology, Saravanampatti, Coimbatore Coordinates (Resolved from Google Maps pin)
export const DEFAULT_CAMPUS_SETTINGS = {
  campus_name: 'SNS College of Technology, Coimbatore',
  center_latitude: 11.10043,
  center_longitude: 77.02661,
  radius_meters: 500,
  max_accuracy_meters: 100
};

export const TIMEZONE = 'Asia/Kolkata';

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
      if (cachedSet) this.campusSettings = JSON.parse(cachedSet);

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
        this.campusSettings = setArr[0];
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
      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }

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

          const distance = calculateHaversineDistance(
            lat,
            lng,
            this.campusSettings.center_latitude,
            this.campusSettings.center_longitude
          );

          resolve({
            latitude: lat,
            longitude: lng,
            accuracy: accuracy || 999,
            distance,
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

    // 3. Validating location against campus boundary
    this.setLocationState(LOCATION_STATES.VALIDATING_LOCATION, {
      message: 'Validating coordinates against SNS College of Technology geofence perimeter...',
      coords
    });

    const distance = coords.distance;
    const accuracy = coords.accuracy;

    // Check accuracy threshold
    if (accuracy > this.campusSettings.max_accuracy_meters) {
      this.setLocationState(LOCATION_STATES.INACCURATE_LOCATION, {
        message: `GPS Accuracy Too Low (${Math.round(accuracy)}m reported). Must be within ${this.campusSettings.max_accuracy_meters}m. Please improve GPS reception or enable High Accuracy mode.`,
        accuracy,
        distance,
        coords
      });
      return {
        success: false,
        state: LOCATION_STATES.INACCURATE_LOCATION,
        message: `GPS Accuracy Too Low (${Math.round(accuracy)}m). Threshold is ${this.campusSettings.max_accuracy_meters}m.`,
        accuracy,
        distance
      };
    }

    // Check distance from campus center
    if (distance > this.campusSettings.radius_meters) {
      this.setLocationState(LOCATION_STATES.OUTSIDE_CAMPUS, {
        message: `Outside Campus Boundary: You are ${Math.round(distance)}m from SNS College of Technology. Maximum permitted radius is ${this.campusSettings.radius_meters}m.`,
        accuracy,
        distance,
        coords
      });
      return {
        success: false,
        state: LOCATION_STATES.OUTSIDE_CAMPUS,
        message: `Outside Campus Boundary: You are ${Math.round(distance)}m from SNS College of Technology.`,
        accuracy,
        distance
      };
    }

    // 4. Verification Successful
    this.lastKnownCoords = coords;
    this.scheduleVerificationExpiry(300000); // 5 minutes validity

    const successMsg = `Location Verified! You are within SNS College of Technology campus boundary (${Math.round(distance)}m from center, accuracy: ${Math.round(accuracy)}m).`;
    this.setLocationState(LOCATION_STATES.VERIFIED, {
      message: successMsg,
      accuracy,
      distance,
      coords
    });

    return {
      success: true,
      state: LOCATION_STATES.VERIFIED,
      message: successMsg,
      accuracy,
      distance,
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

    // 2. Validate Geofence Boundary
    if (coords.accuracy > this.campusSettings.max_accuracy_meters) {
      return {
        success: false,
        message: `Location accuracy (${Math.round(coords.accuracy)}m) is below threshold (${this.campusSettings.max_accuracy_meters}m). Please enable High Accuracy GPS.`
      };
    }

    if (coords.distance > this.campusSettings.radius_meters) {
      return {
        success: false,
        message: `Location rejected: You are ${Math.round(coords.distance)}m away from SNS College of Technology. Maximum geofence radius is ${this.campusSettings.radius_meters}m.`
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

    // 2. Validate Geofence
    if (coords.distance > this.campusSettings.radius_meters) {
      return {
        success: false,
        message: `Location rejected: Check-out must be completed within SNS College of Technology (${Math.round(coords.distance)}m away).`
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
      const distance = calculateHaversineDistance(
        r.login_latitude || 0,
        r.login_longitude || 0,
        this.campusSettings.center_latitude,
        this.campusSettings.center_longitude
      );

      return [
        `"${r.student_id}"`,
        `"${name}"`,
        `"${r.attendance_date}"`,
        `"${formatISTTime(r.login_at)}"`,
        r.login_location_verified ? 'VERIFIED' : 'FAILED',
        `"${formatISTTime(r.logout_at)}"`,
        r.logout_location_verified ? 'VERIFIED' : 'NO',
        `"${r.status}"`,
        `"${distance}m"`,
        `"${isEarly}"`,
        `"${isNight}"`
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Update Geofence Configuration
   */
  async updateCampusSettings(newSettings) {
    this.campusSettings = { ...this.campusSettings, ...newSettings };
    this.saveToCache();
    try {
      await supabase.from('campus_geofence_settings').upsert({
        id: 'default',
        ...this.campusSettings,
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
