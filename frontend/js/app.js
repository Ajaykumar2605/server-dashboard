// InfraControl Dashboard Logic v3.0 - Stable Enhanced
const API_URL = '/api/status';
const POLL_INTERVAL = 3000;

let currentTheme = localStorage.getItem('theme') || 'dark';
let clearedAlerts = new Set();
let lastUpdateTime = Date.now();
let bannerTimeout;

document.documentElement.setAttribute('data-theme', currentTheme);

// Initialize Navigation & Sidebar Toggle
document.getElementById('menu-toggle')?.addEventListener('click', (e) => {
    document.getElementById('sidebar')?.classList.toggle('active');
    e.stopPropagation();
});

document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('active') && !sidebar.contains(e.target) && !e.target.closest('#menu-toggle')) {
        sidebar.classList.remove('active');
    }
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        if (!viewId) return;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            const navLabel = item.querySelector('.nav-label')?.innerText || item.innerText.trim();
            document.getElementById('view-title').innerText = navLabel;
        }

        document.getElementById('sidebar')?.classList.remove('active');
    });
});

// Live Clock
function updateClock() {
    const clock = document.getElementById('live-clock');
    const now = new Date();
    if (clock) clock.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);

// Relative Time Formatter
function getRelativeTime(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'just now';
    return `${diff}s`;
}

function updateRelativeTime() {
    const el = document.getElementById('last-update-nav');
    if (el) el.innerText = getRelativeTime(lastUpdateTime);
}
setInterval(updateRelativeTime, 1000);

// Theme Toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = currentTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
});

// Real-time Polling
async function updateDashboard() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        lastUpdateTime = Date.now();

        renderServers(data.servers);
        renderCluster(data.cluster, data.servers);
        renderWebsites(data.websites);
        handleAlerts(data.alerts);
        renderCockpitGrid(data.servers);
        renderUserList(data.users);

        // Update Notification Count Badge
        const notifBadge = document.getElementById('notification-count');
        if (notifBadge) {
            const activeAlerts = data.alerts.filter(a => !clearedAlerts.has(a.msg));
            const count = activeAlerts.length;
            notifBadge.innerText = count;
            notifBadge.style.display = count > 0 ? 'flex' : 'none';
        }

        const light = document.getElementById('system-status-light');
        if (light) {
            const isHealthy = data.alerts.filter(a => !clearedAlerts.has(a.msg)).length === 0;
            light.className = `status-light ${isHealthy ? 'status-light-green' : 'status-light-red'}`;
        }

    } catch (err) {
        console.error("Dashboard update failed:", err);
    }
}

function getUsageClass(value) {
    const num = parseInt(value);
    if (isNaN(num)) return 'usage-low';
    if (num > 90) return 'usage-high';
    if (num > 70) return 'usage-med';
    return 'usage-low';
}

function renderServers(servers) {
    const grid = document.getElementById('grid-servers');
    if (!grid || !servers) return;
    grid.innerHTML = servers.map(s => `
        <div class="card">
            <div class="card-title">
                <span><i class="fa-solid fa-server" style="color: var(--accent-blue);"></i> ${s.hostname}</span>
                <span class="status-dot ${s.status === 'online' ? 'status-online' : 'status-offline'}"></span>
            </div>
            <div class="metric-item"><i class="fa-solid fa-network-wired"></i> <span class="text-muted">IP</span> <span class="usage-value">${s.ip}</span></div>
            <div class="metric-item"><i class="fa-solid fa-clock-rotate-left"></i> <span class="text-muted">Uptime</span> <span class="usage-value">${s.uptime}</span></div>
            <div class="metric-item"><i class="fa-solid fa-microchip"></i> <span class="text-muted">CPU</span> <span class="usage-value ${getUsageClass(s.cpu)}">${s.cpu}</span></div>
            <div class="metric-item"><i class="fa-solid fa-memory"></i> <span class="text-muted">RAM</span> <span class="usage-value ${getUsageClass(s.ram)}">${s.ram}</span></div>
            <div class="metric-item"><i class="fa-solid fa-hard-drive"></i> <span class="text-muted">Disk</span> <span class="usage-value ${getUsageClass(s.disk)}">${s.disk}</span></div>
        </div>
    `).join('');
}

