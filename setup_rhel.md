# InfraControl Deployment Guide (RHEL 9.8)

Follow these steps to deploy the InfraControl dashboard and its collector services on Red Hat Enterprise Linux 9.8.

## 1. Prerequisites
Ensure Python 3.9+ and pip are installed:
```bash
sudo dnf install -y python3 python3-pip
```

## 2. Install Backend Dependencies
On the central monitoring server:
```bash
pip install flask flask-cors requests
```

## 3. Deploy Collector Service (On Each Node)
Copy `backend/infacollector.py` to each server you want to monitor.

### Create Systemd Service for Collector
```bash
sudo nano /etc/systemd/system/infacollector.service
```
Paste the following:
```ini
[Unit]
Description=InfraControl Collector Service
After=network.target

[Service]
ExecStart=/usr/bin/python3 /path/to/infacollector.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now infacollector
```

## 4. Deploy Dashboard Backend (Central Server)

### Create Systemd Service for Dashboard
```bash
sudo nano /etc/systemd/system/infracontrol.service
```
Paste the following:
```ini
[Unit]
Description=InfraControl Dashboard Backend
After=network.target

[Service]
WorkingDirectory=/path/to/InfraControl
ExecStart=/usr/bin/python3 backend/app.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now infracontrol
```

## 5. Configure Firewall
Allow ports 5000 (Dashboard) and 9101 (Collector):
```bash
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --permanent --add-port=9101/tcp
sudo firewall-cmd --reload
```

## 6. Accessing the UI
Open your browser and navigate to `http://<CENTRAL_SERVER_IP>:5000`.
Login using the static credentials (default: `admin`/`admin`).
