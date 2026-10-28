/**
 * Caching Simulation Module
 * Visualizes Cache Hit, Cache Miss, Database Queries, Latency, and Invalidation
 * Strictly NO emojis • Pure vector SVGs
 */

export class CachingSimulation {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = {
      isCached: false,
      cachedData: null,
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      lastLatencyMs: 0,
      lastStatus: 'idle', // 'idle' | 'hit' | 'miss' | 'cleared' | 'invalidated'
      isAnimating: false
    };

    this.render();
  }

  render() {
    if (!this.container) return;

    const hitRatio = this.state.totalRequests > 0 
      ? Math.round((this.state.cacheHits / this.state.totalRequests) * 100) 
      : 0;

    this.container.innerHTML = `
      <!-- Toolbar Controls -->
      <div class="sim-toolbar">
        <div class="sim-btn-group">
          <button class="sim-btn sim-btn-primary" id="btnSimulateReq">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Simulate Request</span>
          </button>

          <button class="sim-btn sim-btn-warning" id="btnClearCache">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            <span>Clear Cache</span>
          </button>

          <button class="sim-btn sim-btn-secondary" id="btnInvalidateCache" title="Simulate cache invalidation when a student's score updates">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Invalidate Cache (Score Update)</span>
          </button>

          <button class="sim-btn sim-btn-secondary" id="btnResetSim">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>Reset Stats</span>
          </button>
        </div>

        <!-- Live Status Pill -->
        <div id="simStatusBanner" class="sim-status-banner ${this.getStatusBannerClass()}">
          <span>Status:</span>
          <span class="status-tag ${this.getStatusTagClass()}" id="statusTagText">${this.getStatusLabel()}</span>
          <span style="font-size: 0.78rem; opacity: 0.85;">${this.state.lastLatencyMs ? `~${this.state.lastLatencyMs}ms (Simulated)` : 'Awaiting request'}</span>
        </div>
      </div>

      <!-- Interactive Architecture Topology Diagram -->
      <div class="sim-diagram-canvas" id="cachingCanvas">
        <!-- SVG Connection Lines -->
        <svg class="sim-connections-svg">
          <!-- Line: User to Leaderboard UI -->
          <line x1="16%" y1="50%" x2="38%" y2="50%" class="connection-path ${this.state.isAnimating ? 'active-path' : ''}" />
          <!-- Line: Leaderboard UI to Cache -->
          <line x1="48%" y1="50%" x2="65%" y2="35%" class="connection-path ${this.state.lastStatus === 'hit' ? 'hit-path' : ''}" />
          <!-- Line: Leaderboard UI to Database -->
          <line x1="48%" y1="50%" x2="82%" y2="65%" class="connection-path ${this.state.lastStatus === 'miss' ? 'miss-path' : ''}" />
        </svg>

        <!-- Node 1: User / Student -->
        <div class="topology-node" id="nodeUser">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div class="node-title">Student / User</div>
          <div class="node-subtitle">Web Browser Client</div>
          <div class="node-badge-tag">GET /leaderboard</div>
        </div>

        <!-- Node 2: Leaderboard UI (App Server) -->
        <div class="topology-node" id="nodeApp">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
              <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
              <line x1="6" x2="6.01" y1="6" y2="6"/>
              <line x1="6" x2="6.01" y1="18" y2="18"/>
            </svg>
          </div>
          <div class="node-title">Application Server</div>
          <div class="node-subtitle">Leaderboard Service</div>
          <div class="node-badge-tag">Checks Cache First</div>
        </div>

        <!-- Node 3: Cache (Redis-like) -->
        <div class="topology-node ${this.state.isCached ? 'hit-node' : ''}" id="nodeCache">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div class="node-title">In-Memory Cache</div>
          <div class="node-subtitle">Redis / Fast Store</div>
          <div class="node-badge-tag" id="cacheContentTag">
            ${this.state.isCached ? 'Key: leaderboard:top20' : 'Cache: EMPTY'}
          </div>
        </div>

        <!-- Node 4: Database -->
        <div class="topology-node" id="nodeDatabase">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
              <path d="M3 12A9 3 0 0 0 21 12"/>
            </svg>
          </div>
          <div class="node-title">Primary Database</div>
          <div class="node-subtitle">PostgreSQL (pilotstudy)</div>
          <div class="node-badge-tag">Disk Storage</div>
        </div>
      </div>

      <!-- Live Counters & Performance Metrics Grid -->
      <div class="sim-metrics-grid">
        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Total Requests</span>
          </div>
          <div class="metric-val purple">${this.state.totalRequests}</div>
          <div class="metric-sub">Leaderboard page views</div>
        </div>

        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Cache Hits</span>
          </div>
          <div class="metric-val emerald">${this.state.cacheHits}</div>
          <div class="metric-sub">Served from memory (~4ms)</div>
        </div>

        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Cache Misses</span>
          </div>
          <div class="metric-val amber">${this.state.cacheMisses}</div>
          <div class="metric-sub">Required database query</div>
        </div>

        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Database Queries</span>
          </div>
          <div class="metric-val">${this.state.dbQueries}</div>
          <div class="metric-sub">Heavy disk read ops</div>
        </div>

        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Cache Hit Ratio</span>
          </div>
          <div class="metric-val emerald">${hitRatio}%</div>
          <div class="ratio-progress-wrap">
            <div class="ratio-progress-fill" style="width: ${hitRatio}%;"></div>
          </div>
        </div>
      </div>

      <!-- Beginner-Friendly Explanation Callout -->
      <div class="sim-explainer-callout">
        <div class="explainer-icon-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
        </div>
        <div class="explainer-content">
          <div class="explainer-title">How Caching Accelerates the Leaderboard</div>
          <p class="explainer-text">
            <strong>“Instead of asking the database for the same leaderboard data every time, the application keeps a temporary copy in high-speed memory so it can respond faster.”</strong>
          </p>
          <p class="explainer-text" style="font-size: 0.78rem; opacity: 0.85;">
            • <strong>Cache Hit:</strong> Leaderboard data is already saved in memory. Result returns immediately in ~4ms without stressing the database.<br>
            • <strong>Cache Miss:</strong> Data is not in memory. The server queries PostgreSQL (~140ms), sends the data to the student, and writes a copy to the cache.<br>
            • <strong>Cache Invalidation:</strong> When a student earns points, the cache key is purged so students never see stale ranks.
          </p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const btnSim = document.getElementById('btnSimulateReq');
    const btnClear = document.getElementById('btnClearCache');
    const btnInvalidate = document.getElementById('btnInvalidateCache');
    const btnReset = document.getElementById('btnResetSim');

    if (btnSim) btnSim.addEventListener('click', () => this.simulateRequest());
    if (btnClear) btnClear.addEventListener('click', () => this.clearCache());
    if (btnInvalidate) btnInvalidate.addEventListener('click', () => this.invalidateCache());
    if (btnReset) btnReset.addEventListener('click', () => this.resetSimulation());
  }

  simulateRequest() {
    if (this.state.isAnimating) return;
    this.state.isAnimating = true;
    this.state.totalRequests++;

    const nodeUser = document.getElementById('nodeUser');
    const nodeApp = document.getElementById('nodeApp');
    const nodeCache = document.getElementById('nodeCache');
    const nodeDb = document.getElementById('nodeDatabase');

    // Reset styles
    [nodeUser, nodeApp, nodeCache, nodeDb].forEach(n => {
      if (n) n.className = 'topology-node';
    });

    if (nodeUser) nodeUser.classList.add('active-node');

    setTimeout(() => {
      if (nodeApp) nodeApp.classList.add('active-node');

      // Check Cache
      if (this.state.isCached) {
        // CACHE HIT
        this.state.cacheHits++;
        this.state.lastLatencyMs = Math.floor(Math.random() * 4) + 3; // 3-6ms
        this.state.lastStatus = 'hit';

        setTimeout(() => {
          if (nodeCache) nodeCache.classList.add('hit-node');
          this.state.isAnimating = false;
          this.render();
        }, 350);
      } else {
        // CACHE MISS -> Queries Database -> Populates Cache
        this.state.cacheMisses++;
        this.state.dbQueries++;
        this.state.lastLatencyMs = Math.floor(Math.random() * 40) + 120; // 120-160ms
        this.state.lastStatus = 'miss';

        setTimeout(() => {
          if (nodeCache) nodeCache.classList.add('miss-node');
          if (nodeDb) nodeDb.classList.add('active-node');

          // Populate cache for subsequent requests
          this.state.isCached = true;
          this.state.cachedData = { timestamp: Date.now() };

          setTimeout(() => {
            this.state.isAnimating = false;
            this.render();
          }, 450);
        }, 350);
      }
    }, 250);
  }

  clearCache() {
    this.state.isCached = false;
    this.state.cachedData = null;
    this.state.lastStatus = 'cleared';
    this.state.lastLatencyMs = 0;
    this.render();
  }

  invalidateCache() {
    this.state.isCached = false;
    this.state.cachedData = null;
    this.state.lastStatus = 'invalidated';
    this.state.lastLatencyMs = 0;
    this.render();
  }

  resetSimulation() {
    this.state = {
      isCached: false,
      cachedData: null,
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      lastLatencyMs: 0,
      lastStatus: 'idle',
      isAnimating: false
    };
    this.render();
  }

  getStatusBannerClass() {
    if (this.state.lastStatus === 'hit') return 'hit';
    if (this.state.lastStatus === 'miss') return 'miss';
    if (this.state.lastStatus === 'invalidated') return 'invalidated';
    return '';
  }

  getStatusTagClass() {
    if (this.state.lastStatus === 'hit') return 'hit';
    if (this.state.lastStatus === 'miss') return 'miss';
    return 'idle';
  }

  getStatusLabel() {
    if (this.state.lastStatus === 'hit') return 'CACHE HIT';
    if (this.state.lastStatus === 'miss') return 'CACHE MISS';
    if (this.state.lastStatus === 'invalidated') return 'CACHE PURGED (Points Updated)';
    if (this.state.lastStatus === 'cleared') return 'CACHE CLEARED';
    return 'READY';
  }
}
