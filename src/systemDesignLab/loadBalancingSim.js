/**
 * Load Balancing Simulation Module
 * Visualizes Round Robin vs Least Connections, Multi-server Distribution, Failover & Recovery
 * Strictly NO emojis • Pure vector SVGs
 */

export class LoadBalancingSimulation {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = {
      strategy: 'round_robin', // 'round_robin' | 'least_conn'
      rrIndex: 0,
      totalRequests: 0,
      activeRequests: 0,
      failedRequests: 0,
      stressInterval: null,
      servers: [
        { id: 1, name: 'App Server 1', healthy: true, handled: 0, active: 0, ip: '10.0.1.11' },
        { id: 2, name: 'App Server 2', healthy: true, handled: 0, active: 0, ip: '10.0.1.12' },
        { id: 3, name: 'App Server 3', healthy: true, handled: 0, active: 0, ip: '10.0.1.13' }
      ]
    };

    this.render();
  }

  render() {
    if (!this.container) return;

    const maxHandled = Math.max(1, ...this.state.servers.map(s => s.handled));

    this.container.innerHTML = `
      <!-- Toolbar Controls -->
      <div class="sim-toolbar">
        <div class="sim-btn-group">
          <button class="sim-btn sim-btn-primary" id="btnSendSingleReq">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Send Request</span>
          </button>

          <button class="sim-btn sim-btn-primary" id="btnSendBatchReq">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Send Burst (5x)</span>
          </button>

          <button class="sim-btn ${this.state.stressInterval ? 'sim-btn-warning' : 'sim-btn-secondary'}" id="btnToggleStress">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <span>${this.state.stressInterval ? 'Stop Traffic' : 'Simulate Heavy Traffic'}</span>
          </button>

          <button class="sim-btn ${this.state.servers[1].healthy ? 'sim-btn-danger' : 'sim-btn-secondary'}" id="btnToggleServerFail">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
              <line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            <span>${this.state.servers[1].healthy ? 'Fail Server 2' : 'Restore Server 2'}</span>
          </button>

          <button class="sim-btn sim-btn-secondary" id="btnResetLb">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>Reset Stats</span>
          </button>
        </div>

        <!-- Algorithm Switcher -->
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Algorithm:</span>
          <div class="segmented-pill-group">
            <button class="pill-option-btn ${this.state.strategy === 'round_robin' ? 'active' : ''}" id="btnStrategyRR">
              <span>Round Robin</span>
            </button>
            <button class="pill-option-btn ${this.state.strategy === 'least_conn' ? 'active' : ''}" id="btnStrategyLC">
              <span>Least Connections</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Interactive Architecture Topology Diagram -->
      <div class="sim-diagram-canvas" id="lbCanvas">
        <!-- SVG Connection Lines -->
        <svg class="sim-connections-svg">
          <!-- User to Load Balancer -->
          <line x1="15%" y1="50%" x2="33%" y2="50%" class="connection-path active-path" />
          <!-- Load Balancer to Server 1 -->
          <line x1="43%" y1="46%" x2="62%" y2="25%" class="connection-path ${this.state.servers[0].healthy ? '' : 'connection-down'}" />
          <!-- Load Balancer to Server 2 -->
          <line x1="43%" y1="50%" x2="62%" y2="50%" class="connection-path ${this.state.servers[1].healthy ? '' : 'connection-down'}" />
          <!-- Load Balancer to Server 3 -->
          <line x1="43%" y1="54%" x2="62%" y2="75%" class="connection-path ${this.state.servers[2].healthy ? '' : 'connection-down'}" />
          <!-- Servers to Shared Backend -->
          <line x1="75%" y1="50%" x2="88%" y2="50%" class="connection-path" />
        </svg>

        <!-- Node 1: Concurrent Students -->
        <div class="topology-node" id="lbNodeClients">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="node-title">Concurrent Users</div>
          <div class="node-subtitle">Students Requesting Ranks</div>
          <div class="node-badge-tag">${this.state.activeRequests} active in-flight</div>
        </div>

        <!-- Node 2: Load Balancer (Nginx / HAProxy) -->
        <div class="topology-node active-node" id="lbNodeBalancer">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
          </div>
          <div class="node-title">Load Balancer</div>
          <div class="node-subtitle">${this.state.strategy === 'round_robin' ? 'Round Robin Router' : 'Least Connections Router'}</div>
          <div class="node-badge-tag" style="color: var(--accent-purple-light);">Health Checks: ACTIVE</div>
        </div>

        <!-- Node 3: 3x Worker Application Servers Stack -->
        <div class="lb-servers-stack" id="lbServersStack">
          ${this.state.servers.map(srv => `
            <div class="lb-server-node ${srv.healthy ? '' : 'server-down'}" id="srvNode-${srv.id}">
              <div class="server-info-col">
                <span class="server-name">${srv.name}</span>
                <span class="server-req-count">${srv.handled} handled • ${srv.active} active</span>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.72rem; font-weight: 700; color: ${srv.healthy ? '#10b981' : '#ef4444'};">
                  ${srv.healthy ? 'HEALTHY' : 'DOWN'}
                </span>
                <div class="server-health-indicator"></div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Node 4: Shared Backend (Cache & DB) -->
        <div class="topology-node" id="lbNodeBackend">
          <div class="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
              <path d="M3 12A9 3 0 0 0 21 12"/>
            </svg>
          </div>
          <div class="node-title">Shared Backend</div>
          <div class="node-subtitle">Redis Cluster + PostgreSQL</div>
          <div class="node-badge-tag">Single Source of Truth</div>
        </div>
      </div>

      <!-- Live Counters & Distribution Chart -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
        
        <!-- Metrics -->
        <div class="sim-metrics-grid">
          <div class="sim-metric-card">
            <div class="metric-card-header">
              <span class="metric-label">Total Traffic</span>
            </div>
            <div class="metric-val purple">${this.state.totalRequests}</div>
            <div class="metric-sub">Processed through proxy</div>
          </div>

          <div class="sim-metric-card">
            <div class="metric-card-header">
              <span class="metric-label">Active Healthy</span>
            </div>
            <div class="metric-val emerald">${this.state.servers.filter(s => s.healthy).length} / 3</div>
            <div class="metric-sub">Available worker nodes</div>
          </div>

          <div class="sim-metric-card">
            <div class="metric-card-header">
              <span class="metric-label">Dropped Requests</span>
            </div>
            <div class="metric-val ${this.state.failedRequests > 0 ? 'amber' : 'emerald'}">${this.state.failedRequests}</div>
            <div class="metric-sub">0% drop with failover</div>
          </div>
        </div>

        <!-- Real-Time Request Distribution Chart -->
        <div class="sim-metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Server Workload Distribution</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">Handled Share</span>
          </div>

          <div class="distribution-bars-container">
            ${this.state.servers.map((srv, idx) => {
              const pct = maxHandled > 0 ? Math.round((srv.handled / maxHandled) * 100) : 0;
              return `
                <div class="dist-bar-item">
                  <span class="dist-bar-label">${srv.name}</span>
                  <div class="dist-bar-track">
                    <div class="dist-bar-fill server-${idx + 1}" style="width: ${pct}%;"></div>
                  </div>
                  <span class="dist-bar-val">${srv.handled}</span>
                </div>
              `;
            }).join('')}
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
          <div class="explainer-title">How Load Balancing Scales the Leaderboard</div>
          <p class="explainer-text">
            <strong>“Instead of sending every request to one server, a load balancer distributes requests across multiple servers to handle more users.”</strong>
          </p>
          <p class="explainer-text" style="font-size: 0.78rem; opacity: 0.85;">
            • <strong>Round Robin:</strong> Passes each incoming leaderboard request to the next server in line (1 → 2 → 3 → 1).<br>
            • <strong>Least Connections:</strong> Directs each request to whichever server currently has the fewest active clients.<br>
            • <strong>Failover & Health Checks:</strong> If Server 2 crashes, the load balancer detects it instantly and routes all traffic safely to Servers 1 & 3 with 0 dropped requests.
          </p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const btnSingle = document.getElementById('btnSendSingleReq');
    const btnBatch = document.getElementById('btnSendBatchReq');
    const btnStress = document.getElementById('btnToggleStress');
    const btnFail = document.getElementById('btnToggleServerFail');
    const btnReset = document.getElementById('btnResetLb');
    const btnRR = document.getElementById('btnStrategyRR');
    const btnLC = document.getElementById('btnStrategyLC');

    if (btnSingle) btnSingle.addEventListener('click', () => this.dispatchRequest());
    if (btnBatch) btnBatch.addEventListener('click', () => this.dispatchBatch(5));
    if (btnStress) btnStress.addEventListener('click', () => this.toggleStress());
    if (btnFail) btnFail.addEventListener('click', () => this.toggleServerFailure(1)); // Server 2 is index 1
    if (btnReset) btnReset.addEventListener('click', () => this.resetSimulation());
    if (btnRR) btnRR.addEventListener('click', () => this.setStrategy('round_robin'));
    if (btnLC) btnLC.addEventListener('click', () => this.setStrategy('least_conn'));
  }

  setStrategy(strategy) {
    this.state.strategy = strategy;
    this.render();
  }

  dispatchRequest() {
    this.state.totalRequests++;
    this.state.activeRequests++;

    // Pick target server based on strategy and health
    const healthyServers = this.state.servers.filter(s => s.healthy);
    if (healthyServers.length === 0) {
      this.state.failedRequests++;
      this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
      this.render();
      return;
    }

    let targetServer = null;

    if (this.state.strategy === 'round_robin') {
      targetServer = healthyServers[this.state.rrIndex % healthyServers.length];
      this.state.rrIndex++;
    } else {
      // Least Connections: pick server with lowest active connections
      targetServer = healthyServers.reduce((min, curr) => (curr.active < min.active ? curr : min), healthyServers[0]);
    }

    targetServer.handled++;
    targetServer.active++;

    // Flash active server node in UI
    const srvElem = document.getElementById(`srvNode-${targetServer.id}`);
    if (srvElem) {
      srvElem.classList.add('active-server');
      setTimeout(() => srvElem.classList.remove('active-server'), 300);
    }

    // Simulate completion
    setTimeout(() => {
      targetServer.active = Math.max(0, targetServer.active - 1);
      this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
      this.render();
    }, 450);

    this.render();
  }

  dispatchBatch(count = 5) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.dispatchRequest(), i * 80);
    }
  }

  toggleStress() {
    if (this.state.stressInterval) {
      clearInterval(this.state.stressInterval);
      this.state.stressInterval = null;
    } else {
      this.state.stressInterval = setInterval(() => {
        this.dispatchRequest();
      }, 200);
    }
    this.render();
  }

  toggleServerFailure(serverIndex = 1) {
    const srv = this.state.servers[serverIndex];
    if (srv) {
      srv.healthy = !srv.healthy;
      if (!srv.healthy) {
        // Drop any active connections on the crashed server
        srv.active = 0;
      }
    }
    this.render();
  }

  resetSimulation() {
    if (this.state.stressInterval) {
      clearInterval(this.state.stressInterval);
      this.state.stressInterval = null;
    }
    this.state.totalRequests = 0;
    this.state.activeRequests = 0;
    this.state.failedRequests = 0;
    this.state.rrIndex = 0;
    this.state.servers.forEach(s => {
      s.handled = 0;
      s.active = 0;
      s.healthy = true;
    });
    this.render();
  }
}
