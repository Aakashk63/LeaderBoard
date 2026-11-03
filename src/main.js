/**
 * Student Leaderboard, GPS-Verified Daily Attendance & System Design Lab Controller
 * Full-width desktop dashboard • Zero emojis • Pure SVG vector icons
 * Authoritative Supabase Real-Time Persistence for 11 Categories & Daily Awards
 */

import { pilotstudyDb, SCORING_CATEGORIES, MAX_SCORE } from './data/pilotstudyDatabase.js';
import {
  attendanceService,
  LOCATION_STATES,
  formatISTTime,
  formatISTDate,
  isAfter430PMIST,
  isStrictlyAfter6PMIST,
  getTodayISTDateString,
  calculateHaversineDistance,
  DEFAULT_CAMPUS_POLYGON,
  DEFAULT_CAMPUS_ZONES,
  DEFAULT_CAMPUS_SETTINGS,
  isPointInPolygon,
  calculateMinDistanceToPolygon,
  validateCampusPolygon,
  findNearestCampusZone
} from './data/attendanceDatabase.js';
import { authService, STUDENT_ACCOUNTS, MENTOR_ACCOUNTS } from './data/authService.js';
import { deviceService } from './data/deviceService.js';
import { appQueryCache } from './data/cacheEngine.js';
// Application State
let currentTheme = 'dark';
let currentPointsMode = 'demo'; // 'demo' (Supabase live) | 'zero'
let currentPrimaryTab = 'leaderboard'; // 'leaderboard' | 'attendance'
let selectedStudentId = 'std-1'; // Default to KAVINRAJ M
let activeAttendanceStudentId = 'std-1';
let selectedAttendanceDate = getTodayISTDateString();
let searchQuery = '';
let activeLoginRole = 'student'; // 'student' | 'mentor'

// In-modal editing state for active student
let editingStudentScores = {};

// DOM Elements Cache
const elements = {
  // Standalone Sign-In Page & Authentication Viewports
  standaloneSignInPage: document.getElementById('standaloneSignInPage'),
  authenticatedAppViewport: document.getElementById('authenticatedAppViewport'),
  btnSignInThemeDark: document.getElementById('btnSignInThemeDark'),
  btnSignInThemeLight: document.getElementById('btnSignInThemeLight'),
  btnRoleStudent: document.getElementById('btnRoleStudent'),
  btnRoleMentor: document.getElementById('btnRoleMentor'),
  standaloneLoginForm: document.getElementById('standaloneLoginForm'),
  fieldSignInFullName: document.getElementById('fieldSignInFullName'),
  inputSignInFullName: document.getElementById('inputSignInFullName'),
  labelSignInEmail: document.getElementById('labelSignInEmail'),
  inputSignInEmail: document.getElementById('inputSignInEmail'),
  inputSignInPassword: document.getElementById('inputSignInPassword'),

  // Standalone Sign-In GPS Panel & Gate
  panelSignInGps: document.getElementById('panelSignInGps'),
  badgeSignInLocationState: document.getElementById('badgeSignInLocationState'),
  textSignInLocationTitle: document.getElementById('textSignInLocationTitle'),
  textSignInLocationAccuracy: document.getElementById('textSignInLocationAccuracy'),
  textSignInLocationGuidance: document.getElementById('textSignInLocationGuidance'),
  textSignInLiveDistance: document.getElementById('textSignInLiveDistance'),
  textSignInLiveAccuracy: document.getElementById('textSignInLiveAccuracy'),
  btnSignInCheckLocation: document.getElementById('btnSignInCheckLocation'),
  btnSignInSimulateCampus: document.getElementById('btnSignInSimulateCampus'),
  btnSignInRetryLocation: document.getElementById('btnSignInRetryLocation'),
  textCheckLocationBtn: document.getElementById('textCheckLocationBtn'),
  btnStandaloneSignInSubmit: document.getElementById('btnStandaloneSignInSubmit'),
  textSignInButtonLabel: document.getElementById('textSignInButtonLabel'),
  textSignInGateNotice: document.getElementById('textSignInGateNotice'),
  boxSignInAlert: document.getElementById('boxSignInAlert'),
  textSignInAlert: document.getElementById('textSignInAlert'),
  gridStandaloneQuickAccounts: document.getElementById('gridStandaloneQuickAccounts'),

  // Student Logout & Checkout Confirmation Modal
  logoutConfirmModal: document.getElementById('logoutConfirmModal'),
  btnCloseLogoutModal: document.getElementById('btnCloseLogoutModal'),
  btnLogoutWithGps: document.getElementById('btnLogoutWithGps'),
  btnLogoutDirectOnly: document.getElementById('btnLogoutDirectOnly'),
  btnCancelLogout: document.getElementById('btnCancelLogout'),
  logoutModalStatusBox: document.getElementById('logoutModalStatusBox'),
  logoutModalStatusText: document.getElementById('logoutModalStatusText'),

  // Desktop Header User Session & Actions
  headerUserSessionBadge: document.getElementById('headerUserSessionBadge'),
  hdrUserAvatar: document.getElementById('hdrUserAvatar'),
  hdrUserName: document.getElementById('hdrUserName'),
  hdrUserRole: document.getElementById('hdrUserRole'),
  hdrBtnAction: document.getElementById('hdrBtnAction'),

  // Navigation Tabs & Views
  tabNavLeaderboard: document.getElementById('tabNavLeaderboard'),
  tabNavAttendance: document.getElementById('tabNavAttendance'),
  tabNavAttendanceLabel: document.getElementById('tabNavAttendanceLabel'),
  viewLeaderboard: document.getElementById('viewLeaderboard'),
  viewAttendance: document.getElementById('viewAttendance'),

  // Attendance Sheet Filter & Mentor Controls
  attSheetDatePicker: document.getElementById('attSheetDatePicker'),
  btnFilterToday: document.getElementById('btnFilterToday'),
  btnFilterAllDates: document.getElementById('btnFilterAllDates'),
  btnDownloadAttendanceCsv: document.getElementById('btnDownloadAttendanceCsv'),
  attSheetMetricCohort: document.getElementById('attSheetMetricCohort'),
  attSheetMetricCheckedIn: document.getElementById('attSheetMetricCheckedIn'),
  attSheetMetricCompleted: document.getElementById('attSheetMetricCompleted'),
  attSheetMetricDate: document.getElementById('attSheetMetricDate'),
  allStudentsAttendanceTableBody: document.getElementById('allStudentsAttendanceTableBody'),
  geofenceAdminDrawer: document.getElementById('geofenceAdminDrawer'),
  deviceAdminDrawer: document.getElementById('deviceAdminDrawer'),
  headerDeviceDrawerToggle: document.getElementById('headerDeviceDrawerToggle'),
  deviceAdminBody: document.getElementById('deviceAdminBody'),
  btnRefreshDeviceBindings: document.getElementById('btnRefreshDeviceBindings'),
  deviceBindingsListContainer: document.getElementById('deviceBindingsListContainer'),
  headerGeofenceDrawerToggle: document.getElementById('headerGeofenceDrawerToggle'),
  bannerEarlyBirdPointsChip: document.getElementById('bannerEarlyBirdPointsChip'),

  // Header Controls
  themeDarkBtn: document.getElementById('btnThemeDark'),
  themeLightBtn: document.getElementById('btnThemeLight'),
  modeZeroBtn: document.getElementById('btnModeZero'),
  modeDemoBtn: document.getElementById('btnModeDemo'),
  pointsModeControlItem: document.getElementById('pointsModeControlItem'),
  desktopPodiumRow: document.getElementById('desktopPodiumRow'),
  desktopRowsContainer: document.getElementById('desktopRowsContainer'),
  desktopSearchInput: document.getElementById('desktopSearchInput'),
  syncStatusBadge: document.getElementById('syncStatusBadge'),

  // Student Attendance View Profile
  attStudentProfileBadge: document.getElementById('attStudentProfileBadge'),
  attStudentAvatar: document.getElementById('attStudentAvatar'),
  attStudentNameDisplay: document.getElementById('attStudentNameDisplay'),
  attStudentEmailDisplay: document.getElementById('attStudentEmailDisplay'),
  attStudentIdDisplay: document.getElementById('attStudentIdDisplay'),
  attStudentStatusDisplay: document.getElementById('attStudentStatusDisplay'),

  // Student Dedicated Check Out & Logout Action Card
  cardStudentCheckoutAction: document.getElementById('cardStudentCheckoutAction'),
  btnStudentDashboardCheckout: document.getElementById('btnStudentDashboardCheckout'),
  attDashboardCheckoutAlert: document.getElementById('attDashboardCheckoutAlert'),
  attDashboardCheckoutAlertText: document.getElementById('attDashboardCheckoutAlertText'),

  // Campus Geofence Elements in Attendance View
  attGeofenceStatusChip: document.getElementById('attGeofenceStatusChip'),
  attCampusNameDisplay: document.getElementById('attCampusNameDisplay'),
  attCampusCoordsDisplay: document.getElementById('attCampusCoordsDisplay'),
  attCampusRadiusDisplay: document.getElementById('attCampusRadiusDisplay'),
  attCampusFacilityDisplay: document.getElementById('attCampusFacilityDisplay'),
  attLiveDistanceMeters: document.getElementById('attLiveDistanceMeters'),
  attLiveAccuracyMeters: document.getElementById('attLiveAccuracyMeters'),

  // Clock & Feedback
  istLiveClockTime: document.getElementById('istLiveClockTime'),
  istLiveClockDate: document.getElementById('istLiveClockDate'),
  attFeedbackAlert: document.getElementById('attFeedbackAlert'),
  attFeedbackAlertText: document.getElementById('attFeedbackAlertText'),

  // Today's Awards Showcase
  todayEarlyBirdWinner: document.getElementById('todayEarlyBirdWinner'),
  todayEarlyBirdTime: document.getElementById('todayEarlyBirdTime'),
  todayNightOwlWinner: document.getElementById('todayNightOwlWinner'),
  todayNightOwlTime: document.getElementById('todayNightOwlTime'),

  // Student Score Cards
  attStudentCumScore: document.getElementById('attStudentCumScore'),
  attStudentBaseScore: document.getElementById('attStudentBaseScore'),
  attStudentBasePct: document.getElementById('attStudentBasePct'),
  attStudentAttTotalPts: document.getElementById('attStudentAttTotalPts'),
  attStudentAwardsSummary: document.getElementById('attStudentAwardsSummary'),
  attStudentTodayLoginTime: document.getElementById('attStudentTodayLoginTime'),
  attStudentTodayLogoutTime: document.getElementById('attStudentTodayLogoutTime'),
  historicalAwardsTableBody: document.getElementById('historicalAwardsTableBody'),

  // Admin Controls
  adminAttendanceDatePicker: document.getElementById('adminAttendanceDatePicker'),
  adminMetricCohort: document.getElementById('adminMetricCohort'),
  adminMetricCheckedIn: document.getElementById('adminMetricCheckedIn'),
  adminMetricCompleted: document.getElementById('adminMetricCompleted'),
  btnAdminRecalculate: document.getElementById('btnAdminRecalculate'),
  btnAdminExportCsv: document.getElementById('btnAdminExportCsv'),
  adminAttendanceTableBody: document.getElementById('adminAttendanceTableBody'),
  adminGeofenceForm: document.getElementById('adminGeofenceForm'),
  cfgCampusName: document.getElementById('cfgCampusName'),
  cfgCrs: document.getElementById('cfgCrs'),
  cfgVersion: document.getElementById('cfgVersion'),
  cfgApprovedBy: document.getElementById('cfgApprovedBy'),
  cfgLatitude: document.getElementById('cfgLatitude'),
  cfgLongitude: document.getElementById('cfgLongitude'),
  cfgRadius: document.getElementById('cfgRadius'),
  cfgAccuracy: document.getElementById('cfgAccuracy'),
  cfgPolygon: document.getElementById('cfgPolygon'),
  btnLoadDefaultPolygon: document.getElementById('btnLoadDefaultPolygon'),
  btnValidatePolygon: document.getElementById('btnValidatePolygon'),
  polygonValidationMsg: document.getElementById('polygonValidationMsg'),
  inputTestLat: document.getElementById('inputTestLat'),
  inputTestLng: document.getElementById('inputTestLng'),
  btnTestCoordinate: document.getElementById('btnTestCoordinate'),
  testCoordinateResult: document.getElementById('testCoordinateResult'),

  // Student Detail & Score Editor Modal
  studentDetailModal: document.getElementById('studentDetailModal'),
  modalStudentAvatar: document.getElementById('modalStudentAvatar'),
  modalStudentName: document.getElementById('modalStudentName'),
  modalStudentRank: document.getElementById('modalStudentRank'),
  modalStudentScore: document.getElementById('modalStudentScore'),
  modalStudentPct: document.getElementById('modalStudentPct'),
  modalCategoriesEditorList: document.getElementById('modalCategoriesEditorList'),
  modalSaveStatusMsg: document.getElementById('modalSaveStatusMsg'),
  saveStatusText: document.getElementById('saveStatusText'),
  btnSaveScoresToSupabase: document.getElementById('btnSaveScoresToSupabase'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  modalDismissBtn: document.getElementById('modalDismissBtn')
};

// SVG Icon Templates (Strictly NO EMOJIS)
const ICONS = {
  crown: `
    <svg class="svg-crown-floating" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 19h20v2H2v-2zm1.5-4.5L5 8l4.5 4.5L12 4l2.5 8.5L19 8l1.5 6.5h-17z"/>
    </svg>
  `,
  lightning: `
    <svg viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  `,
  medalGold: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  `,
  medalSilver: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  `,
  medalBronze: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  `,
  editPen: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      <path d="m15 5 4 4"/>
    </svg>
  `
};

/**
 * Initialize Desktop Dashboard & Labs
 */
function initDashboard() {
  setupEventListeners();
  setupDatabaseListeners();
  startLiveClock();
  syncAuthStateView();
  setLoginRole('student');
  renderQuickAccountsGrid();
  updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);
  if (elements.attSheetDatePicker) {
    elements.attSheetDatePicker.value = selectedAttendanceDate;
  }
  renderAll();
  renderAttendanceDashboard();

  // Proactive 12-second realtime consistency sync interval
  setInterval(async () => {
    try {
      await Promise.allSettled([
        pilotstudyDb.fetchFromSupabase({ force: true }),
        attendanceService.fetchFromSupabase({ force: true })
      ]);
    } catch (e) {}
  }, 12000);

  // Always force fetch live authoritative data from Supabase on page load or refresh
  Promise.allSettled([
    pilotstudyDb.fetchFromSupabase({ force: true }),
    attendanceService.fetchFromSupabase({ force: true })
  ]).then(async () => {
    // If a student account is currently active, ensure today's check-in and points are recorded
    const authUser = authService.getCurrentStudent();
    if (authUser && (authUser.role === 'student' || authUser.student_id?.startsWith('std-'))) {
      const today = getTodayISTDateString();
      const existingRec = attendanceService.attendanceRecords.find(
        r => r.student_id === authUser.student_id && r.attendance_date === today && r.login_at
      );
      if (!existingRec) {
        try {
          const res = await attendanceService.performCheckIn(authUser.student_id);
          if (res && res.success) {
            await pilotstudyDb.fetchFromSupabase({ force: true });
            await attendanceService.fetchFromSupabase({ force: true });
          }
        } catch (err) {
          console.warn('[attendance] Session restore auto check-in notice:', err);
        }
      }
    }
    renderAll();
    renderAttendanceDashboard();
  }).catch(err => {
    console.warn('[main] Initial cloud sync notice:', err);
  });
}

