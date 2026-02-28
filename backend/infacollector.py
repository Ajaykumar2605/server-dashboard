#!/usr/bin/env python3
"""
InfraControl Collector Service
To be run on each monitored server.
Exposes real-time system metrics as JSON over HTTP.
Default Port: 9101
"""
import http.server
import json
import socket
import os
import time
import subprocess
import shutil

PORT = 9101

def get_uptime():
    with open('/proc/uptime', 'r') as f:
        uptime_seconds = float(f.readline().split()[0])
    return uptime_seconds

def get_cpu_info():
    """Simple CPU usage using /proc/stat."""
    with open('/proc/stat', 'r') as f:
        line = f.readline()
    parts = line.split()
    # idle is at index 4
    idle = float(parts[4])
    total = sum(float(x) for x in parts[1:])
    return idle, total

class MetricsHandler(http.server.BaseHTTPRequestHandler):
    prev_cpu = (0, 0)

    def do_GET(self):
        if self.path == '/metrics' or self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            # CPU
            idle1, total1 = get_cpu_info()
            time.sleep(0.1)
            idle2, total2 = get_cpu_info()
            diff_idle = idle2 - idle1
            diff_total = total2 - total1
            cpu_usage = 0 if diff_total == 0 else (1 - (diff_idle / diff_total)) * 100

            # RAM
            mem_info = {}
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    parts = line.split(':')
                    if len(parts) == 2:
                        mem_info[parts[0].strip()] = int(parts[1].split()[0])
            
            mem_total = mem_info.get('MemTotal', 1)
            mem_free = mem_info.get('MemAvailable', mem_info.get('MemFree', 0))
            ram_usage = ((mem_total - mem_free) / mem_total) * 100

            # Disk
            total, used, free = shutil.disk_usage("/")
            disk_usage = (used / total) * 100

            data = {
                "hostname": socket.gethostname(),
                "status": "online",
                "uptime_seconds": get_uptime(),
                "cpu_percent": round(cpu_usage, 2),
                "ram_percent": round(ram_usage, 2),
                "disk_percent": round(disk_usage, 2),
                "timestamp": time.time()
            }
            self.wfile.write(json.dumps(data).encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        return # Silent logging

if __name__ == "__main__":
    print(f"InfraControl Collector starting on port {PORT}...")
    server = http.server.HTTPServer(('0.0.0.0', PORT), MetricsHandler)
    server.serve_forever()
