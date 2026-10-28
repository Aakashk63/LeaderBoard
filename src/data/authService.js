/**
 * Student Authentication Service (Supabase Auth Integration)
 * Links individual student credentials directly to the authoritative pilotstudy table
 * Eliminates dropdown-based identity selection
 */

import { supabase } from './pilotstudyDatabase.js';

// Pre-registered Student Accounts Directory (All 20 Students)
export const STUDENT_ACCOUNTS = [
  { student_id: 'std-1', username: 'reshma', email: 'reshma@pilotstudy.snsct.edu.in', student_name: 'R.Reshma', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-2', username: 'nihal', email: 'nihal@pilotstudy.snsct.edu.in', student_name: 'Nihal Ahmed I', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-3', username: 'sanjay', email: 'sanjay@pilotstudy.snsct.edu.in', student_name: 'Sanjay S', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-4', username: 'samyuktha', email: 'samyuktha@pilotstudy.snsct.edu.in', student_name: 'SAMYUKTHA P V', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-5', username: 'naveen', email: 'naveen@pilotstudy.snsct.edu.in', student_name: 'Naveen Sushant G', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-6', username: 'mithiun', email: 'mithiun@pilotstudy.snsct.edu.in', student_name: 'Mithiun.V', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-7', username: 'ashwanth', email: 'ashwanth@pilotstudy.snsct.edu.in', student_name: 'ASHWANTH.E.M', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-8', username: 'hasan', email: 'hasan@pilotstudy.snsct.edu.in', student_name: 'Hasan Mohammed', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-9', username: 'eliyaaz', email: 'eliyaaz@pilotstudy.snsct.edu.in', student_name: 'MOHAMMAD ELIYAAZ', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-10', username: 'dharun', email: 'dharun@pilotstudy.snsct.edu.in', student_name: 'Dharun T R', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-11', username: 'geetan', email: 'geetan@pilotstudy.snsct.edu.in', student_name: 'Geetan D', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-12', username: 'dhiyanesh', email: 'dhiyanesh@pilotstudy.snsct.edu.in', student_name: 'Dhiyanesh Senthil.S', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-13', username: 'breno', email: 'breno@pilotstudy.snsct.edu.in', student_name: 'Breno', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-14', username: 'santhosh', email: 'santhosh@pilotstudy.snsct.edu.in', student_name: 'Santhosh', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-15', username: 'kabilash', email: 'kabilash@pilotstudy.snsct.edu.in', student_name: 'Kabilash', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-16', username: 'banusri', email: 'banusri@pilotstudy.snsct.edu.in', student_name: 'Banusri', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-17', username: 'dharsiga', email: 'dharsiga@pilotstudy.snsct.edu.in', student_name: 'Dharsiga', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-18', username: 'aishwarya', email: 'aishwarya@pilotstudy.snsct.edu.in', student_name: 'Aishwarya', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-19', username: 'ashok', email: 'ashok@pilotstudy.snsct.edu.in', student_name: 'Ashok Britto.P', defaultPassword: 'PilotStudy@2026' },
  { student_id: 'std-20', username: 'keerthana', email: 'keerthana@pilotstudy.snsct.edu.in', student_name: 'S.KEERTHANA', defaultPassword: 'PilotStudy@2026' },
  // Dedicated Testing / Development Dummy Student Account (Linked to Supabase Auth & pilotstudy std-dummy)
  {
    student_id: 'std-dummy',
    username: 'dummy',
    email: 'dummy@gmail.com',
    student_name: 'Dummy Student',
    is_test_account: true
  }
];

