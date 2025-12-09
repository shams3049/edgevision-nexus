"""
Flask Blueprint for Tailscale device management endpoints.

Provides REST API endpoints for discovering remote Tailscale devices,
managing device deployments, and monitoring metrics from remote CV apps.
"""

import json
import logging
import os
from typing import Dict, Tuple

import requests
from flask import Blueprint, jsonify, request

from storage import get_storage
from tailscale_client import TailscaleClient, TailscaleAPIError


logger = logging.getLogger(__name__)

# Create Blueprint
tailscale_bp = Blueprint("tailscale", __name__, url_prefix="/api/tailscale")

# Sidecar configuration
SIDECAR_URL = os.environ.get("SIDECAR_URL", "http://ts-sidecar:9000")


# Helper functions
def get_tailscale_client() -> TailscaleClient:
    """Get authenticated Tailscale client."""
    storage = get_storage()
    config = storage.load_tailscale_config()
    
    if not config:
        raise ValueError("Tailscale not configured. Set API key first.")
    
    return TailscaleClient(config["api_key"], config["tailnet"])


def error_response(message: str, status: int = 400) -> Tuple[Dict, int]:
    """Generate error JSON response."""
    logger.error(message)
    return jsonify({"error": message, "status": "error"}), status


# Configuration Endpoints
# =====================

@tailscale_bp.route("/config", methods=["GET"])
def get_config():
    """
    Get current Tailscale configuration (without secrets).
    
    Returns:
        {
            "configured": bool,
            "tailnet": str (if configured),
            "error": str (if not configured)
        }
    """
    try:
        storage = get_storage()
        config = storage.load_tailscale_config()
        
        if not config:
            return jsonify({
                "configured": False,
                "error": "Tailscale not configured"
            })
        
        return jsonify({
            "configured": True,
            "tailnet": config.get("tailnet", ""),
        })
    
    except Exception as e:
        return error_response(f"Failed to load config: {str(e)}", 500)


@tailscale_bp.route("/config", methods=["POST"])
def set_config():
    """
    Configure Tailscale API credentials.
    
    Request body:
        {
            "api_key": str (required),
            "tailnet": str (required),
            "oauth_client_id": str (optional),
            "oauth_client_secret": str (optional)
        }
    
    Returns:
        {
            "configured": true,
            "tailnet": str,
            "message": "Tailscale configured successfully"
        }
    """
    try:
        data = request.get_json() or {}
        api_key = data.get("api_key", "").strip()
        tailnet = data.get("tailnet", "").strip()
        
        if not api_key or not tailnet:
            return error_response("Missing required fields: api_key, tailnet")
        
        # Validate by attempting to list devices
        try:
            client = TailscaleClient(api_key, tailnet)
            client.get_devices()
        except TailscaleAPIError as e:
            return error_response(f"Invalid Tailscale credentials: {e.message}", 401)
        
        # Save configuration
        storage = get_storage()
        config = {
            "api_key": api_key,
            "tailnet": tailnet,
        }
        
        if "oauth_client_id" in data:
            config["oauth_client_id"] = data["oauth_client_id"]
        if "oauth_client_secret" in data:
            config["oauth_client_secret"] = data["oauth_client_secret"]
        
        storage.save_tailscale_config(config)
        
        logger.info(f"Tailscale configured for tailnet: {tailnet}")
        return jsonify({
            "configured": True,
            "tailnet": tailnet,
            "message": "Tailscale configured successfully"
        })
    
    except Exception as e:
        return error_response(f"Configuration failed: {str(e)}", 500)


# Device Discovery Endpoints
# ==========================

@tailscale_bp.route("/devices", methods=["GET"])
def list_devices():
    """
    List all devices in Tailscale network.
    
    Query params:
        - force_refresh: bool (default: false) - bypass cache
    
    Returns:
        {
            "devices": [
                {
                    "id": str,
                    "name": str,
                    "hostname": str,
                    "os": str,
                    "addresses": [str],
                    "online": bool,
                    "last_seen": str (ISO timestamp),
                    "authorized": bool,
                    "can_ssh": bool
                },
                ...
            ],
            "count": int,
            "status": "success"
        }
    """
    try:
        force_refresh = request.args.get("force_refresh", "false").lower() == "true"
        
        client = get_tailscale_client()
        devices = client.get_devices(force_refresh=force_refresh)
        
        # Enhance with SSH accessibility info
        enhanced_devices = []
        for device in devices:
            enhanced = device.copy()
            
            # Check if we can SSH to the device
            try:
                enhanced["can_ssh"] = client.check_ssh_access(device["id"])
            except Exception as e:
                logger.debug(f"Could not check SSH for {device['id']}: {e}")
                enhanced["can_ssh"] = False
            
            enhanced_devices.append(enhanced)
        
        return jsonify({
            "devices": enhanced_devices,
            "count": len(enhanced_devices),
            "status": "success"
        })
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to list devices: {str(e)}", 500)


