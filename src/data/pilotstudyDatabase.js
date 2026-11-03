/**
 * Database Module: pilotstudy (Supabase Real-Time Integration)
 * Authoritative cloud persistence for Student Leaderboard & Points Management
 */

import { createClient } from '@supabase/supabase-js';
import { attendanceService } from './attendanceDatabase.js';
import { appQueryCache } from './cacheEngine.js';
import { INITIAL_STUDENTS } from './initialData.js';

// Environment credentials (works seamlessly in both Vite and Node.js testing runtimes)
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  'https://iridkxcusdcwqgtytspg.supabase.co';

const SUPABASE_KEY = (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  'sb_publishable_E8QXnrStdwmwIAFtt_c2RQ_We3OAfRx';

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

export const MAX_SCORE = 145;
export const MAX_ONE_TIME_SCORE = 105;

// The Mentor-Evaluated Scoring Categories (including Today Review Mark)
export const ONE_TIME_CATEGORIES = [
  { id: 'today_review', name: 'Today Review Mark', maxPoints: 20, defaultPts: 0, description: 'Daily performance review evaluated directly by mentors' },
  { id: 'leetcode', name: 'LeetCode Champion', maxPoints: 10, defaultPts: 10 },
  { id: 'empathizer', name: 'Best Empathizer', maxPoints: 5, defaultPts: 5 },
  { id: 'workbench', name: 'Hands-on Planner (Workbench)', maxPoints: 10, defaultPts: 8 },
  { id: 'frontend', name: 'Visual Treater (Frontend)', maxPoints: 10, defaultPts: 9 },
  { id: 'dt_playbook', name: 'Journalizer (DT Playbook)', maxPoints: 5, defaultPts: 4 },
  { id: 'assessment', name: 'Assessment Cracker', maxPoints: 5, defaultPts: 4 },
  { id: 'okr', name: 'OKR Finalizer', maxPoints: 5, defaultPts: 4 },
  { id: 'all_rounder', name: 'All-Round Performer', maxPoints: 25, defaultPts: 20 },
  { id: 'team_lead', name: 'Best Team Lead', maxPoints: 25, defaultPts: 22 }
];

// The 2 Daily Attendance Categories (Max 20 pts each per day)
export const DAILY_ATTENDANCE_CATEGORIES = [
  { id: 'early_bird', name: 'Early Bird (Login Order)', maxPoints: 20, pointsPerDay: 20 },
  { id: 'night_owl', name: 'Checkout Reward (Logout Order)', maxPoints: 20, pointsPerDay: 20 }
];

// All 11 Scoring Categories (with fixed bounds)
export const SCORING_CATEGORIES = [
  { id: 'early_bird', name: 'Early Bird (Login Order)', maxPoints: 20, defaultPts: 0 },
  { id: 'night_owl', name: 'Checkout Reward (Logout Order)', maxPoints: 20, defaultPts: 0 },
  ...ONE_TIME_CATEGORIES
];

// Color gradients for circular avatars (Enrolled cohort students)
export const AVATAR_PALETTES = {
  'std-1': 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
  'std-2': 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
  'std-3': 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  'std-4': 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
  'std-5': 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  'std-6': 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  'std-7': 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
  'std-8': 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
  'std-9': 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  'std-10': 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
  'std-11': 'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
  'std-12': 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)',
  'std-13': 'linear-gradient(135deg, #84cc16 0%, #4d7c0f 100%)',
  'std-14': 'linear-gradient(135deg, #d97706 0%, #78350f 100%)',
  'std-15': 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)',
  'std-16': 'linear-gradient(135deg, #ec4899 0%, #9d174d 100%)',
  'std-17': 'linear-gradient(135deg, #0284c7 0%, #075985 100%)',
  'std-18': 'linear-gradient(135deg, #9333ea 0%, #581c87 100%)',
  'std-19': 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
};

const LOCAL_STORAGE_CACHE_KEY = 'pilotstudy_cache_v3';

