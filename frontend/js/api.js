// API Communication and Polling

const API_URL = '/api'; 
const POLL_INTERVAL = 3000; 

let pollTimer = null;

async function fetchDashboardData() {
    try {
        const response = await fetch(`${API_URL}/status`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Update UI Components
        if (data.servers) UI.renderServers(data.servers);
        if (data.cluster) UI.renderCluster(data.cluster.nodes, data.cluster.quorum);
        if (data.websites) UI.renderWebsites(data.websites);

        UI.updateTimestamp();
        UI.updateConnectionStatus(true);

    } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        UI.updateConnectionStatus(false);
    }
}

async function addDomain(domain) {
    try {
        const response = await fetch(`${API_URL}/domains`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        
        const result = await response.json();
        if (response.ok) {
            fetchDashboardData();
            return { success: true };
        } else {
            return { success: false, message: result.message };
        }
    } catch (error) {
        return { success: false, message: "Network error" };
    }
}

function initMonitoring() {
    fetchDashboardData();
    pollTimer = setInterval(fetchDashboardData, POLL_INTERVAL);
}

document.addEventListener("visibilitychange", () => {
    if (pollTimer) clearInterval(pollTimer);
    if (!document.hidden) {
        fetchDashboardData();
        pollTimer = setInterval(fetchDashboardData, POLL_INTERVAL);
    }
});