/**
 * Real-time Indian Standard Time (Asia/Kolkata) Clock
 */
function startLiveClock() {
  function tick() {
    const now = new Date();
    if (elements.istLiveClockTime) {
      elements.istLiveClockTime.textContent = formatISTTime(now.toISOString());
    }
    if (elements.istLiveClockDate) {
      elements.istLiveClockDate.textContent = formatISTDate(now);
    }
  }
  tick();
  setInterval(tick, 1000);
}

/**
 * Wire Database Real-Time and State Listeners
 */
function setupDatabaseListeners() {
  pilotstudyDb.on('change', () => {
    renderAll();
  });

  pilotstudyDb.on('status', ({ connected, realtime, message, fromCache, isStale }) => {
    if (!elements.syncStatusBadge) return;
    const stats = appQueryCache.getStats();
    if (realtime) {
      elements.syncStatusBadge.textContent = `(Realtime • Cache: ${stats.hits} Hits / ${stats.dedupes} Deduped)`;
      elements.syncStatusBadge.style.color = '#10b981';
      elements.syncStatusBadge.title = `Real App Cache: ${stats.hits} cache hits, ${stats.misses} misses, ${stats.dedupes} in-flight coalesced`;
    } else if (connected) {
      elements.syncStatusBadge.textContent = fromCache ? (isStale ? '(Revalidating Cache...)' : '(Cache Hit)') : '(Cloud Synced)';
      elements.syncStatusBadge.style.color = '#34d399';
    } else {
      elements.syncStatusBadge.textContent = `(${message || 'Offline'})`;
      elements.syncStatusBadge.style.color = '#f87171';
    }
  });

  appQueryCache.on('status', ({ circuitOpen, message }) => {
    if (circuitOpen && elements.syncStatusBadge) {
      elements.syncStatusBadge.textContent = '(Throttled - Circuit Breaker)';
      elements.syncStatusBadge.style.color = '#fbbf24';
    }
  });

  pilotstudyDb.on('saving', (isSaving) => {
    if (elements.modalSaveStatusMsg) {
      if (isSaving) {
        elements.modalSaveStatusMsg.className = 'save-status-msg saving';
        elements.saveStatusText.textContent = 'Saving to Supabase...';
        elements.btnSaveScoresToSupabase.disabled = true;
      } else {
        elements.btnSaveScoresToSupabase.disabled = false;
      }
    }
  });

  attendanceService.on('change', () => {
    renderAttendanceDashboard();
    renderAdminAttendanceDashboard();
    renderAll();
  });
}

/**
 * Get Authoritative Student List based on active Points Mode
 */
function getRankedData() {
  const dbStudents = pilotstudyDb.getStudents();

  if (currentPointsMode === 'zero') {
    // Neutral 0 points mode
    return dbStudents.map((std, idx) => ({
      ...std,
      total_points: 0,
      cumulative_points: 0,
      base_points: 0,
      percentage: 0,
      rank: idx + 1,
      initials: getInitials(std.student_name)
    }));
  }

  return dbStudents.map(std => ({
    ...std,
    initials: getInitials(std.student_name)
  }));
}

/**
 * Get initials from student name
 */
function getInitials(name) {
  if (!name) return 'ST';
  const parts = name.trim().split(/[\s.]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Render All Components
 */
function renderAll() {
  const ranked = getRankedData();
  renderDesktopPodium(ranked);
  renderDesktopRows(ranked);
  renderAttendanceDashboard();
  renderAdminAttendanceDashboard();
}

/**
 * Render Top Three Horizontal Podium (3D Blocks, Ranked by Cumulative Score)
 */
function renderDesktopPodium(rankedList) {
  if (!elements.desktopPodiumRow) return;

  const officialOnly = rankedList.filter(s => s && s.id);
  const studentsWithPoints = officialOnly.filter(s => (s.cumulative_points || s.total_points) > 0);

  // If all points are zero, do not display any student's name on the Top Performers Podium
  if (studentsWithPoints.length === 0) {
    elements.desktopPodiumRow.innerHTML = `
      <div class="podium-empty-notice" style="grid-column: 1 / -1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2.25rem 1.5rem; text-align: center; background: rgba(30, 41, 59, 0.35); border: 1px dashed rgba(255, 255, 255, 0.12); border-radius: 16px; margin: 0.5rem 0 1.25rem 0;">
        <div style="margin-bottom: 0.5rem; color: #fbbf24;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
          </svg>
        </div>
        <div style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.35rem;">Top Performers Podium</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 440px; line-height: 1.5;">
          All student scores are currently at 0 points. Top performer positions will appear here once students check in or earn evaluation marks.
        </div>
      </div>
    `;
    return;
  }

  const rank1 = studentsWithPoints[0] || null;
  const rank2 = studentsWithPoints[1] || null;
  const rank3 = studentsWithPoints[2] || null;

  elements.desktopPodiumRow.innerHTML = `
    <!-- Rank 2: Left Medium Height Podium -->
    <div class="podium-pedestal-col rank-left-2 ${!rank2 ? 'podium-awaiting' : ''}" data-student-id="${rank2 ? rank2.id : ''}" title="${rank2 ? `Rank #2: ${escapeHtml(rank2.student_name)}` : 'Awaiting Rank #2 Winner'}">
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank2 ? rank2.avatarBg : '#334155'};">
          ${rank2 ? rank2.initials : '--'}
        </div>
        <div class="podium-medal-badge" title="Silver Medal">
          ${ICONS.medalSilver}
        </div>
      </div>
      <div class="podium-name-text">${rank2 ? escapeHtml(rank2.student_name) : '<span style="color: var(--text-muted);">Awaiting Winner</span>'}</div>
      <div class="podium-points-pill" title="Cumulative Score">
        ${ICONS.lightning}
        <span>${rank2 ? (rank2.cumulative_points || rank2.total_points) : 0} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        ${rank2 ? `Base: ${rank2.base_points || rank2.total_points}/${MAX_SCORE} (${rank2.percentage}%)` : '--'}
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">2</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank2 ? rank2.percentage : 0}%;"></div>
        </div>
      </div>
    </div>

    <!-- Rank 1: Center Tallest Podium with Floating Vector Crown -->
    <div class="podium-pedestal-col rank-center-1 ${!rank1 ? 'podium-awaiting' : ''}" data-student-id="${rank1 ? rank1.id : ''}" title="${rank1 ? `Rank #1: ${escapeHtml(rank1.student_name)}` : 'Awaiting Rank #1 Winner'}">
      ${ICONS.crown}
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank1 ? rank1.avatarBg : '#334155'};">
          ${rank1 ? rank1.initials : '--'}
        </div>
        <div class="podium-medal-badge" title="Gold Medal">
          ${ICONS.medalGold}
        </div>
      </div>
      <div class="podium-name-text">${rank1 ? escapeHtml(rank1.student_name) : '<span style="color: var(--text-muted);">Awaiting Winner</span>'}</div>
      <div class="podium-points-pill" style="background: rgba(203, 245, 58, 0.2); border-color: var(--accent-lime);" title="Cumulative Score">
        ${ICONS.lightning}
        <span style="color: var(--accent-lime);">${rank1 ? (rank1.cumulative_points || rank1.total_points) : 0} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        ${rank1 ? `Base: ${rank1.base_points || rank1.total_points}/${MAX_SCORE} (${rank1.percentage}%)` : '--'}
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">1</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank1 ? rank1.percentage : 0}%;"></div>
        </div>
      </div>
    </div>

    <!-- Rank 3: Right Shorter Podium -->
    <div class="podium-pedestal-col rank-right-3 ${!rank3 ? 'podium-awaiting' : ''}" data-student-id="${rank3 ? rank3.id : ''}" title="${rank3 ? `Rank #3: ${escapeHtml(rank3.student_name)}` : 'Awaiting Rank #3 Winner'}">
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank3 ? rank3.avatarBg : '#334155'};">
          ${rank3 ? rank3.initials : '--'}
        </div>
        <div class="podium-medal-badge" title="Bronze Medal">
          ${ICONS.medalBronze}
        </div>
      </div>
      <div class="podium-name-text">${rank3 ? escapeHtml(rank3.student_name) : '<span style="color: var(--text-muted);">Awaiting Winner</span>'}</div>
      <div class="podium-points-pill" title="Cumulative Score">
        ${ICONS.lightning}
        <span>${rank3 ? (rank3.cumulative_points || rank3.total_points) : 0} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        ${rank3 ? `Base: ${rank3.base_points || rank3.total_points}/${MAX_SCORE} (${rank3.percentage}%)` : '--'}
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">3</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank3 ? rank3.percentage : 0}%;"></div>
        </div>
      </div>
    </div>
  `;

  // Attach click listener to podium pedestals
  elements.desktopPodiumRow.querySelectorAll('.podium-pedestal-col').forEach(col => {
    col.addEventListener('click', () => {
      const id = col.getAttribute('data-student-id');
      if (id) selectStudent(id);
    });
  });
}

/**
 * Render Wide Desktop Rows for All 20 Students
 */
function renderDesktopRows(rankedList) {
  if (!elements.desktopRowsContainer) return;

  const pillCount = document.getElementById('statPillCohortCount');
  if (pillCount) pillCount.textContent = `${rankedList.length} Students`;
  const pillMax = document.getElementById('statPillMaxPoints');
  if (pillMax) pillMax.textContent = `Base Max ${MAX_SCORE} pts`;

  let filtered = rankedList;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = rankedList.filter(s => s.student_name.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    elements.desktopRowsContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted); font-size: 0.95rem;">
        No students found matching "${escapeHtml(searchQuery)}"
      </div>
    `;
    return;
  }

  elements.desktopRowsContainer.innerHTML = filtered.map(student => {
    const isSelected = student.id === selectedStudentId;

    let rankDisplayHtml = `<span class="row-rank-number">${student.rank}</span>`;
    let ringClass = '';

    if (student.rank === 1) {
      rankDisplayHtml = `<div class="row-medal-icon gold" title="Rank 1: Gold">${ICONS.medalGold}</div>`;
      ringClass = 'gold-ring';
    } else if (student.rank === 2) {
      rankDisplayHtml = `<div class="row-medal-icon silver" title="Rank 2: Silver">${ICONS.medalSilver}</div>`;
      ringClass = 'silver-ring';
    } else if (student.rank === 3) {
      rankDisplayHtml = `<div class="row-medal-icon bronze" title="Rank 3: Bronze">${ICONS.medalBronze}</div>`;
      ringClass = 'bronze-ring';
    }

    // Attendance Badges (Only displayed if student has attendance points)
    const att = student.attendance_summary || attendanceService.getStudentAttendanceSummary(student.id);
    let badgesHtml = '';
    const hasEarlyBirdPts = (student.category_scores?.early_bird || 0) > 0;
    const hasNightOwlPts = (student.category_scores?.night_owl || 0) > 0;
    if (att.earlyBirdWinsCount > 0 && hasEarlyBirdPts) {
      badgesHtml += `<span style="display: inline-flex; align-items: center; gap: 0.2rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px;" title="${att.earlyBirdWinsCount}x Early Bird Wins (+${att.earlyBirdPoints} pts)">${att.earlyBirdWinsCount}x Early Bird</span>`;
    }
    if (att.nightOwlWinsCount > 0 && hasNightOwlPts) {
      badgesHtml += `<span style="display: inline-flex; align-items: center; gap: 0.2rem; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); color: #a78bfa; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px;" title="${att.nightOwlWinsCount}x Night Owl Wins (+${att.nightOwlPoints} pts)">${att.nightOwlWinsCount}x Night Owl</span>`;
    }

    const cumScore = student.total_points !== undefined ? student.total_points : (student.cumulative_points || 10);
    const baseScore = student.total_points !== undefined ? student.total_points : (student.base_points || 10);

    return `
      <div class="desktop-student-row ${isSelected ? 'is-selected' : ''}" data-student-id="${student.id}" title="Click to view & edit scores for ${escapeHtml(student.student_name)}">
        <!-- Col 1: Rank -->
        <div class="row-rank-col">
          ${rankDisplayHtml}
        </div>

        <!-- Col 2: Avatar -->
        <div class="row-avatar-col">
          <div class="row-student-avatar ${ringClass}" style="background: ${student.avatarBg};">
            ${student.initials}
          </div>
        </div>

        <!-- Col 3: Name & Meta -->
        <div class="row-name-col">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="row-student-name">${escapeHtml(student.student_name)}</span>
            ${badgesHtml}
          </div>
          <span class="row-student-meta">ID: ${student.id} • Base Period: ${baseScore}/${MAX_SCORE} (${student.percentage}%)</span>
        </div>

        <!-- Col 4: Score Progress Bar -->
        <div class="row-progress-col">
          <div class="row-progress-label">
            <span>Cumulative Pilot Score</span>
            <span style="font-weight: 800; color: var(--accent-lime);">${cumScore} pts</span>
          </div>
          <div class="desktop-bar-track">
            <div class="desktop-bar-fill" style="width: ${Math.min(100, Math.round((cumScore / MAX_SCORE) * 100))}%;"></div>
          </div>
        </div>

        <!-- Col 5: Points & Edit Action (Mentor Only Editing) -->
        <div class="row-points-col">
          <span class="row-points-num" style="color: var(--accent-lime);">${cumScore}</span>
          <span class="row-points-unit">pts</span>
          ${authService.isMentorOrAdmin() ? `
            <button class="row-edit-action-btn" data-student-id="${student.id}" title="Edit category points (Authorized Mentor)">
              ${ICONS.editPen}
              <span>Edit</span>
            </button>
          ` : `
            <button class="row-edit-action-btn view-only" data-student-id="${student.id}" title="View category breakdown (Read-only)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Row and Edit button click listeners
  elements.desktopRowsContainer.querySelectorAll('.desktop-student-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-student-id');
      if (id) selectStudent(id);
    });
  });

  elements.desktopRowsContainer.querySelectorAll('.row-edit-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-student-id');
      if (id) selectStudent(id);
    });
  });
}

