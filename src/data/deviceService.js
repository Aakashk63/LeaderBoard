/**
 * Device Identification & One Device - One Account Enforcement Module
 * Pilot Study Program - SNS College of Technology
 * 
 * Strict Enforcement:
 * 1. A single physical device (mobile, laptop, or desktop) is bound to strictly ONE student account.
 * 2. If Account A is registered on Device 1, Account B is BLOCKED with the exact requirement message:
 *    "This device is already registered with another account. Only one account can be logged in from a single device."
 * 3. Logging out preserves the binding. Account A can log back in anytime.
 * 4. Multi-layer persistence (localStorage + IndexedDB + CacheStorage + Hardware Fingerprinting)
 *    ensures bindings cannot be bypassed by clearing cookies, browser refresh, device restart, or incognito mode.
 * 5. Backend and cloud database validation via Supabase authoritative store.
 * 6. Authorized administrators can release/reset device associations.
 */

import { supabase } from './pilotstudyDatabase.js';

const DEVICE_STORAGE_KEY = '_snsct_device_token_v2';
const DEVICE_BINDING_KEY = '_snsct_device_account_binding_v2';
const DB_STORE_NAME = 'SNSCT_Device_Vault';
const DB_OBJECT_STORE = 'device_meta';
const CACHE_STORE_NAME = 'snsct-device-security-v2';

export const ONE_ACCOUNT_PER_DEVICE_ERROR =
  'This device is already registered with another account. Only one account can be logged in from a single device.';

/**
 * Fast deterministic 32-bit string hashing
 */
function hashString(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Generate a random UUID string (works in Browser and Node.js)
 */
function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * IndexedDB helper for resilient persistence across storage resets
 */
async function getFromIndexedDB(key) {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_STORE_NAME, 1);
      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_OBJECT_STORE)) {
          db.createObjectStore(DB_OBJECT_STORE);
        }
      };
      request.onsuccess = e => {
        try {
          const db = e.target.result;
          const tx = db.transaction(DB_OBJECT_STORE, 'readonly');
          const store = tx.objectStore(DB_OBJECT_STORE);
          const getReq = store.get(key);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

async function saveToIndexedDB(key, val) {
  if (typeof window === 'undefined' || !window.indexedDB) return false;
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_STORE_NAME, 1);
      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_OBJECT_STORE)) {
          db.createObjectStore(DB_OBJECT_STORE);
        }
      };
      request.onsuccess = e => {
        try {
          const db = e.target.result;
          const tx = db.transaction(DB_OBJECT_STORE, 'readwrite');
          const store = tx.objectStore(DB_OBJECT_STORE);
          store.put(val, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      };
      request.onerror = () => resolve(false);
    } catch (err) {
      resolve(false);
    }
  });
}

