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
import { appQueryCache } from './data/cacheEngine.js';
import { CachingSimulation } from './systemDesignLab/cachingSim.js';
import { LoadBalancingSimulation } from './systemDesignLab/loadBalancingSim.js';

// Application State
let currentTheme = 'dark';
let currentPointsMode = 'demo'; // 'demo' (Supabase live) | 'zero'
let currentPrimaryTab = 'leaderboard'; // 'leaderboard' | 'attendance' | 'admin_attendance' | 'system_lab'
let currentLabModule = 'caching'; // 'caching' | 'load_balancing'
let selectedStudentId = 'std-4'; // Default to SAMYUKTHA P V
let activeAttendanceStudentId = 'std-4';
let selectedAdminDate = getTodayISTDateString();
let searchQuery = '';
let activeLoginRole = 'student'; // 'student' | 'mentor'

// In-modal editing state for active student
let editingStudentScores = {};

// Simulation Instances
let cachingSimInstance = null;
let lbSimInstance = null;

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
  btnSignInRetryLocation: document.getElementById('btnSignInRetryLocation'),
  textCheckLocationBtn: document.getElementById('textCheckLocationBtn'),
  btnStandaloneSignInSubmit: document.getElementById('btnStandaloneSignInSubmit'),
  textSignInButtonLabel: document.getElementById('textSignInButtonLabel'),
  textSignInGateNotice: document.getElementById('textSignInGateNotice'),
  boxSignInAlert: document.getElementById('boxSignInAlert'),
  textSignInAlert: document.getElementById('textSignInAlert'),
  gridStandaloneQuickAccounts: document.getElementById('gridStandaloneQuickAccounts'),

  // Desktop Header User Session & Actions
  headerUserSessionBadge: document.getElementById('headerUserSessionBadge'),
  hdrUserAvatar: document.getElementById('hdrUserAvatar'),
  hdrUserName: document.getElementById('hdrUserName'),
  hdrUserRole: document.getElementById('hdrUserRole'),
  hdrBtnAction: document.getElementById('hdrBtnAction'),

  // Navigation Tabs
  tabNavLeaderboard: document.getElementById('tabNavLeaderboard'),
  tabNavAttendance: document.getElementById('tabNavAttendance'),
  tabNavAttendanceLabel: document.getElementById('tabNavAttendanceLabel'),
  tabNavAdminAttendance: document.getElementById('tabNavAdminAttendance'),
  tabNavSystemLab: document.getElementById('tabNavSystemLab'),

  // Views
  viewLeaderboard: document.getElementById('viewLeaderboard'),
  viewAttendance: document.getElementById('viewAttendance'),
  viewAdminAttendance: document.getElementById('viewAdminAttendance'),
  viewSystemDesignLab: document.getElementById('viewSystemDesignLab'),

  // Lab Sub-modules
  btnLabModuleCaching: document.getElementById('btnLabModuleCaching'),
  btnLabModuleLb: document.getElementById('btnLabModuleLb'),
  moduleCardCaching: document.getElementById('moduleCardCaching'),
  moduleCardLb: document.getElementById('moduleCardLb'),
  cachingSimMount: document.getElementById('cachingSimMount'),
  lbSimMount: document.getElementById('lbSimMount'),

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
  if (elements.adminAttendanceDatePicker) {
    elements.adminAttendanceDatePicker.value = selectedAdminDate;
  }
  renderAll();
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

  const officialOnly = rankedList.filter(s => !s.is_test_account && s.id !== 'std-dummy');
  const top3 = officialOnly.slice(0, 3);
  const rank1 = top3[0] || { student_name: 'No student', total_points: 0, cumulative_points: 0, percentage: 0, initials: '--', id: '', avatarBg: '#6c5ce7' };
  const rank2 = top3[1] || { student_name: 'No student', total_points: 0, cumulative_points: 0, percentage: 0, initials: '--', id: '', avatarBg: '#5748cd' };
  const rank3 = top3[2] || { student_name: 'No student', total_points: 0, cumulative_points: 0, percentage: 0, initials: '--', id: '', avatarBg: '#4736b2' };

  elements.desktopPodiumRow.innerHTML = `
    <!-- Rank 2: Left Medium Height Podium -->
    <div class="podium-pedestal-col rank-left-2" data-student-id="${rank2.id}" title="Rank #2: ${escapeHtml(rank2.student_name)} (Click to view scores)">
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank2.avatarBg};">
          ${rank2.initials}
        </div>
        <div class="podium-medal-badge" title="Silver Medal">
          ${ICONS.medalSilver}
        </div>
      </div>
      <div class="podium-name-text">${escapeHtml(rank2.student_name)}</div>
      <div class="podium-points-pill" title="Cumulative Score">
        ${ICONS.lightning}
        <span>${rank2.cumulative_points || rank2.total_points} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        Base: ${rank2.base_points || rank2.total_points}/115 (${rank2.percentage}%)
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">2</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank2.percentage}%;"></div>
        </div>
      </div>
    </div>

    <!-- Rank 1: Center Tallest Podium with Floating Vector Crown -->
    <div class="podium-pedestal-col rank-center-1" data-student-id="${rank1.id}" title="Rank #1: ${escapeHtml(rank1.student_name)} (Click to view scores)">
      ${ICONS.crown}
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank1.avatarBg};">
          ${rank1.initials}
        </div>
        <div class="podium-medal-badge" title="Gold Medal">
          ${ICONS.medalGold}
        </div>
      </div>
      <div class="podium-name-text">${escapeHtml(rank1.student_name)}</div>
      <div class="podium-points-pill" style="background: rgba(203, 245, 58, 0.2); border-color: var(--accent-lime);" title="Cumulative Score">
        ${ICONS.lightning}
        <span style="color: var(--accent-lime);">${rank1.cumulative_points || rank1.total_points} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        Base: ${rank1.base_points || rank1.total_points}/115 (${rank1.percentage}%)
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">1</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank1.percentage}%;"></div>
        </div>
      </div>
    </div>

    <!-- Rank 3: Right Shorter Podium -->
    <div class="podium-pedestal-col rank-right-3" data-student-id="${rank3.id}" title="Rank #3: ${escapeHtml(rank3.student_name)} (Click to view scores)">
      <div class="podium-avatar-wrapper">
        <div class="podium-avatar-circle" style="background: ${rank3.avatarBg};">
          ${rank3.initials}
        </div>
        <div class="podium-medal-badge" title="Bronze Medal">
          ${ICONS.medalBronze}
        </div>
      </div>
      <div class="podium-name-text">${escapeHtml(rank3.student_name)}</div>
      <div class="podium-points-pill" title="Cumulative Score">
        ${ICONS.lightning}
        <span>${rank3.cumulative_points || rank3.total_points} pts</span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
        Base: ${rank3.base_points || rank3.total_points}/115 (${rank3.percentage}%)
      </div>
      <div class="podium-3d-block">
        <span class="podium-3d-number">3</span>
        <div class="podium-block-progress">
          <div class="podium-block-fill" style="width: ${rank3.percentage}%;"></div>
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

    if (student.is_test_account || student.id === 'std-dummy') {
      rankDisplayHtml = `<span class="row-rank-number" style="font-size: 0.65rem; color: #fbbf24; background: rgba(245, 158, 11, 0.15); padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 800;">TEST</span>`;
    } else if (student.rank === 1) {
      rankDisplayHtml = `<div class="row-medal-icon gold" title="Rank 1: Gold">${ICONS.medalGold}</div>`;
      ringClass = 'gold-ring';
    } else if (student.rank === 2) {
      rankDisplayHtml = `<div class="row-medal-icon silver" title="Rank 2: Silver">${ICONS.medalSilver}</div>`;
      ringClass = 'silver-ring';
    } else if (student.rank === 3) {
      rankDisplayHtml = `<div class="row-medal-icon bronze" title="Rank 3: Bronze">${ICONS.medalBronze}</div>`;
      ringClass = 'bronze-ring';
    }

    // Attendance Badges
    const att = student.attendance_summary || attendanceService.getStudentAttendanceSummary(student.id);
    let badgesHtml = '';
    if (student.is_test_account || student.id === 'std-dummy') {
      badgesHtml += `<span style="display: inline-flex; align-items: center; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px;">Dev Test Account</span>`;
    }
    if (att.earlyBirdWinsCount > 0) {
      badgesHtml += `<span style="display: inline-flex; align-items: center; gap: 0.2rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px;" title="${att.earlyBirdWinsCount}x Early Bird Wins (+${att.earlyBirdPoints} pts)">${att.earlyBirdWinsCount}x Early Bird</span>`;
    }
    if (att.nightOwlWinsCount > 0) {
      badgesHtml += `<span style="display: inline-flex; align-items: center; gap: 0.2rem; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); color: #a78bfa; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 12px;" title="${att.nightOwlWinsCount}x Night Owl Wins (+${att.nightOwlPoints} pts)">${att.nightOwlWinsCount}x Night Owl</span>`;
    }

    const cumScore = student.cumulative_points || student.total_points;
    const baseScore = student.base_points || student.total_points;

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
          <span class="row-student-meta">ID: ${student.id} • Base Period: ${baseScore}/115 (${student.percentage}%)</span>
        </div>

        <!-- Col 4: Score Progress Bar -->
        <div class="row-progress-col">
          <div class="row-progress-label">
            <span>Cumulative Pilot Score</span>
            <span style="font-weight: 800; color: var(--accent-lime);">${cumScore} pts</span>
          </div>
          <div class="desktop-bar-track">
            <div class="desktop-bar-fill" style="width: ${Math.min(100, Math.round((cumScore / 115) * 100))}%;"></div>
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

  const studentChips = STUDENT_ACCOUNTS.map(acc => `
    <button type="button" class="quick-account-chip ${acc.is_test_account ? 'test-account' : ''}" data-role="student" data-name="${escapeHtml(acc.student_name)}" data-identifier="${acc.email}" data-password="${acc.is_test_account ? '12345678' : (acc.defaultPassword || '')}" data-test="${acc.is_test_account ? 'true' : 'false'}" title="${acc.is_test_account ? 'Dummy Student (Test Account): Subject to same real GPS verification' : `Student: ${escapeHtml(acc.student_name)} (${acc.student_id})`}">
      <span class="quick-chip-dot" style="${acc.is_test_account ? 'background: #f59e0b;' : ''}"></span>
      <span style="${acc.is_test_account ? 'color: #fbbf24; font-weight: 800;' : ''}">${escapeHtml(acc.student_name)}${acc.is_test_account ? ' [TEST]' : ''}</span>
    </button>
  `).join('');

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
      const isTest = chip.getAttribute('data-test') === 'true';

      setLoginRole(role);

      if (elements.inputSignInFullName) elements.inputSignInFullName.value = name;
      if (elements.inputSignInEmail) elements.inputSignInEmail.value = iden;
      if (elements.inputSignInPassword) elements.inputSignInPassword.value = pass;

      // Always reset location verification when changing accounts
      attendanceService.resetVerification('Switched student account. Fresh physical GPS reading required.');
      updateLocationStateUI(attendanceService.locationVerificationState, attendanceService.lastVerificationResult);

      if (role === 'student') {
        if (isTest) {
          showStandaloneAuthFeedback(`Selected Dummy Student (Test Account: dummy@gmail.com). Subject to strict real GPS verification (no bypass). Click "Check My Location" to proceed.`, 'idle');
        } else {
          showStandaloneAuthFeedback(`Selected ${name} (${iden}). Mandatory GPS verification required: click "Check My Location" to proceed.`, 'idle');
        }
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
    if (elements.inputSignInFullName) elements.inputSignInFullName.required = true;
    if (elements.labelSignInEmail) elements.labelSignInEmail.textContent = 'Student Email Address';
    if (elements.inputSignInEmail) elements.inputSignInEmail.placeholder = 'e.g. samyuktha@pilotstudy.snsct.edu.in';
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
    if (elements.inputSignInEmail) elements.inputSignInEmail.placeholder = 'e.g. akaakashsvg63@gmail.com';
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
    if (elements.tabNavAdminAttendance) elements.tabNavAdminAttendance.style.display = 'flex';
    if (elements.tabNavAttendanceLabel) elements.tabNavAttendanceLabel.textContent = 'Attendance Overview';
    if (elements.cardStudentCheckoutAction) elements.cardStudentCheckoutAction.style.display = 'none';
  } else {
    if (elements.tabNavAdminAttendance) elements.tabNavAdminAttendance.style.display = 'none';
    if (elements.tabNavAttendanceLabel) elements.tabNavAttendanceLabel.textContent = 'My Attendance';
    if (elements.cardStudentCheckoutAction) elements.cardStudentCheckoutAction.style.display = 'flex';
    if (currentPrimaryTab === 'admin_attendance') {
      setPrimaryTab('leaderboard');
    }
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

  if (activeLoginRole === 'student' && !fullName) {
    showStandaloneAuthFeedback('Full Name is required to confirm student identity.', 'error');
    return;
  }

  if (!identifier || !password) {
    showStandaloneAuthFeedback('Please provide both email and password.', 'error');
    return;
  }

  const isGpsVerified = attendanceService.locationVerificationState === LOCATION_STATES.VERIFIED;
  if (activeLoginRole === 'student' && !isGpsVerified) {
    showStandaloneAuthFeedback('Mandatory location verification required. Please click "Check My Location" first.', 'error');
    return;
  }

  if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = true;
  showStandaloneAuthFeedback('Authenticating credentials...', 'loading');

  const result = await authService.signIn({
    fullName,
    identifier,
    password,
    role: activeLoginRole,
    isGpsVerified
  });

  if (!result.success) {
    if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = false;
    showStandaloneAuthFeedback(result.message, 'error');
    return;
  }

  // Student First-Login Check-In Flow
  if (activeLoginRole === 'student') {
    showStandaloneAuthFeedback('Credentials verified! Recording authoritative check-in at SNS College of Technology...', 'loading');
    const checkInResult = await attendanceService.performCheckIn(result.user.student_id);

    if (checkInResult.earlyBirdAwarded) {
      showStandaloneAuthFeedback(`Congratulations! ${result.user.student_name} earned the Early Bird Award (+10 pts) for being first to check in today!`, 'success');
    } else {
      showStandaloneAuthFeedback(`Check-in verified! Logged in at ${formatISTTime(checkInResult.record?.login_at)}. Welcome to Pilot Study.`, 'success');
    }
  } else {
    showStandaloneAuthFeedback(`Welcome ${result.user.student_name} (Mentor). Access granted.`, 'success');
  }

  if (elements.btnStandaloneSignInSubmit) elements.btnStandaloneSignInSubmit.disabled = false;

  // Transition to Authenticated View
  syncAuthStateView();
  renderAll();

  // If student, navigate to attendance view to show their attendance status & Early Bird results
  if (activeLoginRole === 'student') {
    setPrimaryTab('attendance');
  }
}

/**
 * Handle Student Check Out & Logout Action
 * Requires fresh GPS verification at SNS College of Technology,
 * records verified checkout, evaluates Late Night Owl (+10 pts) for checkouts strictly after 6 PM,
 * and signs student out.
 */
async function handleStudentCheckOutAndLogout() {
  const authUser = authService.getCurrentStudent();
  if (!authUser) return;

  // Mentors sign out directly
  if (authService.isMentorOrAdmin()) {
    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    syncAuthStateView();
    showStandaloneAuthFeedback('Mentor signed out securely.', 'idle');
    return;
  }

  // If student already completed checkout today, proceed directly to secure sign out
  const summary = attendanceService.getStudentAttendanceSummary(authUser.student_id);
  const alreadyCheckedOut = !!summary?.todayRecord?.logout_at;
  if (alreadyCheckedOut) {
    await authService.signOut();
    attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
    syncAuthStateView();
    showStandaloneAuthFeedback('Signed out securely.', 'idle');
    return;
  }

  // Students must pass fresh GPS verification before checkout
  showCheckoutFeedback('Acquiring fresh browser GPS location at SNS College of Technology for checkout...', 'loading');
  if (elements.btnStudentDashboardCheckout) elements.btnStudentDashboardCheckout.disabled = true;

  const locResult = await attendanceService.verifyCurrentLocation();
  if (!locResult.success) {
    showCheckoutFeedback(locResult.details?.message || locResult.message || 'Checkout rejected: GPS verification failed. You must be physically on campus.', 'error');
    if (elements.btnStudentDashboardCheckout) elements.btnStudentDashboardCheckout.disabled = false;
    return;
  }

  showCheckoutFeedback('Location verified! Recording verified checkout in Supabase...', 'loading');
  const checkOutResult = await attendanceService.performCheckOut(authUser.student_id);

  if (!checkOutResult.success) {
    if (checkOutResult.message && checkOutResult.message.includes('already completed check-out')) {
      await authService.signOut();
      attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
      syncAuthStateView();
      showStandaloneAuthFeedback('Signed out securely.', 'idle');
      return;
    }
    showCheckoutFeedback(checkOutResult.message, 'error');
    if (elements.btnStudentDashboardCheckout) elements.btnStudentDashboardCheckout.disabled = false;
    return;
  }

  // Check Night Owl Award status
  let notice = `Checked out at ${formatISTTime(checkOutResult.record?.logout_at)}.`;
  if (checkOutResult.nightOwlAwarded) {
    notice += ` You are currently the latest checkout after 6 PM and qualify for the Late Night Owl award (+10 pts)!`;
  }

  // Complete logout
  await authService.signOut();
  attendanceService.setLocationState(LOCATION_STATES.WAITING, {});
  syncAuthStateView();
  showStandaloneAuthFeedback(`${notice} Signed out securely.`, 'success');
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

  // 5. Today's Daily Awards Showcase
  const todayEarly = summary.todayEarlyAward;
  const todayNight = summary.todayNightAward;

  if (elements.todayEarlyBirdWinner) {
    if (todayEarly && todayEarly.status === 'awarded' && todayEarly.winning_student_id) {
      const winner = pilotstudyDb.getStudentById(todayEarly.winning_student_id);
      elements.todayEarlyBirdWinner.textContent = `${winner?.student_name || todayEarly.winning_student_id} (Winner)`;
      if (elements.todayEarlyBirdTime) elements.todayEarlyBirdTime.textContent = `Check-in: ${formatISTTime(todayEarly.winning_timestamp)}`;
    } else {
      elements.todayEarlyBirdWinner.textContent = 'Evaluating earliest check-in...';
      if (elements.todayEarlyBirdTime) elements.todayEarlyBirdTime.textContent = 'Earliest verified check-in of the day';
    }
  }

  if (elements.todayNightOwlWinner) {
    if (todayNight && todayNight.status === 'awarded' && todayNight.winning_student_id) {
      const winner = pilotstudyDb.getStudentById(todayNight.winning_student_id);
      elements.todayNightOwlWinner.textContent = `${winner?.student_name || todayNight.winning_student_id} (Winner)`;
      if (elements.todayNightOwlTime) elements.todayNightOwlTime.textContent = `Checkout: ${formatISTTime(todayNight.winning_timestamp)}`;
    } else {
      const now = new Date();
      const hour = parseInt(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }), 10);
      elements.todayNightOwlWinner.textContent = hour >= 18 ? 'Evaluating latest checkout...' : 'Window opens strictly after 6:00 PM IST';
      if (elements.todayNightOwlTime) elements.todayNightOwlTime.textContent = 'Latest verified checkout strictly after 18:00 IST';
    }
  }

  // 6. Student Score Overview (Private to Authenticated Student)
  if (elements.attStudentCumScore) elements.attStudentCumScore.textContent = student ? (student.cumulative_points || student.total_points) : '--';
  if (elements.attStudentBaseScore) elements.attStudentBaseScore.textContent = student ? `${student.base_points || student.total_points} / ${MAX_SCORE}` : '--';
  if (elements.attStudentBasePct) elements.attStudentBasePct.textContent = student ? `${student.percentage}% Base Period` : '--';
  if (elements.attStudentAttTotalPts) elements.attStudentAttTotalPts.textContent = `+${summary.totalAttendancePoints} pts`;
  if (elements.attStudentAwardsSummary) {
    elements.attStudentAwardsSummary.textContent = `${summary.earlyBirdWinsCount} Early Bird • ${summary.nightOwlWinsCount} Night Owl`;
  }

  // 7. Historical Daily Awards Table
  if (elements.historicalAwardsTableBody) {
    elements.historicalAwardsTableBody.innerHTML = attendanceService.dailyAwards.map(a => {
      const winner = a.winning_student_id ? pilotstudyDb.getStudentById(a.winning_student_id) : null;
      const winnerName = winner ? winner.student_name : (a.winning_student_id || 'No Winner');
      const catName = a.category === 'early_bird' ? 'Early Bird' : 'Late Night Owl';
      const catClass = a.category === 'early_bird' ? 'early' : 'night';

      return `
        <tr>
          <td><strong>${a.attendance_date}</strong></td>
          <td><span class="award-badge-pill ${catClass}">${catName}</span></td>
          <td>${escapeHtml(winnerName)}</td>
          <td><strong style="color: var(--gold);">${a.awarded_points > 0 ? `+${a.awarded_points} pts` : '0 pts'}</strong></td>
          <td>${formatISTTime(a.winning_timestamp)}</td>
          <td style="color: var(--text-secondary); font-size: 0.78rem;">${escapeHtml(a.scoring_reason || '')}</td>
        </tr>
      `;
    }).join('');
  }
}

/**
 * Render Administrator Attendance Dashboard View
 */
function renderAdminAttendanceDashboard() {
  if (!elements.viewAdminAttendance || elements.viewAdminAttendance.style.display === 'none') return;

  const date = selectedAdminDate || getTodayISTDateString();
  const allStudents = pilotstudyDb.getStudents();
  const dayRecords = attendanceService.getAttendanceForDate(date);
  const settings = attendanceService.campusSettings;

  const earlyWinnerId = attendanceService.dailyAwards.find(
    a => a.attendance_date === date && a.category === 'early_bird' && a.status === 'awarded'
  )?.winning_student_id;

  const nightWinnerId = attendanceService.dailyAwards.find(
    a => a.attendance_date === date && a.category === 'night_owl' && a.status === 'awarded'
  )?.winning_student_id;

  // Metrics
  const checkedInCount = dayRecords.filter(r => r.login_at).length;
  const completedCount = dayRecords.filter(r => r.logout_at).length;

  if (elements.adminMetricCheckedIn) elements.adminMetricCheckedIn.textContent = `${checkedInCount} / 20`;
  if (elements.adminMetricCompleted) elements.adminMetricCompleted.textContent = `${completedCount} / 20`;

  // Render Table Rows for all 20 students
  if (elements.adminAttendanceTableBody) {
    elements.adminAttendanceTableBody.innerHTML = allStudents.map(student => {
      const rec = dayRecords.find(r => r.student_id === student.id);
      const isEarly = student.id === earlyWinnerId;
      const isNight = student.id === nightWinnerId;

      let awardBadges = '';
      if (isEarly) awardBadges += `<span class="award-badge-pill early" style="margin-right: 0.35rem;">Early Bird (+10)</span>`;
      if (isNight) awardBadges += `<span class="award-badge-pill night">Night Owl (+10)</span>`;
      if (!awardBadges) awardBadges = '<span style="color: var(--text-muted);">None</span>';

      const poly = settings.boundary_polygon || DEFAULT_CAMPUS_POLYGON;
      const inside = rec ? isPointInPolygon([rec.login_longitude || 0, rec.login_latitude || 0], poly) : false;
      const boundaryDist = rec ? (inside ? 0 : calculateMinDistanceToPolygon(rec.login_latitude || 0, rec.login_longitude || 0, poly)) : null;
      const distDisplay = boundaryDist !== null ? (inside ? '<span style="color: var(--accent-lime); font-weight: 600;">Inside Campus</span>' : `<span style="color: #f87171;">${Math.round(boundaryDist)}m outside</span>`) : '--';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: ${student.avatarBg}; color: #fff; font-size: 0.72rem; font-weight: 800; display: flex; align-items: center; justify-content: center;">
                ${getInitials(student.student_name)}
              </div>
              <div>
                <strong>${escapeHtml(student.student_name)}</strong>
                <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">${student.id}</span>
              </div>
            </div>
          </td>
          <td>${rec?.login_at ? formatISTTime(rec.login_at) : '<span style="color: var(--text-muted);">Not checked in</span>'}</td>
          <td>${rec?.login_location_verified ? '<span class="geofence-verify-chip verified">Verified</span>' : '<span style="color: var(--text-muted);">--</span>'}</td>
          <td>${rec?.logout_at ? formatISTTime(rec.logout_at) : '<span style="color: var(--text-muted);">Pending</span>'}</td>
          <td>${rec?.logout_location_verified ? '<span class="geofence-verify-chip verified">Verified</span>' : '<span style="color: var(--text-muted);">--</span>'}</td>
          <td>${distDisplay}</td>
          <td>${awardBadges}</td>
          <td><span style="text-transform: capitalize; font-weight: 600; color: ${rec?.status === 'completed' ? '#34d399' : rec?.status === 'checked_in' ? 'var(--accent-lime)' : 'var(--text-muted)'};">${rec?.status || 'absent'}</span></td>
        </tr>
      `;
    }).join('');
  }

  // Populate Admin Geofence Settings Inputs
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