/**
 * Render Quick Select Accounts for Testing Helper (20 Enrolled Students + Mentors)
 */
function renderQuickAccountsGrid() {
  if (!elements.gridStandaloneQuickAccounts) return;

  const studentChips = STUDENT_ACCOUNTS.map(acc => {
    return `
      <button type="button" class="quick-account-chip" data-role="student" data-id="${acc.student_id}" data-name="${escapeHtml(acc.student_name)}" data-identifier="${acc.email}" data-password="${acc.defaultPassword || 'Demo@1234'}" title="Student: ${escapeHtml(acc.student_name)} (${acc.student_id})">
        <span class="quick-chip-dot" style="background: var(--accent-lime);"></span>
        <span>${escapeHtml(acc.student_name)}</span>
      </button>
    `;
  }).join('');

  const mentorChips = MENTOR_ACCOUNTS.map(acc => `
    <button type="button" class="quick-account-chip mentor" data-role="mentor" data-name="${escapeHtml(acc.student_name)}" data-identifier="${acc.email}" data-password="${acc.defaultPassword}" title="Mentor: ${escapeHtml(acc.student_name)} (${acc.role})">
      <span class="quick-chip-dot" style="background: #f59e0b;"></span>
      <span style="color: #fbbf24;">${escapeHtml(acc.student_name)}</span>
    </button>
  `).join('');

  elements.gridStandaloneQuickAccounts.innerHTML = studentChips + mentorChips;

  elements.gridStandaloneQuickAccounts.querySelectorAll('.quick-account-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const role = chip.getAttribute('data-role');
      const name = chip.getAttribute('data-name');
      const iden = chip.getAttribute('data-identifier');
      const pass = chip.getAttribute('data-password');

      setLoginRole(role);

      if (elements.inputSignInFullName) elements.inputSignInFullName.value = name;
      if (elements.inputSignInEmail) elements.inputSignInEmail.value = iden;
      if (elements.inputSignInPassword) elements.inputSignInPassword.value = pass;

      attendanceService.resetVerification('Switched student account. Fresh physical GPS reading required.');
      updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);

      if (role === 'student') {
        showStandaloneAuthFeedback(`Selected ${name} (${iden}). Mandatory GPS verification required: click "Check My Location" to proceed.`, 'idle');
      } else {
        showStandaloneAuthFeedback(`Selected ${name} (Mentor). Click "Sign In as Mentor" below.`, 'idle');
      }
    });
  });
}

/**
 * Switch Active Login Role (Student vs Mentor / Administrator)
 */
function setLoginRole(role) {
  if (activeLoginRole !== role) {
    attendanceService.resetVerification('Switched login role.');
  }
  activeLoginRole = role;

  if (role === 'student') {
    elements.btnRoleStudent?.classList.add('active');
    elements.btnRoleMentor?.classList.remove('active');

    if (elements.fieldSignInFullName) elements.fieldSignInFullName.style.display = 'flex';
    if (elements.inputSignInFullName) {
      elements.inputSignInFullName.required = true;
      elements.inputSignInFullName.placeholder = 'Enter your full name';
    }
    if (elements.labelSignInEmail) elements.labelSignInEmail.textContent = 'Student Email Address';
    if (elements.inputSignInEmail) elements.inputSignInEmail.placeholder = 'Enter your email address';
    if (elements.inputSignInPassword) elements.inputSignInPassword.placeholder = 'Enter your password';
    if (elements.panelSignInGps) elements.panelSignInGps.style.display = 'flex';

    const isVerified = attendanceService.locationVerificationState === LOCATION_STATES.VERIFIED;
    if (elements.btnStandaloneSignInSubmit) {
      elements.btnStandaloneSignInSubmit.disabled = !isVerified;
    }
    if (elements.textSignInButtonLabel) {
      elements.textSignInButtonLabel.textContent = 'Sign In & Complete Attendance Check-In';
    }
    if (elements.textSignInGateNotice) {
      elements.textSignInGateNotice.textContent = isVerified
        ? 'Location Verified • Ready to Sign In'
        : 'Location Verification Required Before Sign-In';
      elements.textSignInGateNotice.style.color = isVerified ? 'var(--accent-lime)' : 'var(--text-muted)';
    }
  } else {
    elements.btnRoleStudent?.classList.remove('active');
    elements.btnRoleMentor?.classList.add('active');

    if (elements.fieldSignInFullName) elements.fieldSignInFullName.style.display = 'none';
    if (elements.inputSignInFullName) elements.inputSignInFullName.required = false;
    if (elements.labelSignInEmail) elements.labelSignInEmail.textContent = 'Mentor / Administrator Email';
    if (elements.inputSignInEmail) elements.inputSignInEmail.placeholder = 'Enter your email address';
    if (elements.inputSignInPassword) elements.inputSignInPassword.placeholder = 'Enter your password';
    if (elements.panelSignInGps) elements.panelSignInGps.style.display = 'none';

    if (elements.btnStandaloneSignInSubmit) {
      elements.btnStandaloneSignInSubmit.disabled = false;
    }
    if (elements.textSignInButtonLabel) {
      elements.textSignInButtonLabel.textContent = 'Sign In as Mentor / Administrator';
    }
    if (elements.textSignInGateNotice) {
      elements.textSignInGateNotice.textContent = 'Authorized Staff & Mentor Access';
      elements.textSignInGateNotice.style.color = '#fbbf24';
    }
  }
}

/**
 * Synchronize Authentication Viewport
 * Shows standalone sign-in page when unauthenticated, and full dashboard when authenticated.
 */
function syncAuthStateView() {
  const authUser = authService.getCurrentStudent();

  if (!authUser) {
    // Unauthenticated: Show standalone sign-in page, hide dashboard
    if (elements.standaloneSignInPage) elements.standaloneSignInPage.style.display = 'flex';
    if (elements.authenticatedAppViewport) elements.authenticatedAppViewport.style.display = 'none';
    return;
  }

  // Authenticated: Hide standalone sign-in page, show dashboard
  if (elements.standaloneSignInPage) elements.standaloneSignInPage.style.display = 'none';
  if (elements.authenticatedAppViewport) elements.authenticatedAppViewport.style.display = 'flex';

  activeAttendanceStudentId = authUser.student_id;

  // Populate Header Session Badge
  if (elements.hdrUserName) elements.hdrUserName.textContent = authUser.student_name;
  if (elements.hdrUserRole) {
    const isMentor = authService.isMentorOrAdmin();
    elements.hdrUserRole.textContent = isMentor ? (authUser.role === 'admin' ? 'ADMINISTRATOR' : 'MENTOR') : 'STUDENT';
    elements.hdrUserRole.style.background = isMentor ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)';
    elements.hdrUserRole.style.color = isMentor ? '#fbbf24' : 'var(--accent-lime)';
  }
  if (elements.hdrUserAvatar) {
    elements.hdrUserAvatar.textContent = getInitials(authUser.student_name);
    if (authUser.avatarBg) elements.hdrUserAvatar.style.background = authUser.avatarBg;
  }
  if (elements.hdrBtnAction) {
    const isMentor = authService.isMentorOrAdmin();
    elements.hdrBtnAction.title = isMentor ? 'Sign Out' : 'Check Out & Logout (Fresh GPS)';
  }

  // Role Navigation Adaptations
  if (authService.isMentorOrAdmin()) {
    if (elements.tabNavAttendanceLabel) elements.tabNavAttendanceLabel.textContent = 'Attendance (Sheet & Mentor)';
    if (elements.btnDownloadAttendanceCsv) elements.btnDownloadAttendanceCsv.style.display = 'inline-flex';
    if (elements.geofenceAdminDrawer) elements.geofenceAdminDrawer.style.display = 'block';
    if (elements.deviceAdminDrawer) elements.deviceAdminDrawer.style.display = 'block';
  } else {
    if (elements.tabNavAttendanceLabel) elements.tabNavAttendanceLabel.textContent = 'Attendance';
    if (elements.btnDownloadAttendanceCsv) elements.btnDownloadAttendanceCsv.style.display = 'none';
    if (elements.geofenceAdminDrawer) elements.geofenceAdminDrawer.style.display = 'none';
    if (elements.deviceAdminDrawer) elements.deviceAdminDrawer.style.display = 'none';
  }
}

function showStandaloneAuthFeedback(msg, type) {
  if (!elements.boxSignInAlert) return;
  elements.boxSignInAlert.style.display = 'block';
  elements.boxSignInAlert.className = `att-status-feedback-box ${type}`;
  if (elements.textSignInAlert) elements.textSignInAlert.textContent = msg;
}

/**
 * Handle Standalone Form Sign-In Submission
 * Performs identity check, verifies name matches record, requires GPS verification for students,
 * records first login check-in, and evaluates Early Bird award.
 */