async function getFromCacheStorage(key) {
  if (typeof window === 'undefined' || !window.caches) return null;
  try {
    const cache = await caches.open(CACHE_STORE_NAME);
    const match = await cache.match(new Request(`/__snsct_security/${key}`));
    if (match) {
      return await match.text();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function saveToCacheStorage(key, val) {
  if (typeof window === 'undefined' || !window.caches) return false;
  try {
    const cache = await caches.open(CACHE_STORE_NAME);
    await cache.put(
      new Request(`/__snsct_security/${key}`),
      new Response(String(val), { headers: { 'Content-Type': 'text/plain' } })
    );
    return true;
  } catch (e) {
    // ignore
  }
  return false;
}

/**
 * Generate a high-entropy hardware and environment fingerprint
 * Resilient against Incognito mode and different browsers on the same physical device.
 */
export function generateHardwareFingerprint() {
  if (typeof window === 'undefined') {
    // Node.js test environment fingerprint
    const nodeEnv = (typeof process !== 'undefined')
      ? `${process.platform}_${process.arch}_${process.version}_${process.env.COMPUTERNAME || process.env.HOSTNAME || 'test_host'}`
      : 'node_test_env';
    return 'hw_' + hashString(nodeEnv);
  }

  const parts = [];

  // 1. Screen & Display Stack
  try {
    parts.push(`scr:${window.screen?.width}x${window.screen?.height}x${window.screen?.colorDepth}x${window.devicePixelRatio}`);
    parts.push(`avail:${window.screen?.availWidth}x${window.screen?.availHeight}`);
  } catch (e) {}

  // 2. Hardware Concurrency & Memory
  try {
    parts.push(`cpu:${navigator.hardwareConcurrency || 4}`);
    parts.push(`mem:${navigator.deviceMemory || 8}`);
    parts.push(`plat:${navigator.platform || ''}`);
    parts.push(`touch:${navigator.maxTouchPoints || 0}`);
  } catch (e) {}

  // 3. Timezone & Locale
  try {
    parts.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    parts.push(`tzo:${new Date().getTimezoneOffset()}`);
  } catch (e) {}

  // 4. Canvas GPU Rendering Fingerprint
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial', 'Noto Color Emoji', sans-serif";
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SNSCT-Sec-🔒-🎓-2026', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('SNSCT-Sec-🔒-🎓-2026', 4, 17);
      // Geometric arc & gradient
      const grad = ctx.createLinearGradient(0, 0, 200, 0);
      grad.addColorStop(0, '#f00');
      grad.addColorStop(1, '#00f');
      ctx.fillStyle = grad;
      ctx.arc(50, 40, 15, 0, Math.PI * 2, true);
      ctx.fill();
      parts.push(`canvas:${hashString(canvas.toDataURL())}`);
    }
  } catch (e) {}

  // 5. WebGL GPU Vendor & Renderer
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        parts.push(`glv:${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)}`);
        parts.push(`glr:${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}`);
      }
      parts.push(`max_tex:${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);
    }
  } catch (e) {}

  return 'hw_' + hashString(parts.join('||'));
}

export class DeviceService {
  constructor() {
    this.cachedDeviceId = null;
    this.cachedHardwareHash = null;
    this.localBindingsCache = [];
    this.isInitialized = false;

    // Load initial device token
    this.initPromise = this.initDeviceIdentity();
  }

  /**
   * Initializes or restores the unique persistent device token across all storage layers
   */
  async initDeviceIdentity() {
    if (this.isInitialized && this.cachedDeviceId) {
      return { deviceId: this.cachedDeviceId, hardwareHash: this.cachedHardwareHash };
    }

    const hwHash = generateHardwareFingerprint();
    this.cachedHardwareHash = hwHash;

    // 1. Check localStorage
    let storedId = null;
    try {
      if (typeof localStorage !== 'undefined') {
        storedId = localStorage.getItem(DEVICE_STORAGE_KEY);
      }
    } catch (e) {}

    // 2. Check IndexedDB
    if (!storedId) {
      storedId = await getFromIndexedDB('device_id');
    }

    // 3. Check CacheStorage
    if (!storedId) {
      storedId = await getFromCacheStorage('device_id');
    }

    // 4. If not found in any persistent storage, generate a new device UUID
    if (!storedId) {
      storedId = 'dev_' + generateUuid();
    }

    this.cachedDeviceId = storedId;

    // Self-healing: persist the ID across all layers
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_STORAGE_KEY, storedId);
      }
    } catch (e) {}
    saveToIndexedDB('device_id', storedId).catch(() => {});
    saveToCacheStorage('device_id', storedId).catch(() => {});

    this.isInitialized = true;
    return { deviceId: this.cachedDeviceId, hardwareHash: this.cachedHardwareHash };
  }

  /**
   * Get current device identifiers
   */
  async getDeviceIdentity() {
    if (!this.cachedDeviceId) {
      await this.initDeviceIdentity();
    }
    return {
      deviceId: this.cachedDeviceId,
      hardwareHash: this.cachedHardwareHash || generateHardwareFingerprint()
    };
  }

  /**
   * Fetch authoritative device bindings from Supabase database
   */
  async fetchAuthoritativeRegistry() {
    try {
      const res = await supabase
        .from('campus_geofence_settings')
        .select('zones, updated_at')
        .eq('id', 'device_registry')
        .maybeSingle();

      if (!res.error && res.data && Array.isArray(res.data.zones)) {
        this.localBindingsCache = res.data.zones;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(res.data.zones));
          }
        } catch (e) {}
        return this.localBindingsCache;
      }
    } catch (e) {
      console.warn('[deviceService] Supabase registry fetch notice:', e);
    }

    // Fallback to local cached registry
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(DEVICE_BINDING_KEY);
        if (cached) {
          this.localBindingsCache = JSON.parse(cached);
          return this.localBindingsCache;
        }
      }
    } catch (e) {}

    return this.localBindingsCache || [];
  }

  /**
   * Validate if this device is authorized to log in as the specified student
   * 
   * Strict Rules:
   * 1. If device is already registered to Student A, and Student B tries to log in:
   *    BLOCK with ONE_ACCOUNT_PER_DEVICE_ERROR
   * 2. If device is already registered to Student A, and Student A logs in (even after logout):
   *    ALLOW
   * 3. If device is not yet registered:
   *    ALLOW (will be bound upon successful credential verification)
   */
  async validateDeviceForLogin({ studentId, email, deviceId, hardwareHash, role = 'student' }) {
    // Mentor/Admin bypass: Administrators manage the system and can log in to admin view
    if (role === 'mentor' || role === 'admin') {
      return { allowed: true, isAdmin: true };
    }

    const devId = deviceId || this.cachedDeviceId || (await this.getDeviceIdentity()).deviceId;
    const hwHash = hardwareHash || this.cachedHardwareHash || generateHardwareFingerprint();

    const registry = await this.fetchAuthoritativeRegistry();

    // Check if this physical device (either deviceId or hardwareHash) is bound to ANY account
    const existingBinding = registry.find(b => 
      b.status !== 'revoked' && (
        (devId && b.device_id === devId) ||
        (hwHash && b.hardware_hash === hwHash)
      )
    );

    if (existingBinding) {
      const cleanTargetId = (studentId || '').trim().toLowerCase();
      const cleanTargetEmail = (email || '').trim().toLowerCase();
      const boundId = (existingBinding.student_id || '').trim().toLowerCase();
      const boundEmail = (existingBinding.email || '').trim().toLowerCase();

      const isSameAccount = boundId === cleanTargetId || boundEmail === cleanTargetEmail;

      if (!isSameAccount) {
        return {
          allowed: false,
          registeredStudentId: existingBinding.student_id,
          registeredStudentName: existingBinding.student_name,
          message: ONE_ACCOUNT_PER_DEVICE_ERROR
        };
      }

      // Same account logging in again on its registered device: Allowed
      return {
        allowed: true,
        isExistingDeviceForAccount: true,
        message: 'Device authorized for registered account.'
      };
    }

    // Device not yet bound to any account: Allowed
    return {
      allowed: true,
      isNewDevice: true,
      message: 'Device eligible for association.'
    };
  }

  /**
   * Bind this device to the authenticated student account in Supabase database
   */
  async bindDeviceToAccount({ studentId, studentName, email, deviceId, hardwareHash }) {
    const devId = deviceId || this.cachedDeviceId || (await this.getDeviceIdentity()).deviceId;
    const hwHash = hardwareHash || this.cachedHardwareHash || generateHardwareFingerprint();
    const nowIso = new Date().toISOString();

    const newBinding = {
      device_id: devId,
      hardware_hash: hwHash,
      student_id: studentId,
      student_name: studentName,
      email: email,
      bound_at: nowIso,
      last_login_at: nowIso,
      status: 'active',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js Test Agent'
    };

    // 1. Fetch current registry
    const registry = await this.fetchAuthoritativeRegistry();

    // Remove any previous active binding for this device or update it
    const updated = registry.filter(b => b.device_id !== devId && b.hardware_hash !== hwHash);
    updated.push(newBinding);

    this.localBindingsCache = updated;

    // 2. Persist to Supabase campus_geofence_settings (id: 'device_registry')
    try {
      await supabase
        .from('campus_geofence_settings')
        .upsert({
          id: 'device_registry',
          campus_name: 'Device Registry Store',
          center_latitude: 0,
          center_longitude: 0,
          radius_meters: 0,
          max_accuracy_meters: 0,
          boundary_polygon: [],
          zones: updated,
          approved_by: 'One Device One Account Security Gate',
          updated_at: nowIso
        });
    } catch (e) {
      console.warn('[deviceService] Supabase binding sync notice:', e);
    }

    // 3. Persist to local cache layers
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(updated));
      }
    } catch (e) {}

    return { success: true, binding: newBinding };
  }

  /**
   * Release / Reset a device binding (Admin Only)
   */
  async adminResetDeviceBinding({ studentId, deviceId, hardwareHash, requestingRole = 'admin' }) {
    if (requestingRole !== 'admin' && requestingRole !== 'mentor') {
      return { success: false, message: 'Permission Denied: Only administrators can reset device associations.' };
    }

    const registry = await this.fetchAuthoritativeRegistry();
    const targetHw = new Set();
    if (hardwareHash) targetHw.add(hardwareHash);
    if (deviceId) {
      registry.forEach(b => {
        if (b.device_id === deviceId && b.hardware_hash) targetHw.add(b.hardware_hash);
      });
    }
    if (studentId) {
      registry.forEach(b => {
        if (b.student_id === studentId && b.hardware_hash) targetHw.add(b.hardware_hash);
      });
    }

    const filtered = registry.filter(b => {
      if (studentId && b.student_id === studentId) return false;
      if (deviceId && b.device_id === deviceId) return false;
      if (b.hardware_hash && targetHw.has(b.hardware_hash)) return false;
      return true;
    });

    this.localBindingsCache = filtered;
    const nowIso = new Date().toISOString();

    try {
      await supabase
        .from('campus_geofence_settings')
        .upsert({
          id: 'device_registry',
          campus_name: 'Device Registry Store',
          center_latitude: 0,
          center_longitude: 0,
          radius_meters: 0,
          max_accuracy_meters: 0,
          boundary_polygon: [],
          crs: 'EPSG:4326',
          config_version: '2.1.0',
          approved_by: 'One Device One Account Security Gate',
          zones: filtered,
          updated_at: nowIso
        });
    } catch (e) {
      console.warn('[deviceService] Supabase admin reset error:', e);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(filtered));
      }
    } catch (e) {}

    return {
      success: true,
      message: `Device association successfully released by Administrator.`,
      remainingBindings: filtered
    };
  }

  /**
   * Get all registered device bindings (for Admin review)
   */
  async getAllRegisteredDevices() {
    return await this.fetchAuthoritativeRegistry();
  }
}

// Global Singleton Instance
export const deviceService = new DeviceService();
if (typeof window !== 'undefined') window.deviceService = deviceService;
if (typeof globalThis !== 'undefined') globalThis.deviceService = deviceService;