/**
 * Switch Primary View Tabs
 */
function setPrimaryTab(tab) {
  currentPrimaryTab = tab;

  // Remove active from all tabs
  elements.tabNavLeaderboard.classList.remove('active');
  elements.tabNavAttendance.classList.remove('active');
  elements.tabNavAdminAttendance.classList.remove('active');
  elements.tabNavSystemLab.classList.remove('active');

  // Hide all views
  elements.viewLeaderboard.style.display = 'none';
  elements.viewAttendance.style.display = 'none';
  elements.viewAdminAttendance.style.display = 'none';
  elements.viewSystemDesignLab.style.display = 'none';

  if (elements.pointsModeControlItem) {
    elements.pointsModeControlItem.style.display = tab === 'leaderboard' ? 'flex' : 'none';
  }

  if (tab === 'leaderboard') {
    elements.tabNavLeaderboard.classList.add('active');
    elements.viewLeaderboard.style.display = 'flex';
  } else if (tab === 'attendance') {
    elements.tabNavAttendance.classList.add('active');
    elements.viewAttendance.style.display = 'flex';
    renderAttendanceDashboard();
  } else if (tab === 'admin_attendance') {
    elements.tabNavAdminAttendance.classList.add('active');
    elements.viewAdminAttendance.style.display = 'flex';
    renderAdminAttendanceDashboard();
  } else if (tab === 'system_lab') {
    elements.tabNavSystemLab.classList.add('active');
    elements.viewSystemDesignLab.style.display = 'flex';
    initSystemDesignLab();
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
    elements.saveStatusText.textContent = 'All changes saved to Supabase';
    if (elements.btnSaveScoresToSupabase) {
      elements.btnSaveScoresToSupabase.style.display = 'inline-flex';
      elements.btnSaveScoresToSupabase.disabled = false;
      elements.btnSaveScoresToSupabase.textContent = 'Save to Supabase';
    }
  } else {
    elements.modalSaveStatusMsg.className = 'save-status-msg';
    elements.saveStatusText.textContent = 'Read-Only View: Only authorized mentors can adjust evaluation marks.';
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

    return `
      <div class="category-editor-row" data-cat-id="${cat.id}">
        <div class="cat-label-box">
          <span class="cat-label-title">${cat.name}</span>
          <span class="cat-label-max">Maximum: ${cat.maxPoints} pts</span>
        </div>

        <div class="cat-mini-bar-wrap" title="${val} of ${cat.maxPoints} pts (${pct}%)">
          <div class="cat-mini-bar-fill" id="catBar-${cat.id}" style="width: ${pct}%;"></div>
        </div>

        ${isMentor ? `
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
          <div style="font-weight: 800; color: var(--accent-lime); font-size: 0.95rem; min-width: 70px; text-align: right;">
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
 * System Design Lab Initialization
 */
function initSystemDesignLab() {
  if (!cachingSimInstance) cachingSimInstance = new CachingSimulation('cachingSimMount');
  if (!lbSimInstance) lbSimInstance = new LoadBalancingSimulation('lbSimMount');
}

function setLabModule(module) {
  currentLabModule = module;
  if (module === 'caching') {
    elements.btnLabModuleCaching.classList.add('active');
    elements.btnLabModuleLb.classList.remove('active');
    elements.moduleCardCaching.style.display = 'flex';
    elements.moduleCardLb.style.display = 'none';
  } else {
    elements.btnLabModuleCaching.classList.remove('active');
    elements.btnLabModuleLb.classList.add('active');
    elements.moduleCardCaching.style.display = 'none';
    elements.moduleCardLb.style.display = 'flex';
  }
}

/**
 * Event Listeners
 */
function setupEventListeners() {
  // Navigation Tabs
  elements.tabNavLeaderboard.addEventListener('click', () => setPrimaryTab('leaderboard'));
  elements.tabNavAttendance.addEventListener('click', () => setPrimaryTab('attendance'));
  elements.tabNavAdminAttendance.addEventListener('click', () => setPrimaryTab('admin_attendance'));
  elements.tabNavSystemLab.addEventListener('click', () => setPrimaryTab('system_lab'));

  // Lab Sub-modules
  elements.btnLabModuleCaching.addEventListener('click', () => setLabModule('caching'));
  elements.btnLabModuleLb.addEventListener('click', () => setLabModule('load_balancing'));

  // Themes
  elements.themeDarkBtn.addEventListener('click', () => setTheme('dark'));
  elements.themeLightBtn.addEventListener('click', () => setTheme('light'));

  // Points Mode
  elements.modeZeroBtn.addEventListener('click', () => setPointsMode('zero'));
  elements.modeDemoBtn.addEventListener('click', () => setPointsMode('demo'));

  // Search (debounced to prevent UI and render thrashing)
  let searchDebounceTimer = null;
  elements.desktopSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = e.target.value;
      renderDesktopRows(getRankedData());
    }, 120);
  });

  // Modal Actions
  elements.btnSaveScoresToSupabase.addEventListener('click', () => handleSaveScoresToSupabase({ isAutoSave: false }));
  elements.closeModalBtn.addEventListener('click', closeModal);
  elements.modalDismissBtn.addEventListener('click', closeModal);
  elements.studentDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.studentDetailModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
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

  // Admin Events
  if (elements.adminAttendanceDatePicker) {
    elements.adminAttendanceDatePicker.addEventListener('change', (e) => {
      selectedAdminDate = e.target.value;
      renderAdminAttendanceDashboard();
    });
  }

  if (elements.btnAdminRecalculate) {
    elements.btnAdminRecalculate.addEventListener('click', () => {
      const date = selectedAdminDate || getTodayISTDateString();
      attendanceService.recalculateDailyAwards(date);
      renderAll();
    });
  }

  if (elements.btnAdminExportCsv) {
    elements.btnAdminExportCsv.addEventListener('click', () => {
      const date = selectedAdminDate || getTodayISTDateString();
      const lookup = {};
      pilotstudyDb.getStudents().forEach(s => lookup[s.id] = s);
      const csvContent = attendanceService.exportAttendanceCSV(date, lookup);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `SNSCT_Attendance_Report_${date}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