export class PilotStudyRealtimeDatabase {
  constructor() {
    this.students = [];
    this.listeners = {
      change: [],
      status: [],
      saving: []
    };
    this.isSupabaseConnected = false;
    this.isSaving = false;
    this.realtimeChannel = null;
    this.lastSyncTime = null;

    // Load initial local cache if present
    this.loadFromCache();
    // Fetch authoritative data from Supabase
    this.fetchFromSupabase({ force: true });
    // Subscribe to Realtime changes
    this.setupRealtimeSubscription();

    // Listen for attendance and daily award changes to update cumulative scores live
    setTimeout(() => {
      try {
        if (typeof attendanceService !== 'undefined' && attendanceService && attendanceService.on) {
          attendanceService.on('change', () => {
            if (this.students && this.students.length > 0) {
              this.students = this.students.map(record => this.normalizeStudentRecord(record));
              this.recalculateRanks();
              this.saveToCache();
              this.emit('change', this.students);
            }
          });
        }
      } catch (e) {
        // Cyclic import safe fallback
      }
    }, 0);
  }

  loadFromCache() {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const allowedIds = INITIAL_STUDENTS.map(s => s.id);
          const filtered = parsed.filter(s => allowedIds.includes(s.id));
          if (filtered.length === INITIAL_STUDENTS.length) {
            this.students = filtered;
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[pilotstudy] Local cache read error:', e);
    }

    if (!this.students || this.students.length === 0) {
      this.students = INITIAL_STUDENTS.map(s => this.normalizeStudentRecord({
        id: s.id,
        student_name: s.name,
        category_scores: {}
      }));
      this.recalculateRanks();
    }
  }

