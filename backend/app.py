import os
import json
import time
import requests
import socket
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading

# --- Configuration & State ---
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)

CONFIG_FILE = "config.json"
POLL_INTERVAL = 3000  # ms

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {"nodes": [], "cluster_nodes": [], "domains": [], "users": []}
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)

CONFIG = load_config()

# Global state for dashboard
STATE = {
    "servers": [],
    "cluster": {
        "status": "Healthy",
        "health_status": "Health OK",
        "quorum": True,
        "primary_node": "server1",
        "cluster_ip": "192.168.1.20",
        "latency": "0.45",
        "shared_load": "14.2",
        "services": {
            "corosync": "active/enabled",
            "pacemaker": "active/enabled",
            "pcsd": "active/enabled"
        },
        "nodes": []
    },
    "websites": [],
    "alerts": [],
    "users": CONFIG.get("users", []),
    "last_updated": "--"
}

# --- Helpers ---
def ping(host, port=22):
    try:
        start = time.time()
        socket.setdefaulttimeout(1)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((host, port))
        s.close()
        return round((time.time() - start) * 1000, 2)
    except:
        return None

def format_uptime(seconds):
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    mins = (seconds % 3600) // 60
    if days > 0: return f"{days}d {hours}h"
    if hours > 0: return f"{hours}h {mins}m"
    return f"{mins}m"

# --- Polling Logic ---
def update_system_state():
    """Shared function to update STATE based on current CONFIG."""
    updated_servers = []
    updated_cluster_nodes = []
    updated_websites = []
    current_alerts = []

    # 1. Update Servers (Telemetry)
    for node in CONFIG["nodes"]:
        srv = {
            "id": node["id"],
            "hostname": node["hostname"],
            "ip": node["ip"],
	    "url": node.get("url", ""),
            "status": "offline",
            "ping": None,
            "uptime": "N/A",
            "cpu": "0%", "ram": "0%", "disk": "0%"
        }
        try:
            # We assume node_exporter or our custom mock exporter is at 9101
            r = requests.get(f"http://{node['ip']}:9101/metrics", timeout=1.5)
            if r.status_code == 200:
                data = r.json()
                srv["status"] = "online"
                srv["uptime"] = format_uptime(data.get("uptime_seconds", 0))
                srv["cpu"] = f"{data.get('cpu_percent', 0)}%"
                srv["ram"] = f"{data.get('ram_percent', 0)}%"
                srv["disk"] = f"{data.get('disk_percent', 0)}%"
            else:
                lat = ping(node["ip"], 22)
                if lat:
                    srv["status"] = "online"
                    srv["ping"] = lat
        except:
            lat = ping(node["ip"], 22)
            if lat:
                srv["status"] = "online"
                srv["ping"] = lat

        if srv["status"] == "offline":
            current_alerts.append({"type": "server", "msg": f"Server {node['id']} is offline!", "level": "critical"})
        updated_servers.append(srv)

        if node["id"] in CONFIG["cluster_nodes"]:
            updated_cluster_nodes.append({
                "id": node["id"],
                "status": srv["status"],
                "health": "Healthy" if srv["status"] == "online" else "Degraded"
            })

    cluster_online = sum(1 for n in updated_cluster_nodes if n["status"] == "online")
    quorum = cluster_online >= (len(CONFIG["cluster_nodes"]) / 2 + 1 if len(CONFIG["cluster_nodes"]) > 1 else 1)
    
    if not quorum:
        current_alerts.append({"type": "cluster", "msg": "Cluster Quorum Lost!", "level": "critical"})

    # 2. Update Websites
    for domain in CONFIG["domains"]:
        port = 443 if "https" in domain else 80
        lat = ping(domain, port)
        status = "online" if lat else "offline"
        if status == "offline":
            current_alerts.append({"type": "domain", "msg": f"Website {domain} is down!", "level": "warning"})
        
        updated_websites.append({
            "domain": domain,
            "status": status,
            "latency": lat,
            "connections": int(lat * 0.4) if lat else 0,
            "rpm": int(lat * 1.5) if lat else 0
        })

    # Update Global State
    STATE["servers"] = updated_servers
    STATE["cluster"] = {
        "status": "Healthy" if quorum else "Degraded",
        "health_status": "Health OK" if quorum else "Critical",
        "quorum": quorum,
        "primary_node": "server1",
        "cluster_ip": "192.168.1.20",
        "latency": "0.45",
        "shared_load": "14.2",
        "services": {
            "corosync": "active/enabled",
            "pacemaker": "active/enabled",
            "pcsd": "active/enabled"
        },
        "nodes": updated_cluster_nodes
    }
    STATE["websites"] = updated_websites
    STATE["alerts"] = current_alerts
    STATE["users"] = CONFIG["users"]
    STATE["last_updated"] = time.strftime("%H:%M:%S")

def poller_thread():
    while True:
        try:
            update_system_state()
        except:
            pass
        time.sleep(POLL_INTERVAL / 1000)

# --- Routes ---
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/status')
def get_status():
    return jsonify(STATE)

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    for u in CONFIG["users"]:
        if u["username"] == username and u["password"] == password:
            return jsonify({"status": "success", "username": username, "role": u["role"]})
    return jsonify({"status": "fail"}), 401

@app.route('/api/domains', methods=['POST', 'PUT', 'DELETE'])
def manage_domains():
    global CONFIG
    data = request.json
    if request.method == 'POST':
        CONFIG["domains"].append(data['domain'])
    elif request.method == 'PUT':
        old = data['old_name']
        new = data['new_name']
        if old in CONFIG["domains"]:
            idx = CONFIG["domains"].index(old)
            CONFIG["domains"][idx] = new
    elif request.method == 'DELETE':
        if data['domain'] in CONFIG["domains"]:
            CONFIG["domains"].remove(data['domain'])
    save_config(CONFIG)
    update_system_state()
    return jsonify({"status": "success"})

@app.route('/api/users', methods=['POST', 'DELETE'])
def manage_users():
    global CONFIG
    data = request.json
    if request.method == 'POST':
        CONFIG["users"].append({
            "username": data['username'],
            "password": "hello", # Default password
            "role": data['role']
        })
    elif request.method == 'DELETE':
        CONFIG["users"] = [u for u in CONFIG["users"] if u["username"] != data['username']]
    save_config(CONFIG)
    update_system_state()
    return jsonify({"status": "success"})

if __name__ == '__main__':
    # Start poller
    t = threading.Thread(target=poller_thread, daemon=True)
    t.start()
    # Listen on 0.0.0.0 to be reachable externally
    app.run(host='0.0.0.0', port=5000)