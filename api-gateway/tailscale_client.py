"""
Tailscale API client for managing devices and network state.

Provides high-level interface to Tailscale control API for discovering
remote devices, managing deployments, and retrieving network metrics.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import requests


logger = logging.getLogger(__name__)


class TailscaleClient:
    """
    Client for interacting with Tailscale control API.
    
    Handles authentication, device discovery, deployment management,
    and network status queries.
    """
    
    # Tailscale API endpoints
    BASE_URL = "https://api.tailscale.com/api/v2"
    DEVICES_ENDPOINT = "/tailnet/{tailnet}/devices"
    DEVICE_ENDPOINT = "/tailnet/{tailnet}/devices/{device_id}"
    SSH_ENDPOINT = "/tailnet/{tailnet}/ssh/check-access"
    
    def __init__(self, api_key: str, tailnet: str):
        """
        Initialize Tailscale API client.
        
        Args:
            api_key: Tailscale API key (from OAuth or personal token)
            tailnet: Tailscale network name (e.g., "user@tailscale.com")
        """
        self.api_key = api_key
        self.tailnet = tailnet
        self.session = requests.Session()
        self.session.auth = (api_key, "")  # API key as username, empty password
        self.session.headers.update({"User-Agent": "ZED-Tailscale-Manager/1.0"})
        
        # Cache for devices (5 minute TTL)
        self._device_cache: Optional[List[Dict]] = None
        self._cache_time: Optional[datetime] = None
        self._cache_ttl = timedelta(minutes=5)
    
    def _get_url(self, endpoint: str, **kwargs) -> str:
        """Build full API URL."""
        return self.BASE_URL + endpoint.format(tailnet=self.tailnet, **kwargs)
    
    def _handle_response(self, response: requests.Response) -> Dict:
        """
        Handle API response, raising appropriate errors.
        
        Args:
            response: Response object from requests
            
        Returns:
            Parsed JSON response
            
        Raises:
            TailscaleAPIError: If API returns error status
        """
        try:
            data = response.json()
        except Exception:
            data = {}
        
        if response.status_code >= 400:
            error_msg = data.get("message", response.text)
            logger.error(f"Tailscale API error ({response.status_code}): {error_msg}")
            raise TailscaleAPIError(response.status_code, error_msg)
        
        return data
    
    def get_devices(self, force_refresh: bool = False) -> List[Dict]:
        """
        Get all devices in Tailscale network.
        
        Caches results for 5 minutes to avoid rate limiting.
        
        Args:
            force_refresh: Bypass cache and fetch fresh data
            
        Returns:
            List of device dicts with keys:
                - id: Device ID
                - name: Device hostname
                - addresses: List of IP addresses
                - os: Operating system
                - last_seen: Last activity timestamp
                - online: Whether device is currently online
                - hostname: Short hostname
                - authorized: Whether device is authorized
        """
        # Check cache
        if not force_refresh and self._device_cache and self._cache_time:
            if datetime.utcnow() - self._cache_time < self._cache_ttl:
                logger.debug("Using cached device list")
                return self._device_cache
        
        try:
            url = self._get_url(self.DEVICES_ENDPOINT)
            response = self.session.get(url)
            data = self._handle_response(response)
            
            devices = data.get("devices", [])
            
            # Update cache
            self._device_cache = devices
            self._cache_time = datetime.utcnow()
            
            logger.info(f"Retrieved {len(devices)} devices from Tailscale")
            return devices
        
        except Exception as e:
            logger.error(f"Failed to get devices: {e}")
            # Return cached data if available, even if stale
            if self._device_cache:
                logger.warning("Returning stale cached device list")
                return self._device_cache
            raise
    
    def get_device(self, device_id: str) -> Dict:
        """
        Get details for a specific device.
        
        Args:
            device_id: Device ID from Tailscale
            
        Returns:
            Device details dict
        """
        try:
            url = self._get_url(self.DEVICE_ENDPOINT, device_id=device_id)
            response = self.session.get(url)
            return self._handle_response(response)
        except Exception as e:
            logger.error(f"Failed to get device {device_id}: {e}")
            raise
    
    def authorize_device(self, device_id: str) -> Dict:
        """
        Authorize a pending device to join the network.
        
        Args:
            device_id: Device ID to authorize
            
        Returns:
            Updated device details
        """
        try:
            url = self._get_url(self.DEVICE_ENDPOINT, device_id=device_id)
            response = self.session.post(url, json={"authorized": True})
            logger.info(f"Authorized device {device_id}")
            return self._handle_response(response)
        except Exception as e:
            logger.error(f"Failed to authorize device {device_id}: {e}")
            raise
    
    def remove_device(self, device_id: str) -> bool:
        """
        Remove a device from the network.
        
        Args:
            device_id: Device ID to remove
            
        Returns:
            True if successful
        """
        try:
            url = self._get_url(self.DEVICE_ENDPOINT, device_id=device_id)
            response = self.session.delete(url)
            self._handle_response(response)
            logger.info(f"Removed device {device_id}")
            # Invalidate cache
            self._device_cache = None
            return True
        except Exception as e:
            logger.error(f"Failed to remove device {device_id}: {e}")
            raise
    
    def check_ssh_access(self, device_id: str, username: str = "root") -> bool:
        """
        Check if SSH access is available to a device.
        
        Note: The Tailscale API SSH check endpoint may not be available in all versions.
        Currently disabled to avoid 404 errors. Returns True to allow deployment attempts.
        
        Args:
            device_id: Device ID to check
            username: Username to check SSH access for (default: root)
            
        Returns:
            True if SSH access is available
        """
        # SSH check endpoint not available - assume SSH is possible
        # The actual SSH connection will be tested during deployment
        logger.debug(f"SSH access check skipped for {device_id} (API endpoint not available)")
        return True
        
        # Original implementation - disabled due to 404 errors
        # try:
        #     url = self._get_url(self.SSH_ENDPOINT)
        #     response = self.session.post(
        #         url,
        #         json={"checks": {device_id: [username]}}
        #     )
        #     data = self._handle_response(response)
        #     
        #     # Check if user has access
        #     result = data.get("results", {}).get(device_id, {})
        #     access = result.get(username, {})
        #     has_access = access.get("allow", False)
        #     
        #     logger.debug(f"SSH access for {username}@{device_id}: {has_access}")
        #     return has_access
        # 
        # except Exception as e:
        #     logger.warning(f"Failed to check SSH access: {e}")
        #     return False
    
    def clear_cache(self) -> None:
        """Clear device cache (for testing or manual refresh)."""
        self._device_cache = None
        self._cache_time = None
        logger.debug("Device cache cleared")


class TailscaleAPIError(Exception):
    """Exception raised for Tailscale API errors."""
    
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Tailscale API error ({status_code}): {message}")