@tailscale_bp.route("/devices/<device_id>", methods=["GET"])
def get_device(device_id: str):
    """
    Get details for a specific device.
    
    Returns:
        {
            "device": {...device details...},
            "can_ssh": bool,
            "status": "success"
        }
    """
    try:
        client = get_tailscale_client()
        device = client.get_device(device_id)
        
        # Check SSH access
        can_ssh = client.check_ssh_access(device_id)
        
        return jsonify({
            "device": device,
            "can_ssh": can_ssh,
            "status": "success"
        })
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get device: {str(e)}", 500)


# Device Management Endpoints
# ===========================

@tailscale_bp.route("/devices/<device_id>/authorize", methods=["POST"])
def authorize_device(device_id: str):
    """
    Authorize a pending device to join the network.
    
    Returns:
        {
            "device": {...updated device...},
            "message": "Device authorized successfully",
            "status": "success"
        }
    """
    try:
        client = get_tailscale_client()
        device = client.authorize_device(device_id)
        
        return jsonify({
            "device": device,
            "message": "Device authorized successfully",
            "status": "success"
        })
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to authorize device: {str(e)}", 500)


@tailscale_bp.route("/devices/<device_id>/remove", methods=["POST"])
def remove_device(device_id: str):
    """
    Remove a device from the network.
    
    Returns:
        {
            "message": "Device removed successfully",
            "status": "success"
        }
    """
    try:
        client = get_tailscale_client()
        client.remove_device(device_id)
        
        # Also remove any stored secrets for this device
        storage = get_storage()
        storage.delete_device_secret(device_id)
        
        return jsonify({
            "message": "Device removed successfully",
            "status": "success"
        })
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to remove device: {str(e)}", 500)


# Deployment Endpoints
# ====================

@tailscale_bp.route("/devices/<device_id>/deploy", methods=["POST"])
def deploy_app(device_id: str):
    """
    Deploy a CV application to a remote device via SSH.
    
    Request body:
        {
            "app_type": str ("zed", "yolo", "custom"),
            "app_url": str (Docker image URL or git repo),
            "config": dict (optional app-specific configuration)
        }
    
    Returns:
        {
            "device_id": str,
            "app_type": str,
            "status": "deploying|success|error",
            "message": str,
            "execution_id": str (unique deployment ID for tracking)
        }
    """
    try:
        # Phase 2 minimal path: accept provided device_id without extra Tailscale detail lookup
        # (Some tailnets/ACLs block per-device read; we allow deploy to proceed regardless.)
        
        data = request.get_json() or {}
        app_type = data.get("app_type", "").strip()
        app_url = data.get("app_url", "").strip()
        config = data.get("config", {})
        
        if not app_type or not app_url:
            return error_response("Missing required fields: app_type, app_url")
        
        # Validate app_type
        valid_types = ["zed", "yolo", "custom"]
        if app_type not in valid_types:
            return error_response(
                f"Invalid app_type. Must be one of: {', '.join(valid_types)}"
            )
        
        logger.info(f"Deploy request: {app_type} to {device_id}")

        # Get device IP address from Tailscale
        client = get_tailscale_client()
        devices = client.get_devices()
        target_device = next((d for d in devices if d["id"] == device_id), None)
        
        if not target_device:
            return error_response(f"Device {device_id} not found in Tailscale network", 404)
        
        device_ip = target_device.get("addresses", [])[0] if target_device.get("addresses") else None
        if not device_ip:
            return error_response(f"No IP address found for device {device_id}", 400)
        
        logger.info(f"Deploying to {target_device.get('hostname', device_id)} at {device_ip}")

        # Phase 2: call sidecar SSH exec endpoint (using device IP, not ID)
        sidecar_payload = {
            "device_id": device_ip,  # Pass IP address instead of numeric ID
            "command": ["deploy", app_type, app_url],
        }
        if config:
            # Pass config as JSON string appended to command for now
            sidecar_payload["command"].append(json.dumps(config))

        try:
            resp = requests.post(f"{SIDECAR_URL}/ssh/exec", json=sidecar_payload, timeout=5)
            resp.raise_for_status()
            data = resp.json()
            execution_id = data.get("execution_id", "") or f"exec-{device_id}"
            status = data.get("status", "accepted")
            message = data.get("message", "Deployment dispatched to sidecar")
        except Exception as e:
            logger.error(f"Sidecar deploy call failed: {e}")
            return error_response(f"Sidecar deploy failed: {e}", 502)

        # Persist execution id for tracking
        storage = get_storage()
        storage.save_device_secret(device_id, execution_id)

        return jsonify({
            "device_id": device_id,
            "app_type": app_type,
            "status": status,
            "message": message,
            "execution_id": execution_id
        }), 202
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Deployment failed: {str(e)}", 500)