function renderCluster(cluster, allServers) {
    const grid = document.getElementById('grid-cluster');
    if (!grid || !cluster) return;

    // 1. Update Header Metrics
    if (document.getElementById('cluster-health-text')) {
        const el = document.getElementById('cluster-health-text');
        el.innerText = cluster.health_status;
        el.style.color = cluster.quorum ? 'var(--accent-green)' : 'var(--accent-red)';
    }
    if (document.getElementById('cluster-ip-text')) document.getElementById('cluster-ip-text').innerText = cluster.cluster_ip;
    if (document.getElementById('cluster-load-text')) document.getElementById('cluster-load-text').innerText = cluster.shared_load;

    // 2. Update Service Badges
    if (document.getElementById('status-corosync-badge')) document.getElementById('status-corosync-badge').innerText = cluster.services.corosync;
    if (document.getElementById('status-pacemaker-badge')) document.getElementById('status-pacemaker-badge').innerText = cluster.services.pacemaker;
    if (document.getElementById('status-pcsd-badge')) document.getElementById('status-pcsd-badge').innerText = cluster.services.pcsd;

    // 3. Render Mirror Cards for server1/server2
    if (allServers) {
        const clusterServers = allServers.filter(s => s.id === 'server1' || s.id === 'server2');
        grid.innerHTML = clusterServers.map(s => `
            <div class="card" style="border-top: 3px solid ${s.id === cluster.primary_node ? 'var(--accent-green)' : 'var(--accent-blue)'};">
                <div class="card-title">
                    <span><i class="fa-solid fa-server"></i> ${s.hostname}</span>
                    <span class="status-dot ${s.status === 'online' ? 'status-online' : 'status-offline'}"></span>
                </div>
                <div class="metric-item"><i class="fa-solid fa-microchip"></i> <span>CPU</span> <span class="usage-value ${getUsageClass(s.cpu)}">${s.cpu}</span></div>
                <div class="metric-item"><i class="fa-solid fa-memory"></i> <span>RAM</span> <span class="usage-value ${getUsageClass(s.ram)}">${s.ram}</span></div>
                <div class="metric-item"><i class="fa-solid fa-clock"></i> <span>Uptime</span> <span class="usage-value">${s.uptime}</span></div>
                <div style="font-size: 0.75rem; text-align: center; color: var(--text-muted); margin-top: 0.5rem;">
                    ${s.id === cluster.primary_node ? '<i class="fa-solid fa-crown" style="color: var(--accent-yellow);"></i> Active Primary' : 'Hot Standby'}
                </div>
            </div>
        `).join('');
    }
}