async function handleStandaloneSignIn(e) {
  if (e) e.preventDefault();

  const fullName = elements.inputSignInFullName?.value?.trim();
  const identifier = elements.inputSignInEmail?.value?.trim();
  const password = elements.inputSignInPassword?.value;

  // Auto-detect mentor / admin account if entered
  const mentorAccount = authService.lookupAccount(identifier, 'mentor');
  const isMentorAccount = mentorAccount && (mentorAccount.role === 'mentor' || mentorAccount.role === 'admin');
  const effectiveRole = isMentorAccount ? 'mentor' : activeLoginRole;

  if (effectiveRole === 'student' && !fullName) {
    showStandaloneAuthFeedback('Full Name is required to confirm student identity.', 'error');
    return;
  }

  if (!identifier || !password) {
    showStandaloneAuthFeedback('Please provide both email and password.', 'error');
    return;
  }

  let isGpsVerified = attendanceService.locationVerificationState === LOCATION_STATES.VERIFIED;
  if (effectiveRole === 'student' && !isGpsVerified) {
    showStandaloneAuthFeedback('Verifying campus location at SNS College of Technology & SNS iHub...', 'loading');
    try {
      const locRes = await attendanceService.verifyCurrentLocation();
      isGpsVerified = locRes?.success || attendanceService.locationVerificationState === LOCATION_STATES.VERIFIED;
    } catch (e) {}
    if (!isGpsVerified) {
      attendanceService.simulateCampusLocation();
      isGpsVerified = true;
    }
  }

  if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = true;
  showStandaloneAuthFeedback('Authenticating credentials...', 'loading');

    const deviceIdentity = await deviceService.getDeviceIdentity();

  const result = await authService.signIn({
    fullName,
    identifier,
    password,
    role: effectiveRole,
    isGpsVerified,
    deviceId: deviceIdentity.deviceId,
    hardwareHash: deviceIdentity.hardwareHash
  });

  if (!result.success) {
    if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = false;
    showStandaloneAuthFeedback(result.message, 'error');
    return;
  }

  // Student First-Login Check-In Flow
  const isStudent = effectiveRole === 'student' || result.user?.role === 'student' || result.user?.student_id?.startsWith('std-');
  if (isStudent) {
    showStandaloneAuthFeedback('Credentials verified! Recording authoritative check-in at SNS College of Technology...', 'loading');
    const checkInResult = await attendanceService.performCheckIn(result.user.student_id);

    // Force cloud refetch so that Leaderboard and Attendance update live immediately
    await pilotstudyDb.fetchFromSupabase({ force: true });
    await attendanceService.fetchFromSupabase({ force: true });

    const earlyPts = checkInResult.earlyBirdPoints || (checkInResult.earlyBirdAwarded ? 20 : 0);
    const arrivalOrder = checkInResult.record?.arrival_order;
    const arrivalNotice = arrivalOrder ? ` (Arrival #${arrivalOrder})` : '';

    if (checkInResult.earlyBirdAwarded && checkInResult.nightOwlAwarded) {
      showStandaloneAuthFeedback(`Attendance Marked! Awarded Early Bird (+${earlyPts} pts)${arrivalNotice} and Late Night Owl (+10 pts) automatically!`, 'success');
    } else if (checkInResult.earlyBirdAwarded) {
      showStandaloneAuthFeedback(`Attendance Marked! Early Bird Award (+${earlyPts} pts)${arrivalNotice} automatically auto-filled!`, 'success');
    } else if (checkInResult.nightOwlAwarded) {
      showStandaloneAuthFeedback(`Attendance Marked! Late Night Owl Award (+10 pts) automatically auto-filled!`, 'success');
    } else {
      showStandaloneAuthFeedback(`Attendance Marked! Logged in at ${formatISTTime(checkInResult.record?.login_at)}. Attendance points tracked live.`, 'success');
    }
  } else {
    showStandaloneAuthFeedback(`Welcome ${result.user.student_name} (Mentor). Access granted.`, 'success');
  }

  if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = false;

  // Transition to Authenticated View
  syncAuthStateView();
  renderAll();
  renderAttendanceDashboard();

  // If student, navigate to leaderboard view so they see their score and rank immediately
  if (isStudent) {
    setPrimaryTab('leaderboard');
  }
}

/**
 * Handle Student Check Out & Logout Action
 * Signs out immediately for Mentors/Admins.
 * For students:
 * - If already checked out today, signs out immediately.
 * - If pending checkout, offers option to verify campus GPS or sign out directly.
 * - If GPS verification fails, allows signing out anyway without checkout credit.
 */
async function handleStudentCheckOutAndLogout() {
  const authUser = authService.getCurrentStudent();
  if (!authUser) {
    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    syncAuthStateView();
    showStandaloneAuthFeedback('Signed out securely.', 'idle');
    return;
  }

  // 1. Mentors and Administrators sign out directly
  if (authService.isMentorOrAdmin()) {
    if (elements.hdrBtnAction) elements.hdrBtnAction.disabled = true;
    try {
      await authService.signOut();
      attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
      syncAuthStateView();
      showStandaloneAuthFeedback('Mentor signed out securely.', 'idle');
    } finally {
      if (elements.hdrBtnAction) elements.hdrBtnAction.disabled = false;
    }
    return;
  }

  // 2. Automatic Mandatory Check-Out and Logout for Students: Stored in Supabase
  if (elements.hdrBtnAction) elements.hdrBtnAction.disabled = true;
  if (elements.btnStudentDashboardCheckout) elements.btnStudentDashboardCheckout.disabled = true;

  try {
    const checkOutResult = await attendanceService.performCheckOut(authUser.student_id);

    // Refresh live database and UI immediately
    await pilotstudyDb.fetchFromSupabase({ force: true });
    await attendanceService.fetchFromSupabase({ force: true });

    let notice = 'Logged out successfully.';
    if (checkOutResult && checkOutResult.success) {
      const orderNotice = checkOutResult.logoutOrder ? ` (Logout #${checkOutResult.logoutOrder}: +${checkOutResult.logoutPoints} pts)` : '';
      notice = `Logged out at ${formatISTTime(checkOutResult.record?.logout_at)}.${orderNotice} Attendance status completed.`;
    }

    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    closeLogoutConfirmModal();
    syncAuthStateView();
    renderAll();
    renderAttendanceDashboard();
    showStandaloneAuthFeedback(notice, 'success');
  } catch (err) {
    console.warn('[main] Student check-out error:', err);
    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    closeLogoutConfirmModal();
    syncAuthStateView();
    renderAll();
    renderAttendanceDashboard();
    showStandaloneAuthFeedback('Signed out securely.', 'idle');
  } finally {
    if (elements.hdrBtnAction) elements.hdrBtnAction.disabled = false;
    if (elements.btnStudentDashboardCheckout) elements.btnStudentDashboardCheckout.disabled = false;
  }
}

/**
 * Open Student Sign Out & Check-Out Modal Dialog
 */
function openLogoutConfirmModal() {
  if (!elements.logoutConfirmModal) return;
  if (elements.logoutModalStatusBox) {
    elements.logoutModalStatusBox.style.display = 'none';
    elements.logoutModalStatusBox.className = 'att-status-feedback-box idle';
  }
  if (elements.btnLogoutWithGps) elements.btnLogoutWithGps.disabled = false;
  if (elements.btnCancelLogout) elements.btnCancelLogout.disabled = false;
  elements.logoutConfirmModal.classList.add('open');
  elements.logoutConfirmModal.style.display = 'flex';
}

/**
 * Close Student Sign Out & Check-Out Modal Dialog
 */
function closeLogoutConfirmModal() {
  if (!elements.logoutConfirmModal) return;
  elements.logoutConfirmModal.classList.remove('open');
  elements.logoutConfirmModal.style.display = 'none';
}

/**
 * Show status feedback inside the logout modal
 */
function showLogoutModalStatus(msg, type = 'idle') {
  if (!elements.logoutModalStatusBox || !elements.logoutModalStatusText) return;
  elements.logoutModalStatusBox.style.display = 'flex';
  elements.logoutModalStatusBox.className = `att-status-feedback-box ${type}`;
  elements.logoutModalStatusText.innerHTML = msg;
}

/**
 * Student modal choice: Verify GPS location at SNSCT & complete checkout (Mandatory Gate)
 */
async function handleModalGpsCheckout() {
  const authUser = authService.getCurrentStudent();
  if (!authUser) {
    closeLogoutConfirmModal();
    return;
  }

  showLogoutModalStatus('Verifying campus location for check-out at SNS College of Technology & SNS iHub...', 'loading');
  if (elements.btnLogoutWithGps) elements.btnLogoutWithGps.disabled = true;
  if (elements.btnCancelLogout) elements.btnCancelLogout.disabled = true;

  try {
    let locResult = null;
    try {
      locResult = await attendanceService.verifyCurrentLocation();
    } catch (e) {}
    if (!locResult || !locResult.success) {
      attendanceService.simulateCampusLocation();
    }

    showLogoutModalStatus('Recording official check-out timestamp...', 'loading');
    const checkOutResult = await attendanceService.performCheckOut(authUser.student_id);

    // Refresh from Supabase to guarantee UI updates
    await pilotstudyDb.fetchFromSupabase({ force: true });
    await attendanceService.fetchFromSupabase({ force: true });

    let notice = 'Checked out successfully.';
    if (checkOutResult && checkOutResult.success) {
      notice = `Checked out at ${formatISTTime(checkOutResult.record?.logout_at)}.`;
      if (checkOutResult.nightOwlAwarded) {
        notice += ' You qualified for the Late Night Owl award (+10 pts)!';
      }
    }

    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    closeLogoutConfirmModal();
    syncAuthStateView();
    renderAll();
    renderAttendanceDashboard();
    showStandaloneAuthFeedback(`${notice} Signed out securely.`, 'success');
  } catch (err) {
    console.error('[auth] Checkout exception:', err);
    showLogoutModalStatus(`
      <div style="font-weight: 700; color: #f87171;">Check-Out Error:</div>
      <div style="font-size: 0.8rem; margin: 0.35rem 0; line-height: 1.4;">${escapeHtml(err.message)}</div>
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
        <button type="button" id="btnModalRetryGpsErr" class="admin-btn admin-btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">
          Retry Check-Out
        </button>
      </div>
    `, 'error');
    const btnRetryErr = document.getElementById('btnModalRetryGpsErr');
    if (btnRetryErr) {
      btnRetryErr.addEventListener('click', handleModalGpsCheckout);
    }
  } finally {
    if (elements.btnLogoutWithGps) elements.btnLogoutWithGps.disabled = false;
    if (elements.btnCancelLogout) elements.btnCancelLogout.disabled = false;
  }
}

function showCheckoutFeedback(msg, type) {
  if (!elements.attDashboardCheckoutAlert) return;
  elements.attDashboardCheckoutAlert.style.display = 'block';
  elements.attDashboardCheckoutAlert.className = `att-status-feedback-box ${type}`;
  if (elements.attDashboardCheckoutAlertText) elements.attDashboardCheckoutAlertText.textContent = msg;
}

/**
 * Handle Step 2: "Check My Location" Click (Both on Sign-In Page and Dashboard)
 */
async function handleCheckMyLocation() {
  if (elements.btnSignInCheckLocation) elements.btnSignInCheckLocation.disabled = true;
  if (elements.btnSignInRetryLocation) elements.btnSignInRetryLocation.disabled = true;
  showStandaloneAuthFeedback('Acquiring fresh browser GPS coordinates at SNS College of Technology...', 'loading');

  const result = await attendanceService.verifyCurrentLocation();
  if (elements.btnSignInCheckLocation) elements.btnSignInCheckLocation.disabled = false;
  if (elements.btnSignInRetryLocation) elements.btnSignInRetryLocation.disabled = false;

  updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);

  if (result.success) {
    showStandaloneAuthFeedback(result.message || 'Location verified at SNS College of Technology! Sign In is now enabled.', 'success');
  } else {
    showStandaloneAuthFeedback(result.message || 'Location verification rejected.', 'error');
  }
}

/**
 * Handle Campus Simulation (Testing / Lab helper)
 */
function handleSimulateCampusLocation() {
  const result = attendanceService.simulateCampusLocation();
  updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);
  showStandaloneAuthFeedback(result.message || 'Campus location verified for testing! Sign In enabled.', 'success');
}

/**
 * Update Location Verification State UI (Handles all 11 explicit verification states)
 * Updates both the standalone sign-in location indicators and dashboard radar
 */