// Pre-registered Mentor / Trainer Accounts Directory
export const MENTOR_ACCOUNTS = [
  {
    mentor_id: 'mentor-aakash',
    username: 'aakash',
    email: 'akaakashsvg63@gmail.com',
    student_name: 'Aakash (Mentor)',
    role: 'mentor',
    defaultPassword: 'Aakash@1234'
  },
  {
    mentor_id: 'mentor-1',
    username: 'mentor',
    email: 'mentor@pilotstudy.snsct.edu.in',
    student_name: 'SNSCT Program Mentor',
    role: 'mentor',
    defaultPassword: 'PilotStudy@2026'
  },
  {
    mentor_id: 'admin-1',
    username: 'admin',
    email: 'admin@snsct.edu.in',
    student_name: 'Lead System Administrator',
    role: 'admin',
    defaultPassword: 'PilotStudy@2026'
  }
];

const LOCAL_STORAGE_AUTH_KEY = 'pilotstudy_authenticated_student_v1';

/**
 * Normalize names for robust comparison (strips punctuation, multiple spaces, lowercase)
 */
export function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Check if submitted full name matches the authoritative student record name
 */
export function isNameMatching(submittedName, recordName) {
  if (!submittedName || !recordName) return false;
  const n1 = normalizeName(submittedName);
  const n2 = normalizeName(recordName);
  if (n1 === n2) return true;

  // Word-level token match (e.g. "Samyuktha P V" matches "SAMYUKTHA P V" or "Samyuktha PV")
  const w1 = n1.split(' ').filter(w => w.length > 0);
  const w2 = n2.split(' ').filter(w => w.length > 0);
  
  // Check if primary name tokens match
  const matches = w1.filter(token => w2.includes(token));
  return matches.length >= Math.min(w1.length, w2.length) && matches.length >= 1;
}

export class AuthService {
  constructor() {
    this.currentStudent = null;
    this.supabaseUser = null;
    this.listeners = {
      authChange: []
    };

    // Restore cached session if present
    this.restoreSession();
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  restoreSession() {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY);
      if (cached) {
        this.currentStudent = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('[authService] Restore session warning:', e);
    }
  }