function renderWebsites(sites) {
    const grid = document.getElementById('grid-websites');
    if (!grid || !sites) return;
    grid.innerHTML = sites.map(s => `
        <div class="domain-card">
            <div class="card-title">
                <span><i class="fa-solid fa-globe"></i> ${s.domain}</span>
                <span class="status-dot ${s.status === 'online' ? 'status-online' : 'status-offline'}"></span>
            </div>
            <div class="metric-item"><i class="fa-solid fa-bolt"></i> <span>Latency</span> <span class="usage-value">${s.latency ? s.latency + 'ms' : 'N/A'}</span></div>
            <div class="metric-item"><i class="fa-solid fa-users"></i> <span>Users</span> <span class="usage-value">${s.connections}</span></div>
            <div class="metric-item"><i class="fa-solid fa-gauge"></i> <span>Traffic</span> <span class="usage-value">${s.rpm} RPM</span></div>
            <div class="domain-actions" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                <button class="btn btn-icon" onclick="openRenameModal('${s.domain}')" title="Rename"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-icon" onclick="deleteDomain('${s.domain}')" style="color: var(--accent-red)" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function renderCockpitGrid(servers) {
    const grid = document.getElementById('cockpit-grid');
    if (!grid || !servers) return;
    grid.innerHTML = servers.map(s => `
        <div class="monitoring-card" style="--card-accent: var(--accent-blue); padding: 1.5rem; min-height: auto;">
            <i class="fa-solid fa-terminal" style="font-size: 1.5rem; margin-bottom: 1rem;"></i>
            <div class="card-title" style="font-size: 1rem;">${s.hostname}</div>
            <p style="font-size: 0.8rem; margin-bottom: 1.5rem;">Console access for server management at ${s.ip}</p>
            <a href=${s.url} target="_blank" class="btn" style="padding: 0.5rem; font-size: 0.8rem;">Open Console</a>
        </div>
    `).join('');
}

function handleAlerts(newAlerts) {
    const banner = document.getElementById('alert-banner');
    const msg = document.getElementById('alert-msg');
    const dot = document.getElementById('notification-count');
    const list = document.getElementById('notification-list');
    const activeAlerts = newAlerts.filter(a => !clearedAlerts.has(a.msg));

    if (dot) {
        dot.innerText = activeAlerts.length;
        dot.style.display = activeAlerts.length > 0 ? 'flex' : 'none';
    }

    if (activeAlerts.length > 0) {
        if (banner) {
            banner.style.display = 'flex';
            msg.innerText = activeAlerts[0].msg;
            if (bannerTimeout) clearTimeout(bannerTimeout);
            bannerTimeout = setTimeout(() => { banner.style.display = 'none'; }, 5000);
        }
    } else if (banner) {
        banner.style.display = 'none';
    }

    if (list) {
        list.innerHTML = activeAlerts.length === 0 ? '<div class="notification-empty">No active alerts</div>' :
            activeAlerts.map(a => `<div class="notification-item" data-msg="${a.msg}"><b>Alert</b><br>${a.msg}</div>`).join('');
    }
}

function renderUserList(users) {
    const container = document.getElementById('user-list-container');
    if (!container || !users) return;
    container.innerHTML = users.map(u => `
        <div class="user-row">
            <div>
                <span style="font-weight: 600;">${u.username}</span>
                <span class="badge" style="margin-left: 10px; font-size: 10px;">${u.role}</span>
            </div>
            ${u.username !== 'admin' ? `<button class="btn btn-icon" onclick="deleteUser('${u.username}')" style="color: var(--accent-red)"><i class="fa-solid fa-user-minus"></i></button>` : ''}
        </div>
    `).join('');
}

function enforceRBAC() {
    const role = sessionStorage.getItem('infra_role');
    if (role === 'Viewer') {
        const adminElements = [
            '#btn-add-domain',
            '.btn-delete',
            '.btn-rename',
            '#btn-add-user',
            '.btn-user-delete',
            '.user-management-actions',
            '#user-add-section'
        ];
        adminElements.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.style.display = 'none';
            });
        });
    }
}

document.getElementById('notification-bell')?.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
    e.stopPropagation();
});

document.addEventListener('click', () => {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.style.display = 'none';
});

document.getElementById('btn-view-cockpit')?.addEventListener('click', () => {
    document.getElementById('modal-cockpit').style.display = 'flex';
});
document.getElementById('btn-close-cockpit')?.addEventListener('click', () => {
    document.getElementById('modal-cockpit').style.display = 'none';
});

document.getElementById('btn-clear-alerts')?.addEventListener('click', (e) => {
    const list = document.getElementById('notification-list');
    const items = list.querySelectorAll('.notification-item');
    items.forEach(item => {
        const msg = item.getAttribute('data-msg');
        if (msg) clearedAlerts.add(msg);
    });
    updateDashboard();
    e.stopPropagation();
});

if (sessionStorage.getItem('infra_auth') !== 'true' && !window.location.href.includes('login.html')) {
    window.location.href = 'login.html';
}

document.getElementById('link-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('infra_auth');
    window.location.href = 'login.html';
});

// Domain CRUD functions (Global)
document.getElementById('btn-add-domain')?.addEventListener('click', () => {
    document.getElementById('modal-domain-title').innerText = "Add New Domain";
    document.getElementById('input-old-domain').value = "";
    document.getElementById('input-domain').value = "";
    document.getElementById('modal-domain').style.display = 'flex';
});

window.openRenameModal = (domain) => {
    document.getElementById('modal-domain-title').innerText = "Rename Domain";
    document.getElementById('input-old-domain').value = domain;
    document.getElementById('input-domain').value = domain;
    document.getElementById('modal-domain').style.display = 'flex';
};

window.deleteDomain = async (domain) => {
    if (confirm(`Delete ${domain}?`)) {
        await fetch('/api/domains', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        updateDashboard();
    }
};

document.getElementById('btn-save-domain')?.addEventListener('click', async () => {
    const input = document.getElementById('input-domain').value;
    const oldName = document.getElementById('input-old-domain').value;
    if (input) {
        const method = oldName ? 'PUT' : 'POST';
        const body = oldName ? { old_name: oldName, new_name: input } : { domain: input };
        await fetch('/api/domains', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        document.getElementById('modal-domain').style.display = 'none';
        updateDashboard();
    }
});

document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    document.getElementById('modal-domain').style.display = 'none';
});

// Init
const currentUser = sessionStorage.getItem('infra_user') || 'Admin';
if (document.getElementById('nav-username')) document.getElementById('nav-username').innerText = currentUser;

setInterval(() => {
    updateDashboard();
    enforceRBAC();
}, POLL_INTERVAL);

updateDashboard();
updateClock();
setTimeout(enforceRBAC, 1000);