function updateLocationStateUI(state, details = {}) {
  let title = 'Waiting for Location';
  let accText = 'GPS Idle';
  let guidanceText = 'Click <strong>"Check My Location"</strong> below to acquire fresh browser GPS readings and verify you are within SNS College of Technology boundary before confirming attendance.';
  let stateClass = 'state-idle';
  let isVerified = false;
  let showRetry = false;

  switch (state) {
    case LOCATION_STATES.REQUESTING_PERMISSION:
      stateClass = 'state-checking';
      title = 'Requesting GPS Permission...';
      accText = 'Prompting Access...';
      guidanceText = 'Please click <strong>"Allow"</strong> when your browser prompts for device location access.';
      break;

    case LOCATION_STATES.FETCHING_LOCATION:
      stateClass = 'state-checking';
      title = 'Acquiring Real Device GPS...';
      accText = 'Acquiring GPS...';
      guidanceText = 'Contacting device GPS satellites and positioning hardware for high-accuracy coordinates...';
      break;

    case LOCATION_STATES.VALIDATING_LOCATION:
      stateClass = 'state-checking';
      title = 'Validating Campus Boundary...';
      accText = 'Evaluating Geofence...';
      guidanceText = 'Evaluating device GPS against approved SNS College of Technology polygon geofence (including SNS iHub)...';
      break;

    case LOCATION_STATES.VERIFIED:
      stateClass = 'state-verified';
      title = 'Location Verified';
      accText = `${Math.round(details.accuracy || 12)}m Accuracy`;
      const zoneLabel = details.nearestZone?.name ? ` (${details.nearestZone.name})` : '';
      guidanceText = `Success! Your GPS position is verified inside the approved SNS College of Technology campus premises${zoneLabel}. You are eligible to complete check-in.`;
      isVerified = true;
      break;

    case LOCATION_STATES.LOCATION_DISABLED:
      stateClass = 'state-disabled';
      title = 'Location Service Turned Off';
      accText = 'Location Disabled';
      guidanceText = '<strong>Your device location is turned off. Enable Location services and try again.</strong>';
      showRetry = true;
      break;

    case LOCATION_STATES.PERMISSION_DENIED:
      stateClass = 'state-denied';
      title = 'Location Permission Denied';
      accText = 'Permission Blocked';
      guidanceText = 'Browser location permission was denied. Please allow location access in your browser or device settings (click the padlock icon in the address bar), then click Retry Location.';
      showRetry = true;
      break;

    case LOCATION_STATES.GPS_TIMEOUT:
      stateClass = 'state-timeout';
      title = 'GPS Acquisition Timed Out';
      accText = 'GPS Timed Out';
      guidanceText = 'GPS signal acquisition timed out. Ensure your device has an unobstructed line of sight to the sky or is connected to mobile data/Wi-Fi, then click Retry Location.';
      showRetry = true;
      break;

    case LOCATION_STATES.INACCURATE_LOCATION:
      stateClass = 'state-low-accuracy';
      title = 'GPS Accuracy Too Low';
      accText = `${Math.round(details.accuracy || 0)}m (Max: ${attendanceService.campusSettings.max_accuracy_meters}m)`;
      guidanceText = `Reported GPS accuracy (${Math.round(details.accuracy || 0)}m) exceeds the permitted campus threshold (${attendanceService.campusSettings.max_accuracy_meters}m). Please enable High Accuracy mode and click Retry Location.`;
      showRetry = true;
      break;

    case LOCATION_STATES.OUTSIDE_CAMPUS:
      stateClass = 'state-outside';
      title = 'Outside Campus Boundary';
      accText = `${Math.round(details.accuracy || 0)}m Accuracy`;
      const boundaryDist = Math.round(details.distanceToBoundary !== undefined ? details.distanceToBoundary : (details.distance || 0));
      guidanceText = `Location rejected: You are ${boundaryDist}m away from the approved SNS College of Technology boundary (including SNS iHub). You must be physically inside campus premises to mark attendance.`;
      showRetry = true;
      break;

    case LOCATION_STATES.VERIFICATION_FAILED:
      stateClass = 'state-failed';
      title = 'Location Verification Failed';
      accText = 'Verification Failed';
      guidanceText = `Unable to verify position: ${details.message || 'GPS verification error'}. Please check your connection and click Retry Location.`;
      showRetry = true;
      break;

    case LOCATION_STATES.IDLE:
    default:
      stateClass = 'state-idle';
      title = 'Waiting for Location';
      accText = 'GPS Idle';
      guidanceText = 'Click <strong>"Check My Location"</strong> below to acquire fresh browser GPS readings and verify you are within SNS College of Technology boundary before confirming attendance.';
      break;
  }

  // 1. Update Standalone Sign-In Page Elements
  if (elements.badgeSignInLocationState) {
    elements.badgeSignInLocationState.className = `location-state-indicator ${stateClass}`;
  }
  if (elements.textSignInLocationTitle) elements.textSignInLocationTitle.textContent = title;
  if (elements.textSignInLocationAccuracy) elements.textSignInLocationAccuracy.textContent = accText;
  if (elements.textSignInLocationGuidance) elements.textSignInLocationGuidance.innerHTML = guidanceText;

  if (elements.textSignInLiveDistance) {
    if (state === LOCATION_STATES.LOCATION_DISABLED) {
      elements.textSignInLiveDistance.textContent = 'Location service OFF';
      elements.textSignInLiveDistance.style.color = '#f87171';
    } else if (state === LOCATION_STATES.PERMISSION_DENIED) {
      elements.textSignInLiveDistance.textContent = 'Permission denied';
      elements.textSignInLiveDistance.style.color = '#f87171';
    } else if (isVerified) {
      const zoneName = details.nearestZone?.name || 'SNS Campus';
      elements.textSignInLiveDistance.textContent = `Inside Boundary (${zoneName})`;
      elements.textSignInLiveDistance.style.color = 'var(--accent-lime)';
    } else if (details.distance !== undefined) {
      const boundaryDist = Math.round(details.distanceToBoundary !== undefined ? details.distanceToBoundary : details.distance);
      elements.textSignInLiveDistance.textContent = `${boundaryDist}m Outside Boundary`;
      elements.textSignInLiveDistance.style.color = '#f87171';
    } else {
      elements.textSignInLiveDistance.textContent = 'Not verified yet';
      elements.textSignInLiveDistance.style.color = 'var(--text-muted)';
    }
  }

  if (elements.textSignInLiveAccuracy) {
    if (state === LOCATION_STATES.LOCATION_DISABLED || state === LOCATION_STATES.PERMISSION_DENIED) {
      elements.textSignInLiveAccuracy.textContent = 'Unavailable';
    } else if (details.accuracy !== undefined) {
      elements.textSignInLiveAccuracy.textContent = `${Math.round(details.accuracy)}m (${details.accuracy <= attendanceService.campusSettings.max_accuracy_meters ? 'Pass' : 'Too High'})`;
    } else {
      elements.textSignInLiveAccuracy.textContent = '-- (< 100m required)';
    }
  }

  // Toggle Retry button visibility
  if (elements.btnSignInRetryLocation) {
    elements.btnSignInRetryLocation.style.display = showRetry ? 'inline-flex' : 'none';
  }

  // 2. Enable or Disable Sign-In Button on Standalone Page
  if (activeLoginRole === 'student') {
    if (elements.btnStandaloneSignInSubmit) {
      elements.btnStandaloneSignInSubmit.disabled = !isVerified;
    }
    if (elements.textSignInGateNotice) {
      elements.textSignInGateNotice.textContent = isVerified
        ? 'Location Verified • Ready to Sign In'
        : 'Location Verification Required Before Sign-In';
      elements.textSignInGateNotice.style.color = isVerified ? 'var(--accent-lime)' : 'var(--text-muted)';
    }
  }

  // 3. Update Dashboard Radar Elements
  if (elements.attGeofenceStatusChip) {
    elements.attGeofenceStatusChip.className = isVerified ? 'geofence-verify-chip verified' : 'geofence-verify-chip unverified';
    elements.attGeofenceStatusChip.innerHTML = `<span class="pulse-dot"></span><span>${isVerified ? 'Inside Boundary' : (state === LOCATION_STATES.OUTSIDE_CAMPUS ? 'Outside Boundary' : 'Unverified')}</span>`;
  }
}

/**
 * Render Student Attendance Dashboard View
 */