  saveSession(studentData) {
    this.currentStudent = studentData;
    try {
      localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(studentData));
    } catch (e) {
      // ignore
    }
    this.emit('authChange', this.currentStudent);
  }

  clearSession() {
    this.currentStudent = null;
    this.supabaseUser = null;
    try {
      localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
    } catch (e) {
      // ignore
    }
    this.emit('authChange', null);
  }

  /**
   * Find matching account entry by email, username, or student ID across students and mentors
   */
  lookupAccount(identifier, requestedRole = 'student') {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();

    // Check mentor accounts first if requested or if mentor domain
    if (requestedRole === 'mentor' || requestedRole === 'admin' || clean.includes('mentor') || clean.includes('admin')) {
      const mentor = MENTOR_ACCOUNTS.find(
        acc => acc.email.toLowerCase() === clean ||
               acc.username.toLowerCase() === clean ||
               acc.mentor_id.toLowerCase() === clean
      );
      if (mentor) return { ...mentor, role: mentor.role || 'mentor' };
    }

    // Check student accounts
    const student = STUDENT_ACCOUNTS.find(
      acc => acc.email.toLowerCase() === clean ||
             acc.username.toLowerCase() === clean ||
             acc.student_id.toLowerCase() === clean
    );
    if (student) return { ...student, role: 'student' };

    // Fallback search in mentor accounts
    const fallbackMentor = MENTOR_ACCOUNTS.find(
      acc => acc.email.toLowerCase() === clean ||
             acc.username.toLowerCase() === clean
    );
    if (fallbackMentor) return { ...fallbackMentor, role: fallbackMentor.role || 'mentor' };

    return null;
  }

  /**
   * Authenticate user with role-based verification, full name matching, and Supabase Auth
   */
  async signIn({ fullName, identifier, password, role = 'student', isGpsVerified = false }) {
    if (!identifier || !password) {
      return { success: false, message: 'Please provide both email/username and password.' };
    }

    const account = this.lookupAccount(identifier, role);
    if (!account) {
      return {
        success: false,
        message: role === 'student'
          ? 'Student account not found. Please use your assigned student email or username.'
          : 'Mentor account not found. Please verify your credentials.'
      };
    }

    // 1. Full Name Verification for Students
    if (account.role === 'student') {
      if (!fullName || !fullName.trim()) {
        return { success: false, message: 'Full Name is required for student identity verification.' };
      }

      if (!isNameMatching(fullName, account.student_name)) {
        return {
          success: false,
          message: `Full Name mismatch: The entered name "${fullName.trim()}" does not match the official student record for this email.`
        };
      }

      // 2. Mandatory Location Verification Gate for Students
      if (!isGpsVerified) {
        return {
          success: false,
          message: 'Mandatory campus GPS verification required before student sign-in. Click "Check My Location" first.'
        };
      }
    }

    const email = account.email;

    try {
      // Attempt Supabase Auth Sign In
      let authUser = null;
      let authError = null;

      try {
        const res = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });
        authUser = res.data?.user;
        authError = res.error;
      } catch (e) {
        authError = e;
      }

      // Auto-provision if user record does not exist yet in Supabase Auth
      if (authError && (authError.message?.includes('Invalid login') || authError.message?.includes('User not found') || authError.status === 400)) {
        try {
          const signUpRes = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
              data: {
                student_id: account.student_id || account.mentor_id,
                student_name: account.student_name,
                role: account.role
              }
            }
          });
          if (signUpRes.data?.user) {
            authUser = signUpRes.data.user;
            authError = null;
          }
        } catch (signUpErr) {
          // Fall back to default password check
        }
      }

      // Fallback check against verified default password for enrolled students
      if (!authUser) {
        if (account.is_test_account) {
          return {
            success: false,
            message: authError?.message || 'Authentication failed. Please check credentials or provision dummy account in Supabase Auth.'
          };
        }
        if (password !== account.defaultPassword && password !== 'PilotStudy@2026') {
          return {
            success: false,
            message: 'Invalid password. Please check your credentials and try again.'
          };
        }
      }

      // Fetch authoritative student record from pilotstudy table if student
      let studentRecord = null;
      if (account.role === 'student') {
        try {
          const { data: stdData } = await supabase
            .from('pilotstudy')
            .select('*')
            .eq('id', account.student_id)
            .single();
          if (stdData) studentRecord = stdData;
        } catch (dbErr) {
          // fallback to local account directory
        }
      }

      const authenticatedPayload = {
        student_id: account.student_id || account.mentor_id,
        student_name: studentRecord?.student_name || account.student_name,
        email: account.email,
        username: account.username,
        role: account.role || 'student',
        is_test_account: Boolean(account.is_test_account || studentRecord?.is_test_account),
        auth_user_id: authUser?.id || `usr-${account.student_id || account.mentor_id}`,
        authenticated_at: new Date().toISOString()
      };

      this.supabaseUser = authUser;
      this.saveSession(authenticatedPayload);

      return {
        success: true,
        message: `Welcome, ${authenticatedPayload.student_name}! Signed in as ${authenticatedPayload.role.toUpperCase()}.${authenticatedPayload.is_test_account ? ' [DEV TEST ACCOUNT]' : ''}`,
        student: authenticatedPayload,
        user: authenticatedPayload
      };
    } catch (err) {
      console.error('[authService] Login exception:', err);
      return { success: false, message: `Authentication error: ${err.message}` };
    }
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    this.clearSession();
    return { success: true, message: 'Logged out successfully.' };
  }

  isAuthenticated() {
    return !!this.currentStudent;
  }

  getCurrentStudent() {
    return this.currentStudent;
  }

  getUserRole() {
    return this.currentStudent?.role || 'anonymous';
  }

  isMentorOrAdmin() {
    const role = this.getUserRole();
    return role === 'mentor' || role === 'admin';
  }
}

// Global Singleton Instance
export const authService = new AuthService();
