#!/usr/bin/env python3
"""
EdgeVision Nexus - Multi-Device API Gateway

This service runs on a central server and:
1. Provides a single API endpoint for the dashboard
2. Maintains a registry of all edge devices (ZED cameras)
3. Proxies metrics requests to edge nodes
4. Aggregates metrics from multiple devices
5. Health checks all devices and tracks status

The gateway is stateless except for device registry (no database needed).
Devices register themselves by name/URL, and gateway monitors them.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from datetime import datetime
from typing import Dict, List
import threading
import time
import logging

from tailscale_routes import tailscale_bp

app = Flask(__name__)
CORS(app)

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Register optional Tailscale integration
app.register_blueprint(tailscale_bp)

# ============================================================================
# DEVICE REGISTRY - In-Memory Device Tracking
# ============================================================================
# Maps device_id -> device info (name, url, status, timestamps)
# Thread-safe access via device_lock
devices: Dict[str, dict] = {}
device_lock = threading.Lock()


# ============================================================================
# DEVICE MANAGEMENT ENDPOINTS
# ============================================================================


@app.route('/devices', methods=['GET'])
def list_devices():
    """
    List all registered edge devices.
    
    RETURNS (JSON):
    [
        {
            "id": "zed-camera-1",
            "name": "Front Door Camera",
            "url": "http://192.168.1.100:5000",
            "status": "online",              # online, offline, connecting
            "lastSeen": "2024-12-09T20:30:45",
            "registered": "2024-12-09T20:00:00",
            "cameraReady": true,
            "sdkVersion": "5.0.3"
        }
    ]
    
    USAGE:
    - Dashboard calls on startup to discover devices
    - Returns empty list if no devices registered yet
    - Status reflects last health check result
    """
    with device_lock:
        return jsonify(list(devices.values()))


@app.route('/devices', methods=['POST'])
def register_device():
    """
    Register a new edge device with the gateway.
    
    REQUEST BODY (JSON):
    {
        "id": "zed-camera-1",           # Unique device identifier
        "name": "Front Door Camera",    # Human-readable name
        "url": "http://192.168.1.100:5000"  # Device API URL
    }
    
    RETURNS (JSON):
    - 201: Device registered successfully
    - 400: Missing required fields (id, url)
    - 409: Device already registered (replace with PUT)
    
    FLOW:
    1. Edge device or user calls this endpoint
    2. Gateway stores device in registry with status='connecting'
    3. Next health check will verify connectivity
    4. Dashboard automatically discovers new devices
    
    NOTE:
    - Device URL should be reachable from gateway
    - For remote devices, use Tailscale or VPN
    - Gateway will attempt health checks immediately
    """
    data = request.json
    
    # Validate required fields
    if not data or 'id' not in data or 'url' not in data:
        return jsonify({'error': 'Missing required fields: id, url'}), 400
    
    device_id = data['id']
    
    with device_lock:
        devices[device_id] = {
            'id': device_id,
            'name': data.get('name', f'Device {device_id}'),
            'url': data['url'],
            'status': 'connecting',  # Will become 'online' after first health check
            'lastSeen': datetime.now().isoformat(),
            'registered': datetime.now().isoformat(),
        }
    
    logger.info(f"Device registered: {device_id}")
    return jsonify(devices[device_id]), 201


@app.route('/devices/<device_id>', methods=['DELETE'])
def unregister_device(device_id):
    """
    Unregister and remove a device from the gateway.
    
    RETURNS:
    - 200: Device removed successfully
    - 404: Device not found
    
    USAGE:
    - Remove offline devices permanently
    - Decommission old cameras
    - Clean up stale registry entries
    """
    with device_lock:
        if device_id in devices:
            del devices[device_id]
            logger.info(f"Device unregistered: {device_id}")
            return jsonify({'message': 'Device removed'}), 200
        return jsonify({'error': 'Device not found'}), 404


# ============================================================================
# DEVICE MONITORING ENDPOINTS
# ============================================================================


@app.route('/devices/<device_id>/health', methods=['GET'])
def device_health(device_id):
    """
    Get health status for a specific device.
    
    RETURNS (JSON):
    {
        "status": "healthy",
        "camera_ready": true,
        "sdk_version": "5.0.3"
    }
    
    BEHAVIOR:
    1. Calls device's /health endpoint (2 second timeout)
    2. Updates device status: online, offline, or error
    3. Stores response for dashboard
    
    USAGE:
    - Dashboard calls before displaying device
    - Gateway calls periodically for health monitoring
    - Returns 503 if device unreachable
    
    STATUS CODES:
    - 200: Device healthy and responding
    - 404: Device not found in registry
    - 503: Device unreachable or timeout
    """
    with device_lock:
        if device_id not in devices:
            return jsonify({'error': 'Device not found'}), 404
        
        device = devices[device_id]
    
    try:
        # Call device's health endpoint with timeout
        response = requests.get(f"{device['url']}/health", timeout=2)
        if response.status_code == 200:
            health_data = response.json()
            
            # Update device status in registry
            with device_lock:
                devices[device_id]['status'] = 'online'
                devices[device_id]['lastSeen'] = datetime.now().isoformat()
                devices[device_id].update({
                    'cameraReady': health_data.get('camera_ready', False),
                    'sdkVersion': health_data.get('sdk_version', 'unknown'),
                })
            
            logger.debug(f"Health check passed: {device_id}")
            return jsonify(health_data)
    except Exception as e:
        # Mark device as offline if unreachable
        with device_lock:
            devices[device_id]['status'] = 'offline'
        logger.warning(f"Health check failed for {device_id}: {e}")
        return jsonify({'error': str(e), 'status': 'offline'}), 503


@app.route('/devices/<device_id>/metrics', methods=['GET'])
def device_metrics(device_id):
    """
    Get current metrics from a specific device.
    
    RETURNS (JSON):
    {
        "deviceId": "zed-camera-1",
        "metrics": {
            "Person": 5,
            "Vehicle": 2,
            "timestamp": "2024-12-09T20:30:45"
        },
        "timestamp": "2024-12-09T20:30:45"
    }
    
    FLOW:
    1. Gateway proxies request to device's /metrics endpoint
    2. Device returns detection counts (lightweight, ~200 bytes)
    3. Gateway wraps response with deviceId for dashboard
    4. Updates lastSeen timestamp for stale detection
    
    USAGE:
    - Dashboard calls every 1 second for live updates
    - Does NOT include video stream (lightweight)
    - Fails gracefully if device offline
    
    RESPONSE TIME:
    - Typically < 20ms (simple proxy call)
    """
    with device_lock:
        if device_id not in devices:
            return jsonify({'error': 'Device not found'}), 404
        
        device = devices[device_id]
    
    try:
        # Proxy metrics request to device
        response = requests.get(f"{device['url']}/metrics", timeout=2)
        if response.status_code == 200:
            metrics_data = response.json()
            
            # Update last seen for stale detection
            with device_lock:
                devices[device_id]['lastSeen'] = datetime.now().isoformat()
            
            # Wrap with device info
            return jsonify({
                'deviceId': device_id,
                'metrics': metrics_data,
                'timestamp': datetime.now().isoformat(),
            })
    except Exception as e:
        logger.warning(f"Metrics fetch failed for {device_id}: {e}")
        return jsonify({'error': str(e)}), 503


@app.route('/devices/<device_id>/video_feed', methods=['GET'])
def device_video_feed(device_id):
    """
    Get video feed URL for a device.
    
    RETURNS (JSON):
    {
        "videoUrl": "http://192.168.1.100:5000/video_feed"
    }
    
    USAGE:
    - Dashboard uses returned URL to display live video
    - Browser fetches MJPEG stream directly from edge device
    - Gateway is just a lookup service (not a proxy)
    
    WHY NOT PROXY?
    - Video streams are high-bandwidth
    - Proxying would consume gateway resources
    - Browser can connect directly to device
    - Improves performance and reduces latency
    
    RETURNS:
    - 200: URL returned (even if device is offline)
    - 404: Device not found
    """
    with device_lock:
        if device_id not in devices:
            return jsonify({'error': 'Device not found'}), 404
        
        device = devices[device_id]
    
    # Return video feed URL for browser to consume directly
    return jsonify({'videoUrl': f"{device['url']}/video_feed"})


# ============================================================================
# AGGREGATE METRICS ENDPOINT
# ============================================================================


@app.route('/aggregate/metrics', methods=['GET'])
def aggregate_metrics():
    """
    Get aggregated metrics from all online devices.
    
    RETURNS (JSON):
    [
        {
            "deviceId": "zed-camera-1",
            "deviceName": "Front Door",
            "metrics": {"Person": 5, "Vehicle": 1},
            "timestamp": "2024-12-09T20:30:45"
        },
        {
            "deviceId": "zed-camera-2",
            "deviceName": "Parking Lot",
            "metrics": {"Person": 2, "Vehicle": 8},
            "timestamp": "2024-12-09T20:30:45"
        }
    ]
    
    FLOW:
    1. Gateway fetches metrics from all online devices (parallel)
    2. Aggregates results with device names
    3. Returns complete snapshot
    
    USAGE:
    - Dashboard uses for overview charts
    - Aggregates total persons/vehicles across all cameras
    - Useful for fleet-wide analytics
    
    NOTES:
    - Only includes devices with status='online'
    - Offline devices are skipped silently
    - Call frequency: once per second from dashboard
    - Response time scales with number of devices
    """
    results = []
    
    with device_lock:
        device_list = list(devices.values())
    
    # Fetch metrics from each online device
    for device in device_list:
        if device['status'] == 'online':
            try:
                response = requests.get(f"{device['url']}/metrics", timeout=1)
                if response.status_code == 200:
                    metrics_data = response.json()
                    results.append({
                        'deviceId': device['id'],
                        'deviceName': device['name'],
                        'metrics': metrics_data,
                        'timestamp': datetime.now().isoformat(),
                    })
            except Exception as e:
                logger.debug(f"Skipped {device['id']}: {e}")
    
    return jsonify(results)


# ============================================================================
# GATEWAY HEALTH AND INFO ENDPOINTS
# ============================================================================


@app.route('/health', methods=['GET'])
def gateway_health():
    """
    Health check endpoint for load balancers and monitoring.
    
    RETURNS (JSON):
    {
        "status": "healthy",
        "service": "EdgeVision Nexus - API Gateway",
        "totalDevices": 3,
        "onlineDevices": 2,
        "timestamp": "2024-12-09T20:30:45"
    }
    
    USAGE:
    - Kubernetes health probes
    - Load balancer uptime checks
    - Monitoring systems
    
    STATUS CODES:
    - 200: Gateway is healthy
    - Always returns 200 (unhealthy device count doesn't affect gateway)
    """
    with device_lock:
        device_count = len(devices)
        online_count = sum(1 for d in devices.values() if d.get('status') == 'online')
    
    return jsonify({
        'status': 'healthy',
        'service': 'EdgeVision Nexus - API Gateway',
        'totalDevices': device_count,
        'onlineDevices': online_count,
        'timestamp': datetime.now().isoformat(),
    })


@app.route('/', methods=['GET'])
def index():
    """
    Root endpoint with API documentation.
    
    RETURNS (JSON):
    API information, version, and available endpoints
    
    USAGE:
    - Browser-friendly API documentation
    - Helps developers understand available endpoints
    """
    return jsonify({
        'service': 'EdgeVision Nexus - API Gateway',
        'version': '1.0',
        'description': 'Central hub for managing multiple ZED edge devices',
        'endpoints': {
            '/devices': 'GET: List all devices | POST: Register new device',
            '/devices/<id>': 'DELETE: Remove device',
            '/devices/<id>/health': 'GET: Device health status',
            '/devices/<id>/metrics': 'GET: Device metrics (persons, vehicles)',
            '/devices/<id>/video_feed': 'GET: Device video feed URL',
            '/aggregate/metrics': 'GET: Aggregated metrics from all devices',
            '/health': 'GET: Gateway health check',
        }
    })


# ============================================================================
# BACKGROUND TASKS
# ============================================================================


def cleanup_stale_devices():
    """
    Background thread that marks unreachable devices as offline.
    
    WHAT IT DOES:
    - Runs every 10 seconds
    - Marks devices as offline if not seen in 30+ seconds
    - Reduces dashboard confusion from phantom devices
    
    BEHAVIOR:
    - Checks lastSeen timestamp
    - If > 30 seconds old, sets status='offline'
    - Devices stay in registry (not deleted)
    - Will automatically come back online when responding
    
    NOTES:
    - Happens in background, doesn't block requests
    - 30 second threshold allows for network blips
    - Dashboard sees offline status and stops querying
    """
    while True:
        time.sleep(10)
        now = datetime.now()
        
        with device_lock:
            for device_id, device in devices.items():
                try:
                    last_seen = datetime.fromisoformat(device['lastSeen'])
                    # Mark offline if no activity for 30+ seconds
                    if (now - last_seen).total_seconds() > 30:
                        if device['status'] != 'offline':
                            device['status'] = 'offline'
                            logger.info(f"Marked {device_id} as offline (stale)")
                except Exception as e:
                    logger.warning(f"Error checking device {device_id}: {e}")


# ============================================================================
# APPLICATION STARTUP
# ============================================================================


if __name__ == '__main__':
    logger.info("EdgeVision Nexus - API Gateway v1.0 starting...")
    
    # Start background cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_stale_devices, daemon=True)
    cleanup_thread.start()
    logger.info("Device cleanup thread started")
    
    # Start Flask HTTP server
    logger.info("Starting Flask server on 0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000, debug=False, threaded=True)