  saveToCache() {
    try {
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(this.students));
    } catch (e) {
      console.warn('[pilotstudy] Local cache save error:', e);
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[pilotstudy] Error in '${event}' event listener:`, e);
        }
      });
    }
  }

  /**
   * Fetch authoritative records from Supabase pilotstudy table with SWR Caching & Deduplication
   */
  async fetchFromSupabase(options = {}) {
    const force = options.force !== undefined ? options.force : true;
    if (force) {
      appQueryCache.invalidate('pilotstudy_cohort_v3');
      appQueryCache.invalidate('pilotstudy_cohort');
    }
    const allowedIds = INITIAL_STUDENTS.map(s => s.id);
    try {
      const { data, fromCache, isStale } = await appQueryCache.fetchQuery(
        'pilotstudy_cohort_v3',
        async () => {
          const res = await supabase
            .from('pilotstudy')
            .select('*')
            .in('id', allowedIds)
            .order('id', { ascending: true });
          if (res.error) throw res.error;
          return res.data;
        },
        {
          ttlMs: 45000, // 45 seconds cache TTL
          staleWhileRevalidate: true,
          force,
          endpointKey: 'pilotstudy_table'
        }
      );

      if (Array.isArray(data) && data.length > 0) {
        this.isSupabaseConnected = true;
        this.lastSyncTime = new Date();

        // Process only officially enrolled 18 students
        const filtered = data.filter(record => allowedIds.includes(record.id));
        this.students = filtered.map(record => this.normalizeStudentRecord(record));

        // If some enrolled students are not yet in remote response, seed from INITIAL_STUDENTS
        allowedIds.forEach(id => {
          if (!this.students.some(s => s.id === id)) {
            const initStd = INITIAL_STUDENTS.find(s => s.id === id);
            if (initStd) {
              this.students.push(this.normalizeStudentRecord({
                id: initStd.id,
                student_name: initStd.name,
                category_scores: {}
              }));
            }
          }
        });

        // Calculate and verify rankings
        this.recalculateRanks();
        this.saveToCache();

        const statusMsg = fromCache
          ? (isStale ? 'Revalidating Cache...' : 'Cloud Synced (Cache Hit)')
          : 'Cloud Synced';

        this.emit('status', { connected: true, fromCache, isStale, message: statusMsg });
        this.emit('change', this.students);
      }
    } catch (err) {
      console.error('[pilotstudy] Fetch exception:', err);
      if (this.students.length > 0) {
        this.emit('status', { connected: false, message: 'Offline (Stale Cache View)' });
      } else {
        this.emit('status', { connected: false, message: 'Network offline' });
      }
    }
  }

  /**
   * Ensure a record contains category scores and calculates Base Score & Cumulative Score
   */
  normalizeStudentRecord(record) {
    const categoryScores = { ...(record.category_scores || {}) };
    let oneTimeSum = 0;

    // Evaluate 9 one-time mentor-evaluated categories (default to 0)
    ONE_TIME_CATEGORIES.forEach(cat => {
      if (typeof categoryScores[cat.id] !== 'number' || isNaN(categoryScores[cat.id])) {
        categoryScores[cat.id] = 0;
      }
      oneTimeSum += categoryScores[cat.id];
    });

    // Attendance summary (cyclic safe)
    let earlyBirdPts = Number(categoryScores.early_bird) || 0;
    let nightOwlPts = Number(categoryScores.night_owl) || 0;

    let att = null;
    try {
      if (typeof attendanceService !== 'undefined' && attendanceService) {
        if (typeof attendanceService.getStudentDailySummary === 'function') {
          att = attendanceService.getStudentDailySummary(record.id);
        } else if (typeof attendanceService.getStudentAttendanceSummary === 'function') {
          att = attendanceService.getStudentAttendanceSummary(record.id);
        }
      }
    } catch (e) {
      // Cyclic import fallback
    }

    // Only fall back to attendance summary if early bird / night owl are not explicitly defined
    if (att && record.category_scores?.early_bird === undefined) {
      earlyBirdPts = att.todayEarlyPoints || 0;
    }
    if (att && record.category_scores?.night_owl === undefined) {
      nightOwlPts = att.todayNightPoints || 0;
    }

    categoryScores.early_bird = earlyBirdPts;
    categoryScores.night_owl = nightOwlPts;

    const attendancePoints = earlyBirdPts + nightOwlPts;
    // Strictly respect authoritative total_points from Supabase DB
    const totalPoints = (typeof record.total_points === 'number' && !isNaN(record.total_points))
      ? record.total_points
      : (oneTimeSum + attendancePoints);
    const percentage = Math.round((totalPoints / MAX_SCORE) * 1000) / 10;

    return {
      id: record.id,
      student_name: record.student_name,
      one_time_points: oneTimeSum,
      attendance_points: attendancePoints,
      base_points: totalPoints,
      cumulative_points: totalPoints,
      total_points: totalPoints, // Primary ranking total across pilot study
      max_points: MAX_SCORE,
      percentage: percentage,
      rank: record.rank || 1,
      category_scores: categoryScores,
      attendance_summary: att,
      remarks: record.remarks || '',
      updated_at: record.updated_at || new Date().toISOString(),
      avatarBg: AVATAR_PALETTES[record.id] || 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)'
    };
  }

  /**
   * Subscribe to Real-Time Postgres Changes on pilotstudy table (Clean lifecycle)
   */
  setupRealtimeSubscription() {
    try {
      // Remove any existing subscription to prevent subscription leaks
      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }

      this.realtimeChannel = supabase
        .channel('pilotstudy-live-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pilotstudy' },
          (payload) => {
            console.log('[pilotstudy] Live Realtime change received:', payload);
            appQueryCache.invalidate('pilotstudy_cohort_v3');
            this.handleRealtimePayload(payload);
          }
        )
        .subscribe((status) => {
          console.log('[pilotstudy] Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            this.isSupabaseConnected = true;
            this.emit('status', { connected: true, realtime: true, message: 'Real-Time Connected' });
          }
        });
    } catch (e) {
      console.warn('[pilotstudy] Realtime setup notice:', e);
    }
  }

  handleRealtimePayload(payload) {
    if (!payload || !payload.new) return;
    const allowedIds = INITIAL_STUDENTS.map(s => s.id);
    if (!allowedIds.includes(payload.new.id)) return; // Ignore any external records

    const updated = this.normalizeStudentRecord(payload.new);
    const index = this.students.findIndex(s => s.id === updated.id);

    if (index >= 0) {
      this.students[index] = updated;
    } else {
      this.students.push(updated);
    }

    this.recalculateRanks();
    this.saveToCache();
    this.emit('change', this.students);
  }

  /**
   * Standard Competition Ranking (1224 Ranking Policy)
   * Evaluates all 18 officially enrolled cohort students
   */
  recalculateRanks() {
    const allowedIds = INITIAL_STUDENTS.map(s => s.id);
    const enrolled = this.students.filter(s => allowedIds.includes(s.id));

    // Sort enrolled students descending by total_points, secondary sort alphabetically
    enrolled.sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      return a.student_name.localeCompare(b.student_name);
    });

    enrolled.forEach((std, idx) => {
      if (idx > 0 && std.total_points === enrolled[idx - 1].total_points) {
        std.rank = enrolled[idx - 1].rank;
      } else {
        std.rank = idx + 1;
      }
    });

    this.students = enrolled;
  }

  getStudents() {
    return [...this.students];
  }

  getStudentById(id) {
    return this.students.find(s => s.id === id) || null;
  }

  /**
   * Save updated category scores to Supabase
   */
  async saveCategoryScores(studentId, newCategoryScores) {
    const student = this.getStudentById(studentId);
    if (!student) {
      return { success: false, message: `Student ID "${studentId}" not found in database.` };
    }

    // Validate all 11 category scores
    const cleanScores = {};
    let total = 0;

    for (const cat of SCORING_CATEGORIES) {
      let val;
      if (cat.id === 'early_bird' || cat.id === 'night_owl') {
        val = Number(student.category_scores?.[cat.id]) || 0;
      } else {
        val = (newCategoryScores && newCategoryScores[cat.id] !== undefined && !isNaN(Number(newCategoryScores[cat.id])))
          ? Number(newCategoryScores[cat.id])
          : (Number(student.category_scores?.[cat.id]) || 0);
      }
      if (isNaN(val) || val < 0) {
        return { success: false, message: `Invalid score for ${cat.name || cat.fullName || cat.id}. Must be positive number.` };
      }
      if (val > cat.maxPoints) {
        return { success: false, message: `Score for ${cat.name || cat.fullName || cat.id} exceeds max limit of ${cat.maxPoints} pts.` };
      }
      cleanScores[cat.id] = val;
      total += val;
    }

    const percentage = Math.round((total / MAX_SCORE) * 1000) / 10;
    const nowIso = new Date().toISOString();

    // Concurrency guard to prevent conflicting concurrent writes
    if (this.isSaving) {
      return { success: false, message: 'Another save is currently in progress. Please wait a moment.' };
    }

    // Set saving state
    this.isSaving = true;
    this.emit('saving', true);

    try {
      // Attempt atomic PostgreSQL function if deployed
      let rpcSuccess = false;
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('update_pilotstudy_score', {
          p_student_id: studentId,
          p_category_scores: cleanScores
        });
        if (!rpcError && rpcData) {
          rpcSuccess = true;
          // Re-fetch cohort or update local state
          await this.fetchFromSupabase();
        }
      } catch (rpcErr) {
        // Fall back to direct table update
        rpcSuccess = false;
      }

      if (!rpcSuccess) {
        // 1. Update the student record in Supabase (updating total, cumulative, and base points together)
        const { data, error } = await supabase
          .from('pilotstudy')
          .update({
            category_scores: cleanScores,
            total_points: total,
            cumulative_points: total,
            base_points: total,
            max_points: MAX_SCORE,
            percentage: percentage,
            updated_at: nowIso
          })
          .eq('id', studentId)
          .select();

        if (error) {
          console.error('[pilotstudy] Supabase update failed:', error);
          this.isSaving = false;
          this.emit('saving', false);
          return { success: false, message: `Supabase update failed: ${error.message}` };
        }

        // 2. Update local state
        student.category_scores = cleanScores;
        student.total_points = total;
        student.cumulative_points = total;
        student.base_points = total;
        student.percentage = percentage;
        student.updated_at = nowIso;

        // 3. Recalculate ranks across all students
        this.recalculateRanks();
        this.saveToCache();

        // 4. Update the cohort ranks in Supabase asynchronously
        await this.syncRanksToSupabase();
      }

      // Invalidate query cache so any subsequent reads or background refetches get fresh data
      appQueryCache.invalidate('pilotstudy_cohort_v3');

      this.isSaving = false;
      this.emit('saving', false);
      this.emit('change', this.students);

      return {
        success: true,
        message: `Saved ${student.student_name}'s scores (${total}/115 pts, Rank #${student.rank}) to Supabase!`,
        student: this.getStudentById(studentId)
      };
    } catch (err) {
      console.error('[pilotstudy] Save exception:', err);
      this.isSaving = false;
      this.emit('saving', false);
      return { success: false, message: `Network error: ${err.message}` };
    }
  }

  /**
   * Sync rank numbers across all students to Supabase (only for students whose rank changed)
   */
  async syncRanksToSupabase() {
    try {
      const updates = this.students.map(s => 
        supabase
          .from('pilotstudy')
          .update({ rank: s.rank })
          .eq('id', s.id)
      );
      await Promise.allSettled(updates);
    } catch (e) {
      console.warn('[pilotstudy] Rank sync notice:', e);
    }
  }
}

// Global Singleton Instance
export const pilotstudyDb = new PilotStudyRealtimeDatabase();
if (typeof window !== 'undefined') window.pilotstudyDb = pilotstudyDb;
if (typeof globalThis !== 'undefined') globalThis.pilotstudyDb = pilotstudyDb;
