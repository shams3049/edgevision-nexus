#!/usr/bin/env python3
"""
Integration tests for EdgeVision Nexus backend services.

Tests:
- API Gateway health checks
- Edge node connectivity
- Device registration
- Metrics aggregation
"""

import os
import sys
import json
import unittest
import requests
from pathlib import Path

# Configuration
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
EDGE_NODE_URL = os.getenv("EDGE_NODE_URL", "http://localhost:5000")


class TestGatewayAPI(unittest.TestCase):
    """Test Gateway API endpoints."""

    def test_gateway_health(self):
        """Gateway should respond to health checks."""
        response = requests.get(f"{GATEWAY_URL}/devices")
        self.assertIn(response.status_code, [200, 404])

    def test_device_list(self):
        """Gateway should return device list."""
        response = requests.get(f"{GATEWAY_URL}/devices")
        self.assertIsInstance(response.json(), (dict, list))


class TestEdgeNode(unittest.TestCase):
    """Test Edge Node endpoints."""

    def test_edge_health(self):
        """Edge node should respond to health checks."""
        response = requests.get(f"{EDGE_NODE_URL}/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("status", data)

    def test_edge_metrics(self):
        """Edge node should return metrics."""
        response = requests.get(f"{EDGE_NODE_URL}/metrics")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("persons", data)
        self.assertIn("vehicles", data)

    def test_edge_video_feed(self):
        """Edge node should serve video stream."""
        response = requests.get(f"{EDGE_NODE_URL}/video_feed", stream=True)
        self.assertIn(response.status_code, [200, 206])


class TestIntegration(unittest.TestCase):
    """Test integration between components."""

    def test_gateway_discovers_edge(self):
        """Gateway should discover edge node."""
        # Register edge node
        edge_data = {
            "name": "Test Node",
            "url": EDGE_NODE_URL,
        }
        response = requests.post(
            f"{GATEWAY_URL}/devices",
            json=edge_data
        )
        
        # Should succeed or device already exists
        self.assertIn(response.status_code, [200, 201, 409])

    def test_metrics_flow(self):
        """Metrics should flow from edge to gateway."""
        # Get metrics from edge
        edge_response = requests.get(f"{EDGE_NODE_URL}/metrics")
        self.assertEqual(edge_response.status_code, 200)
        edge_metrics = edge_response.json()
        
        # Metrics should have expected fields
        self.assertIn("persons", edge_metrics)
        self.assertIn("vehicles", edge_metrics)
        
        # Values should be non-negative integers
        self.assertGreaterEqual(edge_metrics["persons"], 0)
        self.assertGreaterEqual(edge_metrics["vehicles"], 0)


if __name__ == "__main__":
    unittest.main()
    
    def tearDown(self):
        """Clean up temporary files."""
        import shutil
        shutil.rmtree(self.temp_dir)
    
    def test_encrypt_decrypt_value(self):
        """Test basic encryption/decryption."""
        plaintext = "secret_api_key_12345"
        encrypted = self.storage.encrypt_value(plaintext)
        decrypted = self.storage.decrypt_value(encrypted)
        
        self.assertNotEqual(encrypted, plaintext)
        self.assertEqual(decrypted, plaintext)
    
    def test_save_load_tailscale_config(self):
        """Test saving and loading Tailscale configuration."""
        config = {
            "api_key": "tskey-api-test123",
            "tailnet": "user@tailscale.com",
            "oauth_client_id": "oauth_test_id",
            "oauth_client_secret": "oauth_test_secret"
        }
        
        self.storage.save_tailscale_config(config)
        loaded = self.storage.load_tailscale_config()
        
        self.assertEqual(loaded["api_key"], config["api_key"])
        self.assertEqual(loaded["tailnet"], config["tailnet"])
        self.assertEqual(loaded["oauth_client_id"], config["oauth_client_id"])
        self.assertEqual(loaded["oauth_client_secret"], config["oauth_client_secret"])
    
    def test_device_secret_lifecycle(self):
        """Test saving, loading, and deleting device secrets."""
        device_id = "node-12345"
        secret = "deployment-token-xyz"
        
        # Save
        self.storage.save_device_secret(device_id, secret)
        
        # Load
        loaded = self.storage.load_device_secret(device_id)
        self.assertEqual(loaded, secret)
        
        # Delete
        deleted = self.storage.delete_device_secret(device_id)
        self.assertTrue(deleted)
        
        # Should not exist
        loaded = self.storage.load_device_secret(device_id)
        self.assertIsNone(loaded)
    
    def test_invalid_decryption(self):
        """Test that invalid encrypted data raises error."""
        with self.assertRaises(ValueError):
            self.storage.decrypt_value("invalid_encrypted_data")
    
    def test_file_permissions(self):
        """Test that credentials file has restricted permissions."""
        config = {"api_key": "test", "tailnet": "test@tailscale.com"}
        self.storage.save_tailscale_config(config)
        
        # Check file permissions (should be 0o600 = rw-------)
        stat_info = os.stat(self.storage_path)
        mode = stat_info.st_mode & 0o777
        
        # Should not be readable/writable by group or others
        self.assertEqual(mode & 0o077, 0)


class TestTailscaleClient(unittest.TestCase):
    """Test Tailscale API client."""
    
    def setUp(self):
        """Create mock Tailscale client."""
        self.api_key = "tskey-api-test"
        self.tailnet = "user@tailscale.com"
        self.client = TailscaleClient(self.api_key, self.tailnet)
    
    @patch('tailscale_client.requests.Session.get')
    def test_get_devices_success(self, mock_get):
        """Test successful device listing."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "devices": [
                {
                    "id": "node-123",
                    "name": "device-1",
                    "hostname": "device-1",
                    "os": "linux",
                    "addresses": ["100.123.45.67"],
                    "online": True,
                    "last_seen": "2024-12-09T10:00:00Z",
                    "authorized": True
                }
            ]
        }
        mock_get.return_value = mock_response
        
        devices = self.client.get_devices()
        
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]["name"], "device-1")
        self.assertTrue(devices[0]["online"])
    
    @patch('tailscale_client.requests.Session.get')
    def test_get_devices_api_error(self, mock_get):
        """Test error handling for API failures."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"message": "Unauthorized"}
        mock_response.text = "Unauthorized"
        mock_get.return_value = mock_response
        
        with self.assertRaises(TailscaleAPIError) as context:
            self.client.get_devices()
        
        self.assertEqual(context.exception.status_code, 401)
    
    @patch('tailscale_client.requests.Session.get')
    def test_device_cache(self, mock_get):
        """Test that devices are cached."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"devices": [{"id": "node-123"}]}
        mock_get.return_value = mock_response
        
        # First call
        devices1 = self.client.get_devices()
        call_count_1 = mock_get.call_count
        
        # Second call should use cache
        devices2 = self.client.get_devices()
        call_count_2 = mock_get.call_count
        
        # Should not have made another API call
        self.assertEqual(call_count_1, call_count_2)
        self.assertEqual(devices1, devices2)
    
    @patch('tailscale_client.requests.Session.post')
    def test_authorize_device(self, mock_post):
        """Test device authorization."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "node-123",
            "authorized": True
        }
        mock_post.return_value = mock_response
        
        result = self.client.authorize_device("node-123")
        
        self.assertTrue(result["authorized"])
        # Verify POST was called with correct params
        mock_post.assert_called_once()
    
    @patch('tailscale_client.requests.Session.delete')
    def test_remove_device(self, mock_delete):
        """Test device removal."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_delete.return_value = mock_response
        
        result = self.client.remove_device("node-123")
        
        self.assertTrue(result)
        mock_delete.assert_called_once()
    
    def test_clear_cache(self):
        """Test cache clearing."""
        self.client._device_cache = [{"id": "node-123"}]
        self.assertIsNotNone(self.client._device_cache)
        
        self.client.clear_cache()
        
        self.assertIsNone(self.client._device_cache)


class TestFlaskRoutes(unittest.TestCase):
    """Test Flask API routes."""
    
    def setUp(self):
        """Set up Flask test client."""
        # Create a minimal Flask app with Tailscale routes
        from flask import Flask
        from tailscale_routes import tailscale_bp
        
        self.app = Flask(__name__)
        self.app.register_blueprint(tailscale_bp)
        self.client = self.app.test_client()
    
    @patch('tailscale_routes.get_storage')
    def test_get_config_not_configured(self, mock_get_storage):
        """Test get config when Tailscale not configured."""
        mock_storage = Mock()
        mock_storage.load_tailscale_config.return_value = None
        mock_get_storage.return_value = mock_storage
        
        response = self.client.get('/api/tailscale/config')
        data = json.loads(response.data)
        
        self.assertEqual(response.status_code, 200)
        self.assertFalse(data["configured"])
    
    @patch('tailscale_routes.get_storage')
    def test_get_config_configured(self, mock_get_storage):
        """Test get config when Tailscale is configured."""
        mock_storage = Mock()
        mock_storage.load_tailscale_config.return_value = {
            "api_key": "tskey-test",
            "tailnet": "user@tailscale.com"
        }
        mock_get_storage.return_value = mock_storage
        
        response = self.client.get('/api/tailscale/config')
        data = json.loads(response.data)
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["configured"])
        self.assertEqual(data["tailnet"], "user@tailscale.com")
    
    @patch('tailscale_routes.get_storage')
    @patch('tailscale_routes.TailscaleClient')
    def test_set_config_success(self, mock_client_class, mock_get_storage):
        """Test setting configuration successfully."""
        mock_storage = Mock()
        mock_get_storage.return_value = mock_storage
        
        mock_client = Mock()
        mock_client.get_devices.return_value = []
        mock_client_class.return_value = mock_client
        
        payload = {
            "api_key": "tskey-test",
            "tailnet": "user@tailscale.com"
        }
        
        response = self.client.post(
            '/api/tailscale/config',
            data=json.dumps(payload),
            content_type='application/json'
        )
        data = json.loads(response.data)
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["configured"])
        mock_storage.save_tailscale_config.assert_called_once()
    
    @patch('tailscale_routes.get_storage')
    def test_set_config_missing_fields(self, mock_get_storage):
        """Test configuration with missing required fields."""
        mock_storage = Mock()
        mock_get_storage.return_value = mock_storage
        
        payload = {"api_key": "tskey-test"}  # Missing tailnet
        
        response = self.client.post(
            '/api/tailscale/config',
            data=json.dumps(payload),
            content_type='application/json'
        )
        data = json.loads(response.data)
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", data)
    
    @patch('tailscale_routes.get_tailscale_client')
    def test_list_devices(self, mock_get_client):
        """Test listing Tailscale devices."""
        mock_client = Mock()
        mock_client.get_devices.return_value = [
            {
                "id": "node-123",
                "name": "device-1",
                "online": True
            }
        ]
        mock_client.check_ssh_access.return_value = True
        mock_get_client.return_value = mock_client
        
        response = self.client.get('/api/tailscale/devices')
        data = json.loads(response.data)
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["count"], 1)
        self.assertTrue(data["devices"][0]["can_ssh"])
    
    @patch('tailscale_routes.get_tailscale_client')
    def test_tailscale_health_healthy(self, mock_get_client):
        """Test health check when Tailscale is configured."""
        mock_client = Mock()
        mock_client.get_devices.return_value = []
        mock_get_client.return_value = mock_client
        
        response = self.client.get('/api/tailscale/health')
        data = json.loads(response.data)
        
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["tailscale_configured"])
        self.assertTrue(data["api_reachable"])


if __name__ == '__main__':
    unittest.main()