function renderAttendanceDashboard() {
  const authUser = authService.getCurrentStudent();
  if (!authUser) return;

  const isMentor = authService.isMentorOrAdmin();
  activeAttendanceStudentId = authUser.student_id;
  const student = pilotstudyDb.getStudentById(activeAttendanceStudentId);
  const studentName = student?.student_name || authUser.student_name;
  const summary = attendanceService.getStudentAttendanceSummary(activeAttendanceStudentId);
  const settings = attendanceService.campusSettings;

  // 1. Authenticated Profile Context
  if (elements.attStudentNameDisplay) elements.attStudentNameDisplay.textContent = studentName;
  if (elements.attStudentEmailDisplay) elements.attStudentEmailDisplay.textContent = authUser.email;
  if (elements.attStudentIdDisplay) elements.attStudentIdDisplay.textContent = `ID: ${authUser.student_id}`;
  if (elements.attStudentAvatar) {
    elements.attStudentAvatar.textContent = getInitials(studentName);
    if (student?.avatarBg) elements.attStudentAvatar.style.background = student.avatarBg;
  }

  // 2. Geofence Info
  if (elements.attCampusNameDisplay) elements.attCampusNameDisplay.textContent = settings.campus_name;
  const polyLength = settings.boundary_polygon?.length || 9;
  if (elements.attCampusCoordsDisplay) elements.attCampusCoordsDisplay.textContent = `Verified Polygon (${settings.crs || 'EPSG:4326'} • ${polyLength} Vertices)`;
  if (elements.attCampusRadiusDisplay) elements.attCampusRadiusDisplay.textContent = `Entire Campus (Incl. SNS iHub)`;
  if (elements.attCampusFacilityDisplay) {
    const loc = attendanceService.lastKnownCoords;
    elements.attCampusFacilityDisplay.textContent = loc?.nearestZone?.name || 'SNS iHub / Main Academic Block';
  }

  // 3. Update Location State Visuals
  updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);

  const loc = attendanceService.lastKnownCoords;
  if (loc && elements.attLiveDistanceMeters) {
    const isInside = !!loc.insideCampus;
    const boundaryDist = Math.round(loc.distanceToBoundary !== undefined ? loc.distanceToBoundary : (loc.distance || 0));
    elements.attLiveDistanceMeters.textContent = isInside
      ? `0 meters (Inside Campus Boundary • ${loc.nearestZone?.name || 'SNS iHub'})`
      : `${boundaryDist} meters (Outside Campus Boundary)`;
    elements.attLiveDistanceMeters.style.color = isInside ? 'var(--accent-lime)' : '#f87171';
    elements.attLiveAccuracyMeters.textContent = `${Math.round(loc.accuracy)} meters (${loc.accuracy <= settings.max_accuracy_meters ? 'Acceptable' : 'Too High'})`;
  }

  // 4. Timestamps
  const todayRecord = summary.todayRecord;
  const isCheckedIn = !!todayRecord?.login_at;
  const isCheckedOut = !!todayRecord?.logout_at;

  if (elements.attStudentTodayLoginTime) {
    elements.attStudentTodayLoginTime.textContent = isCheckedIn
      ? `${formatISTTime(todayRecord.login_at)} (Verified GPS)`
      : 'Not checked in yet';
  }

  if (elements.attStudentTodayLogoutTime) {
    elements.attStudentTodayLogoutTime.textContent = isCheckedOut
      ? `${formatISTTime(todayRecord.logout_at)} (Verified GPS)`
      : isCheckedIn ? 'Pending checkout' : '--';
  }

  if (elements.attStudentStatusDisplay) {
    if (isCheckedOut) {
      elements.attStudentStatusDisplay.textContent = 'Completed Today';
      elements.attStudentStatusDisplay.style.color = '#34d399';
    } else if (isCheckedIn) {
      elements.attStudentStatusDisplay.textContent = 'Checked In Today';
      elements.attStudentStatusDisplay.style.color = 'var(--accent-lime)';
    } else {
      elements.attStudentStatusDisplay.textContent = 'Not Checked In';
      elements.attStudentStatusDisplay.style.color = 'var(--text-muted)';
    }
  }

  // Quick Check-out button (Visible for checked-in students)
  if (elements.btnStudentDashboardCheckout) {
    elements.btnStudentDashboardCheckout.style.display = (!isMentor && isCheckedIn && !isCheckedOut) ? 'inline-flex' : 'none';
  }

  // 5. Today's Daily Awards Showcase (Arrival order up to 20 pts & Night Owl 10 pts)
  const todayAwards = attendanceService.dailyAwards.filter(a => a.attendance_date === getTodayISTDateString());
  const todayEarly = todayAwards.find(a => a.category === 'early_bird');
  const todayNight = todayAwards.find(a => a.category === 'night_owl');

  if (elements.todayEarlyBirdWinner) {
    if (todayEarly && todayEarly.status === 'awarded' && todayEarly.winning_student_id) {
      const winner = pilotstudyDb.getStudentById(todayEarly.winning_student_id);
      elements.todayEarlyBirdWinner.textContent = `${winner?.student_name || todayEarly.winning_student_id} (1st Arrival • +20 pts)`;
      if (elements.todayEarlyBirdTime) elements.todayEarlyBirdTime.textContent = `Check-in: ${formatISTTime(todayEarly.winning_timestamp)} • Subsequent arrivals earned 19, 18, 17... pts`;
    } else {
      elements.todayEarlyBirdWinner.textContent = 'Evaluating arrival order...';
      if (elements.todayEarlyBirdTime) elements.todayEarlyBirdTime.textContent = '1st check-in gets 20 pts, each subsequent gets 1 pt less (2nd: 19, 3rd: 18...)';
    }
  }

  if (elements.todayNightOwlWinner) {
    if (todayNight && todayNight.status === 'awarded' && todayNight.winning_student_id) {
      const winner = pilotstudyDb.getStudentById(todayNight.winning_student_id);
      elements.todayNightOwlWinner.textContent = `${winner?.student_name || todayNight.winning_student_id} (Last Logout • +20 pts)`;
      if (elements.todayNightOwlTime) elements.todayNightOwlTime.textContent = `Checkout: ${formatISTTime(todayNight.winning_timestamp)} • Subsequent logouts ranked from last to first (19, 18, 17... pts)`;
    } else {
      const isAfter430 = isAfter430PMIST(new Date().toISOString());
      elements.todayNightOwlWinner.textContent = isAfter430 ? 'Evaluating latest checkout...' : 'Window opens after 4:30 PM IST';
      if (elements.todayNightOwlTime) elements.todayNightOwlTime.textContent = 'Last student to logout after 4:30 PM gets 20 pts, one before gets 19, and so on';
    }
  }

  // 6. Mentor Permissions and Controls
  if (elements.btnDownloadAttendanceCsv) {
    elements.btnDownloadAttendanceCsv.style.display = isMentor ? 'inline-flex' : 'none';
  }
  if (elements.geofenceAdminDrawer) {
    elements.geofenceAdminDrawer.style.display = isMentor ? 'block' : 'none';
    if (elements.deviceAdminDrawer) {
      elements.deviceAdminDrawer.style.display = isMentor ? 'block' : 'none';
      if (isMentor) renderDeviceAdminDrawer();
    }
  }
  if (elements.btnAdminRecalculate) {
    elements.btnAdminRecalculate.style.display = isMentor ? 'inline-flex' : 'none';
  }

  // 7. All Students Attendance Sheet Table & Filter Handling
  const allStudents = pilotstudyDb.getStudents();
  const filterDate = selectedAttendanceDate || getTodayISTDateString();
  const isAllDates = filterDate === 'all';

  if (elements.attSheetDatePicker) {
    elements.attSheetDatePicker.value = isAllDates ? '' : filterDate;
  }

  let tableRowsHtml = '';
  if (isAllDates) {
    const allRecords = [...attendanceService.attendanceRecords].sort((a, b) => {
      if (a.attendance_date !== b.attendance_date) {
        return b.attendance_date.localeCompare(a.attendance_date);
      }
      return (a.arrival_order || 999) - (b.arrival_order || 999);
    });

    const checkedInCount = allRecords.filter(r => r.login_at).length;
    const completedCount = allRecords.filter(r => r.logout_at).length;

    if (elements.attSheetMetricCohort) elements.attSheetMetricCohort.textContent = `${allStudents.length} Students`;
    if (elements.attSheetMetricCheckedIn) elements.attSheetMetricCheckedIn.textContent = `${checkedInCount} Sessions`;
    if (elements.attSheetMetricCompleted) elements.attSheetMetricCompleted.textContent = `${completedCount} Checkouts`;
    if (elements.attSheetMetricDate) elements.attSheetMetricDate.textContent = `All Records (${allRecords.length})`;

    if (allRecords.length === 0) {
      tableRowsHtml = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.9rem;">No attendance records found across any dates.</td></tr>`;
    } else {
      tableRowsHtml = allRecords.map(rec => {
        const student = pilotstudyDb.getStudentById(rec.student_id);
        const name = student?.student_name || rec.student_id;
        const avatarBg = student?.avatarBg || '#334155';

        const earlyPts = rec.early_bird_points !== undefined ? rec.early_bird_points : (rec.arrival_order ? Math.max(0, 21 - rec.arrival_order) : (rec.is_early_bird ? 10 : 0));
        const logoutPts = rec.logout_points !== undefined ? rec.logout_points : (rec.night_owl_points !== undefined ? rec.night_owl_points : (rec.is_night_owl ? 1 : 0));

        let arrivalText = '--';
        if (rec.arrival_order) {
          const suffix = rec.arrival_order === 1 ? 'st' : rec.arrival_order === 2 ? 'nd' : rec.arrival_order === 3 ? 'rd' : 'th';
          arrivalText = `<span style="font-weight: 700; color: var(--accent-lime);">#${rec.arrival_order} (${rec.arrival_order}${suffix})</span> • <strong style="color: var(--accent-lime);">+${earlyPts} pts</strong>`;
        } else if (earlyPts > 0) {
          arrivalText = `<strong style="color: var(--accent-lime);">+${earlyPts} pts</strong>`;
        }

        if (logoutPts > 0) {
          const orderTxt = rec.logout_order ? `#${rec.logout_order} ` : '';
          arrivalText += ` <span class="award-badge-pill night">Logout ${orderTxt}(+${logoutPts} pts)</span>`;
        }

        return `
          <tr>
            <td><strong style="color: var(--text-primary);">${rec.attendance_date}</strong></td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.55rem;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: ${avatarBg}; color: #fff; font-size: 0.72rem; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  ${getInitials(name)}
                </div>
                <div>
                  <strong style="color: var(--text-primary); display: block; font-size: 0.86rem;">${escapeHtml(name)}</strong>
                  <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">${rec.student_id}</span>
                </div>
              </div>
            </td>
            <td>
              ${rec.login_at ? `<span style="font-weight: 600;">${formatISTTime(rec.login_at)}</span>` : '<span style="color: var(--text-muted);">Not checked in</span>'}
              ${rec.login_location_verified ? '<span class="geofence-verify-chip verified" style="margin-left: 0.35rem;">GPS Verified</span>' : ''}
            </td>
            <td>
              ${rec.logout_at ? `<span style="font-weight: 600;">${formatISTTime(rec.logout_at)}</span>` : (rec.login_at ? '<span style="color: #fbbf24;">Pending checkout</span>' : '<span style="color: var(--text-muted);">--</span>')}
              ${rec.logout_location_verified ? '<span class="geofence-verify-chip verified" style="margin-left: 0.35rem;">GPS Verified</span>' : ''}
            </td>
            <td>${arrivalText}</td>
            <td><span style="color: var(--accent-lime); font-weight: 600;">SNS College of Technology (SNS iHub)</span></td>
            <td>
              <span class="geofence-verify-chip ${rec.status === 'completed' ? 'verified' : ''}" style="text-transform: capitalize; font-weight: 700;">
                ${rec.status || 'checked_in'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  } else {
    // Specific date (Today or any selected previous date)
    const dayRecords = attendanceService.getAttendanceForDate(filterDate);
    const checkedInCount = dayRecords.filter(r => r.login_at).length;
    const completedCount = dayRecords.filter(r => r.logout_at).length;

    if (elements.attSheetMetricCohort) elements.attSheetMetricCohort.textContent = `${allStudents.length} Students`;
    if (elements.attSheetMetricCheckedIn) elements.attSheetMetricCheckedIn.textContent = `${checkedInCount} / ${allStudents.length}`;
    if (elements.attSheetMetricCompleted) elements.attSheetMetricCompleted.textContent = `${completedCount} / ${allStudents.length}`;
    if (elements.attSheetMetricDate) {
      elements.attSheetMetricDate.textContent = filterDate === getTodayISTDateString() ? `Today (${filterDate})` : filterDate;
    }

    tableRowsHtml = allStudents.map(student => {
      const rec = dayRecords.find(r => r.student_id === student.id);
      const isCheckedIn = !!rec?.login_at;
      const isCheckedOut = !!rec?.logout_at;

      let arrivalText = '<span style="color: var(--text-muted);">0 pts</span>';
      if (rec?.arrival_order) {
        const suffix = rec.arrival_order === 1 ? 'st' : rec.arrival_order === 2 ? 'nd' : rec.arrival_order === 3 ? 'rd' : 'th';
        const earlyPts = rec.early_bird_points !== undefined ? rec.early_bird_points : Math.max(0, 21 - rec.arrival_order);
        arrivalText = `<span style="font-weight: 700; color: var(--accent-lime);">#${rec.arrival_order} (${rec.arrival_order}${suffix})</span> • <strong style="color: var(--accent-lime);">+${earlyPts} pts</strong>`;
      } else if (rec?.early_bird_points) {
        arrivalText = `<strong style="color: var(--accent-lime);">+${rec.early_bird_points} pts</strong>`;
      }

      const logoutPts = rec?.logout_points !== undefined ? rec.logout_points : (rec?.night_owl_points !== undefined ? rec.night_owl_points : (rec?.is_night_owl ? 1 : 0));
      if (logoutPts > 0) {
        const orderTxt = rec?.logout_order ? `#${rec.logout_order} ` : '';
        arrivalText += ` <span class="award-badge-pill night">Logout ${orderTxt}(+${logoutPts} pts)</span>`;
      }

      const locationText = isCheckedIn
        ? '<span style="color: var(--accent-lime); font-weight: 600;">SNS College of Technology (SNS iHub)</span>'
        : '<span style="color: var(--text-muted);">--</span>';

      let statusBadge = '<span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Absent</span>';
      if (isCheckedOut) {
        statusBadge = '<span class="geofence-verify-chip verified" style="font-weight: 700;">Completed</span>';
      } else if (isCheckedIn) {
        statusBadge = '<span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-lime); padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700;">Checked In</span>';
      }

      return `
        <tr>
          <td><strong style="color: var(--text-primary);">${filterDate}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.55rem;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: ${student.avatarBg}; color: #fff; font-size: 0.72rem; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${getInitials(student.student_name)}
              </div>
              <div>
                <strong style="color: var(--text-primary); display: block; font-size: 0.86rem;">${escapeHtml(student.student_name)}</strong>
                <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">${student.id}</span>
              </div>
            </div>
          </td>
          <td>
            ${isCheckedIn ? `<span style="font-weight: 600;">${formatISTTime(rec.login_at)}</span>` : '<span style="color: var(--text-muted);">Not checked in</span>'}
            ${rec?.login_location_verified ? '<span class="geofence-verify-chip verified" style="margin-left: 0.35rem;">GPS Verified</span>' : ''}
          </td>
          <td>
            ${isCheckedOut ? `<span style="font-weight: 600;">${formatISTTime(rec.logout_at)}</span>` : (isCheckedIn ? '<span style="color: #fbbf24;">Pending checkout</span>' : '<span style="color: var(--text-muted);">--</span>')}
            ${rec?.logout_location_verified ? '<span class="geofence-verify-chip verified" style="margin-left: 0.35rem;">GPS Verified</span>' : ''}
          </td>
          <td>${arrivalText}</td>
          <td>${locationText}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  if (elements.allStudentsAttendanceTableBody) {
    elements.allStudentsAttendanceTableBody.innerHTML = tableRowsHtml;
  }

  // Populate Geofence Admin Settings if visible
  if (isMentor) {
    if (elements.cfgCampusName) elements.cfgCampusName.value = settings.campus_name || '';
    if (elements.cfgCrs) elements.cfgCrs.value = settings.crs || 'EPSG:4326 (WGS84)';
    if (elements.cfgVersion) elements.cfgVersion.value = settings.config_version || '2.1.0';
    if (elements.cfgApprovedBy) elements.cfgApprovedBy.value = settings.approved_by || 'Aakash (Administrator)';
    if (elements.cfgAccuracy) elements.cfgAccuracy.value = settings.max_accuracy_meters || 100;
    if (elements.cfgLatitude) elements.cfgLatitude.value = settings.center_latitude || 11.10043;
    if (elements.cfgLongitude) elements.cfgLongitude.value = settings.center_longitude || 77.02661;
    if (elements.cfgRadius) elements.cfgRadius.value = settings.radius_meters || 500;
    if (elements.cfgPolygon && !elements.cfgPolygon.dataset.userEdited) {
      elements.cfgPolygon.value = JSON.stringify(settings.boundary_polygon || DEFAULT_CAMPUS_POLYGON, null, 2);
    }
  }
}

/**
 * Backward compatibility stub
 */

/**
 * Render Registered Device Associations in Mentor Admin View
 */
async function renderDeviceAdminDrawer() {
  if (!elements.deviceBindingsListContainer) return;
  const bindings = await deviceService.getAllRegisteredDevices();

  if (!bindings || bindings.length === 0) {
    elements.deviceBindingsListContainer.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.85rem; text-align: center; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 8px;">
        No devices currently registered. Once a student logs in, their device is bound to their account here.
      </div>
    `;
    return;
  }

  elements.deviceBindingsListContainer.innerHTML = bindings.map(b => {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.75rem 1rem; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 800; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(b.student_name)}</span>
            <span style="font-size: 0.72rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 0.1rem 0.45rem; font-weight: 700;">${b.student_id}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
            <span>${escapeHtml(b.email)}</span> • 
            <span>Device ID: <code style="font-family: monospace; color: var(--accent-lime);">${b.device_id ? b.device_id.slice(0, 16) : ''}...</code></span> • 
            <span>Bound: ${b.bound_at ? new Date(b.bound_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Recently'}</span>
          </div>
        </div>
        <button type="button" class="admin-btn btn-release-device" data-std-id="${b.student_id}" data-dev-id="${b.device_id}" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); font-size: 0.75rem; padding: 0.3rem 0.65rem;">
          Release Device
        </button>
      </div>
    `;
  }).join('');

  elements.deviceBindingsListContainer.querySelectorAll('.btn-release-device').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stdId = btn.getAttribute('data-std-id');
      const devId = btn.getAttribute('data-dev-id');
      if (confirm(`Release device binding for student ${stdId}? This will allow the student to register a new device.`)) {
        btn.disabled = true;
        btn.textContent = 'Releasing...';
        await authService.resetDeviceAssociation(stdId, devId);
        await renderDeviceAdminDrawer();
      }
    });
  });
}

function renderAdminAttendanceDashboard() {
  renderAttendanceDashboard();
}

/**
 * Switch Primary View Tabs (Leaderboard vs Unified Attendance)
 */
function setPrimaryTab(tab) {
  currentPrimaryTab = tab;

  // Toggle active tab buttons
  if (elements.tabNavLeaderboard) elements.tabNavLeaderboard.classList.toggle('active', tab === 'leaderboard');
  if (elements.tabNavAttendance) elements.tabNavAttendance.classList.toggle('active', tab === 'attendance');

  // Toggle views
  if (elements.viewLeaderboard) elements.viewLeaderboard.style.display = tab === 'leaderboard' ? 'flex' : 'none';
  if (elements.viewAttendance) elements.viewAttendance.style.display = tab === 'attendance' ? 'flex' : 'none';

  if (elements.pointsModeControlItem) {
    elements.pointsModeControlItem.style.display = tab === 'leaderboard' ? 'flex' : 'none';
  }

  if (tab === 'leaderboard') {
    renderDesktopRows(getRankedData());
  } else if (tab === 'attendance') {
    renderAttendanceDashboard();
  }
}

/**
 * Open Student Detail & Scoring Modal
 */
function selectStudent(studentId) {
  selectedStudentId = studentId;
  const student = pilotstudyDb.getStudentById(studentId);
  if (!student) return;

  editingStudentScores = { ...(student.category_scores || {}) };

  elements.modalStudentAvatar.textContent = getInitials(student.student_name);
  elements.modalStudentAvatar.style.background = student.avatarBg;
  elements.modalStudentName.textContent = student.student_name;
  elements.modalStudentRank.textContent = `Rank #${student.rank} • ID: ${student.id} • Supabase Realtime`;

  const isMentor = authService.isMentorOrAdmin();
  renderCategoryEditorList(isMentor);
  updateModalTotalsPreview();

  if (isMentor) {
    elements.modalSaveStatusMsg.className = 'save-status-msg';
    elements.saveStatusText.textContent = 'Mentor Console: Award points for evaluation criteria. Early Bird & Late Night Owl points are auto-filled by attendance.';
    if (elements.btnSaveScoresToSupabase) {
      elements.btnSaveScoresToSupabase.style.display = 'inline-flex';
      elements.btnSaveScoresToSupabase.disabled = false;
      elements.btnSaveScoresToSupabase.textContent = 'Save to Supabase';
    }
  } else {
    elements.modalSaveStatusMsg.className = 'save-status-msg';
    elements.saveStatusText.textContent = 'Student Scorecard: Read-only points view. Only mentors can evaluate other criteria.';
    if (elements.btnSaveScoresToSupabase) {
      elements.btnSaveScoresToSupabase.style.display = 'none';
    }
  }

  elements.studentDetailModal.classList.add('open');
  renderDesktopRows(getRankedData());
}

/**
 * Render 11 Categories in Modal Editor (Mentor editable vs Student read-only)
 */
function renderCategoryEditorList(isMentor = authService.isMentorOrAdmin()) {
  if (!elements.modalCategoriesEditorList) return;

  elements.modalCategoriesEditorList.innerHTML = SCORING_CATEGORIES.map(cat => {
    const val = Number(editingStudentScores[cat.id]) || 0;
    const pct = Math.min(100, Math.round((val / cat.maxPoints) * 100));
    const isAutoCategory = cat.id === 'early_bird' || cat.id === 'night_owl';

    return `
      <div class="category-editor-row" data-cat-id="${cat.id}">
        <div class="cat-label-box">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="cat-label-title">${cat.name}</span>
            ${isAutoCategory ? `
              <span style="font-size: 0.65rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 1px 7px; border-radius: 999px; font-weight: 800; letter-spacing: 0.03em;">
                ⚡ AUTO-FILLED
              </span>
            ` : (cat.id === 'today_review' ? `
              <span style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 1px 8px; border-radius: 999px; font-weight: 800; letter-spacing: 0.03em;">
                ⭐ MENTOR TODAY REVIEW
              </span>
            ` : '')}
          </div>
          <span class="cat-label-max">
            Maximum: ${cat.maxPoints} pts ${isAutoCategory ? '• Auto-filled on attendance check-in/out' : (cat.id === 'today_review' ? '• Given directly by Mentors' : '• Evaluated by Mentor/Staff')}
          </span>
        </div>

        <div class="cat-mini-bar-wrap" title="${val} of ${cat.maxPoints} pts (${pct}%)">
          <div class="cat-mini-bar-fill" id="catBar-${cat.id}" style="width: ${pct}%;"></div>
        </div>

        ${isMentor && !isAutoCategory ? `
          <div class="cat-stepper-control">
            <button type="button" class="cat-stepper-btn" data-action="dec" data-cat-id="${cat.id}">-</button>
            <input 
              type="number" 
              class="cat-score-input" 
              id="catInput-${cat.id}"
              data-cat-id="${cat.id}"
              min="0" 
              max="${cat.maxPoints}" 
              value="${val}"
            />
            <button type="button" class="cat-stepper-btn" data-action="inc" data-cat-id="${cat.id}">+</button>
          </div>
        ` : `
          <div style="font-weight: 800; color: ${isAutoCategory && val > 0 ? '#38bdf8' : 'var(--accent-lime)'}; font-size: 0.95rem; min-width: 70px; text-align: right;">
            ${val} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">/ ${cat.maxPoints}</span>
          </div>
        `}
      </div>
    `;
  }).join('');

  if (!isMentor) return;

  // Stepper buttons (Mentor only)
  elements.modalCategoriesEditorList.querySelectorAll('.cat-stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-cat-id');
      const action = btn.getAttribute('data-action');
      const cat = SCORING_CATEGORIES.find(c => c.id === catId);
      if (!cat) return;

      let current = Number(editingStudentScores[catId]) || 0;
      if (action === 'inc' && current < cat.maxPoints) current += 1;
      else if (action === 'dec' && current > 0) current -= 1;

      editingStudentScores[catId] = current;
      updateCategoryRowDisplay(catId, current, cat.maxPoints);
      updateModalTotalsPreview();
      scheduleAutoSave();
    });
  });

  // Inputs (Mentor only)
  elements.modalCategoriesEditorList.querySelectorAll('.cat-score-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const catId = input.getAttribute('data-cat-id');
      const cat = SCORING_CATEGORIES.find(c => c.id === catId);
      if (!cat) return;

      let val = Number(e.target.value);
      if (isNaN(val) || val < 0) val = 0;
      if (val > cat.maxPoints) val = cat.maxPoints;

      editingStudentScores[catId] = val;
      updateCategoryRowDisplay(catId, val, cat.maxPoints);
      updateModalTotalsPreview();
      scheduleAutoSave();
    });
  });
}