@tailscale_bp.route("/devices/<device_id>/deployment/<execution_id>", methods=["GET"])
def get_deployment_status(device_id: str, execution_id: str):
    """
    Get deployment status.
    
    Returns:
        {
            "execution_id": str,
            "device_id": str,
            "status": "deploying|success|error",
            "output": str (if available),
            "error": str (if failed)
        }
    """
    try:
        # Query Go sidecar for deployment status
        try:
            resp = requests.get(
                f"{SIDECAR_URL}/deployments/status",
                params={"id": execution_id},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status", "unknown")
            message = data.get("message", "")
        except Exception as e:
            logger.error(f"Sidecar deployment status failed: {e}")
            # Fallback to stored token
            storage = get_storage()
            secret = storage.load_device_secret(device_id)
            status = "success" if secret == execution_id else "error"
            message = f"Sidecar unreachable; fallback status {status}"
        
        return jsonify({
            "execution_id": execution_id,
            "device_id": device_id,
            "status": status,
            "message": message
        })
    
    except Exception as e:
        return error_response(f"Failed to get deployment status: {str(e)}", 500)


# Metrics & Monitoring Endpoints
# ==============================

@tailscale_bp.route("/devices/<device_id>/metrics", methods=["GET"])
def get_device_metrics(device_id: str):
    """
    Get metrics from a remote device's CV application.
    
    This endpoint will be proxied through the Go sidecar which handles
    SSH tunneling to the remote device.
    
    Query params:
        - metric_type: str (optional) - filter by metric type
    
    Returns:
        {
            "device_id": str,
            "metrics": {...metrics from remote device...},
            "timestamp": str (ISO timestamp),
            "status": "success|error"
        }
    """
    try:
        client = get_tailscale_client()
        device = client.get_device(device_id)
        
        try:
            resp = requests.get(
                f"{SIDECAR_URL}/metrics",
                params={"device_id": device_id},
                timeout=5,
            )
            if resp.status_code == 404:
                return jsonify({
                    "device_id": device_id,
                    "status": "pending",
                    "message": "Sidecar metrics endpoint not implemented yet",
                    "device_name": device.get("name", "")
                })
            resp.raise_for_status()
            data = resp.json()
            return jsonify({
                "device_id": device_id,
                "status": data.get("status", "success"),
                "metrics": data.get("metrics", {}),
                "timestamp": data.get("timestamp"),
            })
        except Exception as e:
            return error_response(f"Failed to proxy metrics via sidecar: {e}", 502)
    
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        return error_response(f"Failed to get metrics: {str(e)}", 500)


# Health Check Endpoint
# ====================

@tailscale_bp.route("/health", methods=["GET"])
def health():
    """
    Health check for Tailscale integration.
    
    Returns:
        {
            "status": "healthy|degraded|unhealthy",
            "tailscale_configured": bool,
            "api_reachable": bool,
            "message": str
        }
    """
    try:
        storage = get_storage()
        config = storage.load_tailscale_config()
        
        if not config:
            return jsonify({
                "status": "degraded",
                "tailscale_configured": False,
                "api_reachable": False,
                "message": "Tailscale not configured"
            })
        
        # Try to reach Tailscale API
        try:
            client = get_tailscale_client()
            client.get_devices()
            
            return jsonify({
                "status": "healthy",
                "tailscale_configured": True,
                "api_reachable": True,
                "message": "Tailscale integration healthy"
            })
        
        except Exception as e:
            return jsonify({
                "status": "degraded",
                "tailscale_configured": True,
                "api_reachable": False,
                "message": f"Tailscale API unreachable: {str(e)}"
            })
    
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "tailscale_configured": False,
            "api_reachable": False,
            "message": f"Health check failed: {str(e)}"
        }), 500