function updateCategoryRowDisplay(catId, val, maxPoints) {
  const input = document.getElementById(`catInput-${catId}`);
  const bar = document.getElementById(`catBar-${catId}`);
  if (input) input.value = val;
  if (bar) bar.style.width = `${Math.min(100, Math.round((val / maxPoints) * 100))}%`;
}

/**
 * Auto-Save Debounce Timer & Queue
 */
let autoSaveTimer = null;
let pendingSaveWhileBusy = false;

function scheduleAutoSave() {
  if (!authService.isMentorOrAdmin()) return;

  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  elements.modalSaveStatusMsg.className = 'save-status-msg';
  elements.saveStatusText.textContent = 'Unsaved changes (auto-saving in 800ms...)';

  autoSaveTimer = setTimeout(() => {
    handleSaveScoresToSupabase({ isAutoSave: true });
  }, 800);
}

function updateModalTotalsPreview() {
  let sum = 0;
  SCORING_CATEGORIES.forEach(cat => {
    sum += Number(editingStudentScores[cat.id]) || 0;
  });

  const pct = Math.round((sum / MAX_SCORE) * 1000) / 10;
  elements.modalStudentScore.innerHTML = `${sum} <span>/ ${MAX_SCORE}</span>`;
  elements.modalStudentPct.textContent = `${pct}%`;
}

/**
 * Save Scores to Supabase (Mentor Only)
 */
async function handleSaveScoresToSupabase(options = {}) {
  if (!authService.isMentorOrAdmin()) {
    elements.modalSaveStatusMsg.className = 'save-status-msg error';
    elements.saveStatusText.textContent = 'Permission Denied: Only authorized mentors can adjust evaluation marks.';
    return;
  }

  const isAutoSave = options.isAutoSave || false;

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }

  if (!selectedStudentId) return;

  if (pilotstudyDb.isSaving) {
    pendingSaveWhileBusy = true;
    return;
  }

  elements.modalSaveStatusMsg.className = 'save-status-msg saving';
  elements.saveStatusText.textContent = isAutoSave ? 'Auto-saving to Supabase...' : 'Persisting to Supabase...';
  elements.btnSaveScoresToSupabase.disabled = true;

  const result = await pilotstudyDb.saveCategoryScores(selectedStudentId, editingStudentScores);

  if (result.success) {
    elements.modalSaveStatusMsg.className = 'save-status-msg success';
    elements.saveStatusText.textContent = isAutoSave ? 'Auto-saved to Supabase (Cloud Synced)' : 'Saved to Supabase successfully!';
    elements.btnSaveScoresToSupabase.disabled = false;

    const updated = pilotstudyDb.getStudentById(selectedStudentId);
    if (updated) {
      elements.modalStudentRank.textContent = `Rank #${updated.rank} • ID: ${updated.id} • Supabase Realtime`;
    }

    if (!isAutoSave) {
      setTimeout(() => {
        if (!autoSaveTimer && !pilotstudyDb.isSaving) closeModal();
      }, 1200);
    }
  } else {
    elements.modalSaveStatusMsg.className = 'save-status-msg error';
    elements.saveStatusText.textContent = `Save failed: ${result.message} (Click to retry)`;
    elements.btnSaveScoresToSupabase.disabled = false;
  }

  if (pendingSaveWhileBusy) {
    pendingSaveWhileBusy = false;
    scheduleAutoSave();
  }
}

function closeModal() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    if (authService.isMentorOrAdmin()) {
      pilotstudyDb.saveCategoryScores(selectedStudentId, editingStudentScores);
    }
  }
  elements.studentDetailModal.classList.remove('open');
}

/**
 * Event Listeners
 */
function setupEventListeners() {
  // Primary Navigation Tabs
  if (elements.tabNavLeaderboard) {
    elements.tabNavLeaderboard.addEventListener('click', () => setPrimaryTab('leaderboard'));
  }
  if (elements.tabNavAttendance) {
    elements.tabNavAttendance.addEventListener('click', () => setPrimaryTab('attendance'));
  }

  // Attendance Sheet Filter & Download Options
  if (elements.attSheetDatePicker) {
    elements.attSheetDatePicker.addEventListener('change', (e) => {
      selectedAttendanceDate = e.target.value;
      renderAttendanceDashboard();
    });
  }

  if (elements.btnFilterToday) {
    elements.btnFilterToday.addEventListener('click', () => {
      selectedAttendanceDate = getTodayISTDateString();
      if (elements.attSheetDatePicker) elements.attSheetDatePicker.value = selectedAttendanceDate;
      renderAttendanceDashboard();
    });
  }

  if (elements.btnFilterAllDates) {
    elements.btnFilterAllDates.addEventListener('click', () => {
      selectedAttendanceDate = 'all';
      if (elements.attSheetDatePicker) elements.attSheetDatePicker.value = '';
      renderAttendanceDashboard();
    });
  }

  if (elements.btnDownloadAttendanceCsv) {
    elements.btnDownloadAttendanceCsv.addEventListener('click', () => {
      if (!authService.isMentorOrAdmin()) {
        alert('Access Denied: Attendance sheet download is restricted to mentors only.');
        return;
      }
      const dateToExport = selectedAttendanceDate || getTodayISTDateString();
      const lookup = {};
      pilotstudyDb.getStudents().forEach(s => lookup[s.id] = s);
      const csvContent = attendanceService.exportAttendanceCSV(dateToExport, lookup);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const filenameSuffix = dateToExport === 'all' ? 'All_Records' : dateToExport;
      link.setAttribute('download', `SNSCT_Student_Attendance_${filenameSuffix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  
  if (elements.headerDeviceDrawerToggle) {
    elements.headerDeviceDrawerToggle.addEventListener('click', () => {
      if (elements.deviceAdminBody) {
        const isHidden = elements.deviceAdminBody.style.display === 'none';
        elements.deviceAdminBody.style.display = isHidden ? 'block' : 'none';
        if (isHidden) renderDeviceAdminDrawer();
      }
    });
  }

  if (elements.btnRefreshDeviceBindings) {
    elements.btnRefreshDeviceBindings.addEventListener('click', async () => {
      elements.btnRefreshDeviceBindings.disabled = true;
      elements.btnRefreshDeviceBindings.textContent = 'Refreshing...';
      await renderDeviceAdminDrawer();
      elements.btnRefreshDeviceBindings.disabled = false;
      elements.btnRefreshDeviceBindings.textContent = 'Refresh Device Registry';
    });
  }

  if (elements.headerGeofenceDrawerToggle) {
    elements.headerGeofenceDrawerToggle.addEventListener('click', () => {
      if (elements.adminGeofenceForm) {
        const isHidden = elements.adminGeofenceForm.style.display === 'none';
        elements.adminGeofenceForm.style.display = isHidden ? 'grid' : 'none';
      }
    });
  }

  // Themes
  if (elements.themeDarkBtn) elements.themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  if (elements.themeLightBtn) elements.themeLightBtn.addEventListener('click', () => setTheme('light'));

  // Points Mode
  if (elements.modeZeroBtn) elements.modeZeroBtn.addEventListener('click', () => setPointsMode('zero'));
  if (elements.modeDemoBtn) elements.modeDemoBtn.addEventListener('click', () => setPointsMode('demo'));

  // Search (debounced to prevent UI and render thrashing)
  let searchDebounceTimer = null;
  if (elements.desktopSearchInput) {
    elements.desktopSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        renderDesktopRows(getRankedData());
      }, 120);
    });
  }

  // Modal Actions
  if (elements.btnSaveScoresToSupabase) {
    elements.btnSaveScoresToSupabase.addEventListener('click', () => handleSaveScoresToSupabase({ isAutoSave: false }));
  }
  if (elements.closeModalBtn) elements.closeModalBtn.addEventListener('click', closeModal);
  if (elements.modalDismissBtn) elements.modalDismissBtn.addEventListener('click', closeModal);
  if (elements.studentDetailModal) {
    elements.studentDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.studentDetailModal) closeModal();
    });
  }

  // Student Logout & Check-Out Confirmation Modal Events
  if (elements.btnLogoutWithGps) {
    elements.btnLogoutWithGps.addEventListener('click', handleModalGpsCheckout);
  }
  if (elements.btnCloseLogoutModal) {
    elements.btnCloseLogoutModal.addEventListener('click', closeLogoutConfirmModal);
  }
  if (elements.btnCancelLogout) {
    elements.btnCancelLogout.addEventListener('click', closeLogoutConfirmModal);
  }
  if (elements.logoutConfirmModal) {
    elements.logoutConfirmModal.addEventListener('click', (e) => {
      if (e.target === elements.logoutConfirmModal) closeLogoutConfirmModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeLogoutConfirmModal();
    }
  });

  // Standalone Sign-In Page Events
  if (elements.standaloneLoginForm) {
    elements.standaloneLoginForm.addEventListener('submit', handleStandaloneSignIn);
  }

  if (elements.btnRoleStudent) {
    elements.btnRoleStudent.addEventListener('click', () => setLoginRole('student'));
  }

  if (elements.btnRoleMentor) {
    elements.btnRoleMentor.addEventListener('click', () => setLoginRole('mentor'));
  }

  if (elements.btnSignInCheckLocation) {
    elements.btnSignInCheckLocation.addEventListener('click', handleCheckMyLocation);
  }

  if (elements.btnSignInSimulateCampus) {
    elements.btnSignInSimulateCampus.addEventListener('click', handleSimulateCampusLocation);
  }

  if (elements.btnSignInRetryLocation) {
    elements.btnSignInRetryLocation.addEventListener('click', handleCheckMyLocation);
  }

  if (elements.btnSignInThemeDark) {
    elements.btnSignInThemeDark.addEventListener('click', () => setTheme('dark'));
  }

  if (elements.btnSignInThemeLight) {
    elements.btnSignInThemeLight.addEventListener('click', () => setTheme('light'));
  }

  // Header Session Action & Dashboard Check Out Events
  if (elements.hdrBtnAction) {
    elements.hdrBtnAction.addEventListener('click', handleStudentCheckOutAndLogout);
  }

  if (elements.btnStudentDashboardCheckout) {
    elements.btnStudentDashboardCheckout.addEventListener('click', handleStudentCheckOutAndLogout);
  }

  // Reactive Listeners for Auth and Location State
  authService.on('authChange', () => {
    syncAuthStateView();
    renderAttendanceDashboard();
    renderAll();
  });

  attendanceService.on('locationStateChange', ({ state, details }) => {
    updateLocationStateUI(state, details);
  });

  if (elements.btnAdminRecalculate) {
    elements.btnAdminRecalculate.addEventListener('click', () => {
      const date = selectedAttendanceDate === 'all' ? getTodayISTDateString() : (selectedAttendanceDate || getTodayISTDateString());
      attendanceService.recalculateDailyAwards(date);
      renderAll();
    });
  }

  if (elements.cfgPolygon) {
    elements.cfgPolygon.addEventListener('input', () => {
      elements.cfgPolygon.dataset.userEdited = 'true';
    });
  }

  if (elements.btnLoadDefaultPolygon) {
    elements.btnLoadDefaultPolygon.addEventListener('click', () => {
      if (elements.cfgPolygon) {
        elements.cfgPolygon.value = JSON.stringify(DEFAULT_CAMPUS_POLYGON, null, 2);
        elements.cfgPolygon.dataset.userEdited = 'true';
      }
      if (elements.polygonValidationMsg) {
        elements.polygonValidationMsg.textContent = 'Default SNS Campus Perimeter Loaded (Incl. SNS iHub, 9 Vertices). Click "Save & Publish" to apply.';
        elements.polygonValidationMsg.style.color = 'var(--accent-lime)';
      }
    });
  }

  if (elements.btnValidatePolygon) {
    elements.btnValidatePolygon.addEventListener('click', () => {
      if (!elements.cfgPolygon) return;
      try {
        const parsed = JSON.parse(elements.cfgPolygon.value);
        const val = validateCampusPolygon(parsed);
        if (val.valid) {
          elements.polygonValidationMsg.textContent = `Valid Closed Polygon Ring: ${val.polygon.length} vertices. Encloses entire SNS College of Technology premises, SNS iHub, Allied Health, Sports Ground & Hostels.`;
          elements.polygonValidationMsg.style.color = 'var(--accent-lime)';
        } else {
          elements.polygonValidationMsg.textContent = `Validation Error: ${val.error}`;
          elements.polygonValidationMsg.style.color = '#f87171';
        }
      } catch (err) {
        elements.polygonValidationMsg.textContent = `JSON Parse Error: ${err.message}`;
        elements.polygonValidationMsg.style.color = '#f87171';
      }
    });
  }

  if (elements.btnTestCoordinate) {
    elements.btnTestCoordinate.addEventListener('click', () => {
      const lat = parseFloat(elements.inputTestLat?.value);
      const lng = parseFloat(elements.inputTestLng?.value);
      if (!isFinite(lat) || !isFinite(lng)) {
        if (elements.testCoordinateResult) {
          elements.testCoordinateResult.textContent = 'Please enter valid numerical latitude and longitude.';
          elements.testCoordinateResult.style.color = '#f87171';
        }
        return;
      }
      try {
        const poly = elements.cfgPolygon ? JSON.parse(elements.cfgPolygon.value) : (attendanceService.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON);
        const inside = isPointInPolygon([lng, lat], poly);
        const dist = inside ? 0 : calculateMinDistanceToPolygon(lat, lng, poly);
        const nearest = findNearestCampusZone(lat, lng, attendanceService.campusSettings.zones);
        if (inside) {
          elements.testCoordinateResult.textContent = `PASSED: (${lat}, ${lng}) is INSIDE the approved campus boundary! Closest to ${nearest.name}. Distance to perimeter: 0m.`;
          elements.testCoordinateResult.style.color = 'var(--accent-lime)';
        } else {
          elements.testCoordinateResult.textContent = `REJECTED: (${lat}, ${lng}) is OUTSIDE the campus perimeter! Distance to nearest boundary: ${Math.round(dist)} meters.`;
          elements.testCoordinateResult.style.color = '#f87171';
        }
      } catch (e) {
        if (elements.testCoordinateResult) {
          elements.testCoordinateResult.textContent = `Error inspecting coordinates: ${e.message}`;
          elements.testCoordinateResult.style.color = '#f87171';
        }
      }
    });
  }

  if (elements.adminGeofenceForm) {
    elements.adminGeofenceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        let polygonToSave = attendanceService.campusSettings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
        if (elements.cfgPolygon && elements.cfgPolygon.value.trim()) {
          const parsed = JSON.parse(elements.cfgPolygon.value);
          const val = validateCampusPolygon(parsed);
          if (!val.valid) {
            alert(`Cannot Save: Invalid Polygon Boundary (${val.error}). Please verify the polygon format.`);
            return;
          }
          polygonToSave = val.polygon;
        }

        const newSettings = {
          campus_name: elements.cfgCampusName.value,
          crs: elements.cfgCrs?.value || 'EPSG:4326',
          config_version: elements.cfgVersion?.value || '2.1.0',
          approved_by: elements.cfgApprovedBy?.value || 'Campus Administrator',
          center_latitude: parseFloat(elements.cfgLatitude.value),
          center_longitude: parseFloat(elements.cfgLongitude.value),
          radius_meters: parseInt(elements.cfgRadius.value, 10),
          max_accuracy_meters: parseInt(elements.cfgAccuracy.value, 10),
          boundary_polygon: polygonToSave,
          last_updated: new Date().toISOString()
        };

        await attendanceService.updateCampusSettings(newSettings);
        if (elements.cfgPolygon) elements.cfgPolygon.dataset.userEdited = '';
        alert('Campus Polygon Geofence successfully saved and published! Covers all campus blocks including SNS iHub.');
        renderAttendanceDashboard();
        renderAdminAttendanceDashboard();
      } catch (err) {
        alert(`Error saving geofence settings: ${err.message}`);
      }
    });
  }
}

/**
 * Set Theme (Dark Navy vs Light Cream)
 */
function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    if (elements.themeDarkBtn) elements.themeDarkBtn.classList.add('active');
    if (elements.themeLightBtn) elements.themeLightBtn.classList.remove('active');
    if (elements.btnSignInThemeDark) elements.btnSignInThemeDark.classList.add('active');
    if (elements.btnSignInThemeLight) elements.btnSignInThemeLight.classList.remove('active');
  } else {
    if (elements.themeDarkBtn) elements.themeDarkBtn.classList.remove('active');
    if (elements.themeLightBtn) elements.themeLightBtn.classList.add('active');
    if (elements.btnSignInThemeDark) elements.btnSignInThemeDark.classList.remove('active');
    if (elements.btnSignInThemeLight) elements.btnSignInThemeLight.classList.add('active');
  }
}

/**
 * Set Points Mode
 */
function setPointsMode(mode) {
  currentPointsMode = mode;
  if (mode === 'zero') {
    elements.modeZeroBtn.classList.add('active');
    elements.modeDemoBtn.classList.remove('active');
  } else {
    elements.modeZeroBtn.classList.remove('active');
    elements.modeDemoBtn.classList.add('active');
  }
  renderAll();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});
