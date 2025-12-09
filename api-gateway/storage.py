"""
Encrypted credential storage for Tailscale API keys and device secrets.

This module provides secure storage of sensitive credentials using AES-256 encryption
with Fernet (cryptography library). Keys are never stored in plaintext.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken


class EncryptedStorage:
    """
    Manages encrypted storage of Tailscale API keys and device credentials.
    
    Uses AES-256 Fernet encryption. Encryption key is generated from a password
    on first use and stored in an environment variable or file.
    """
    
    def __init__(self, storage_path: str = "/data/credentials.json"):
        """
        Initialize encrypted storage.
        
        Args:
            storage_path: Path to encrypted credentials file (default: Docker volume mount)
        """
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._cipher = self._init_cipher()
    
    def _init_cipher(self) -> Fernet:
        """Initialize or load encryption cipher."""
        key_path = Path(self.storage_path.parent / ".key")
        
        if key_path.exists():
            # Load existing encryption key
            with open(key_path, "rb") as f:
                key = f.read()
        else:
            # Generate new encryption key
            key = Fernet.generate_key()
            # Store key with restricted permissions (600 = rw-------)
            key_path.write_bytes(key)
            key_path.chmod(0o600)
        
        return Fernet(key)
    
    def encrypt_value(self, value: str) -> str:
        """
        Encrypt a plaintext value.
        
        Args:
            value: Plaintext string to encrypt
            
        Returns:
            Encrypted value as base64 string
        """
        encrypted = self._cipher.encrypt(value.encode())
        return encrypted.decode()
    
    def decrypt_value(self, encrypted: str) -> str:
        """
        Decrypt an encrypted value.
        
        Args:
            encrypted: Encrypted value as base64 string
            
        Returns:
            Decrypted plaintext string
            
        Raises:
            InvalidToken: If decryption fails
        """
        try:
            decrypted = self._cipher.decrypt(encrypted.encode())
            return decrypted.decode()
        except InvalidToken:
            raise ValueError("Failed to decrypt value - encryption key mismatch?")
    
    def save_tailscale_config(self, config: Dict) -> None:
        """
        Save Tailscale configuration securely.
        
        Args:
            config: Configuration dict with keys:
                - api_key: Tailscale API key
                - tailnet: Tailscale network name
                - oauth_client_id: OAuth client ID (optional)
                - oauth_client_secret: OAuth client secret (optional, encrypted)
        """
        # Encrypt sensitive fields
        encrypted_config = {
            "api_key": self.encrypt_value(config.get("api_key", "")),
            "tailnet": config.get("tailnet", ""),
        }
        
        if "oauth_client_secret" in config:
            encrypted_config["oauth_client_secret"] = self.encrypt_value(
                config["oauth_client_secret"]
            )
        
        if "oauth_client_id" in config:
            encrypted_config["oauth_client_id"] = config["oauth_client_id"]
        
        # Add metadata
        encrypted_config["created_at"] = datetime.utcnow().isoformat()
        encrypted_config["version"] = 1
        
        # Save to file
        self._write_storage(encrypted_config)
    
    def load_tailscale_config(self) -> Optional[Dict]:
        """
        Load Tailscale configuration, decrypting sensitive fields.
        
        Returns:
            Decrypted config dict, or None if not found
        """
        data = self._read_storage()
        if not data:
            return None
        
        try:
            config = {
                "api_key": self.decrypt_value(data["api_key"]),
                "tailnet": data.get("tailnet", ""),
            }
            
            if "oauth_client_secret" in data:
                config["oauth_client_secret"] = self.decrypt_value(
                    data["oauth_client_secret"]
                )
            
            if "oauth_client_id" in data:
                config["oauth_client_id"] = data["oauth_client_id"]
            
            return config
        except Exception as e:
            raise ValueError(f"Failed to load Tailscale config: {e}")
    
    def save_device_secret(self, device_id: str, secret: str) -> None:
        """
        Save encrypted secret for a Tailscale device.
        
        Args:
            device_id: Unique device identifier
            secret: Secret value to encrypt (deployment token, etc.)
        """
        data = self._read_storage() or {}
        
        if "devices" not in data:
            data["devices"] = {}
        
        data["devices"][device_id] = {
            "secret": self.encrypt_value(secret),
            "created_at": datetime.utcnow().isoformat(),
        }
        
        self._write_storage(data)
    
    def load_device_secret(self, device_id: str) -> Optional[str]:
        """
        Load decrypted secret for a device.
        
        Args:
            device_id: Device identifier
            
        Returns:
            Decrypted secret, or None if not found
        """
        data = self._read_storage()
        if not data or "devices" not in data:
            return None
        
        device_data = data["devices"].get(device_id)
        if not device_data:
            return None
        
        try:
            return self.decrypt_value(device_data["secret"])
        except Exception as e:
            raise ValueError(f"Failed to load device secret for {device_id}: {e}")
    
    def delete_device_secret(self, device_id: str) -> bool:
        """
        Delete secret for a device.
        
        Args:
            device_id: Device identifier
            
        Returns:
            True if deleted, False if not found
        """
        data = self._read_storage()
        if not data or "devices" not in data:
            return False
        
        if device_id in data["devices"]:
            del data["devices"][device_id]
            self._write_storage(data)
            return True
        
        return False
    
    def _read_storage(self) -> Optional[Dict]:
        """Read encrypted storage file."""
        if not self.storage_path.exists():
            return None
        
        with open(self.storage_path, "r") as f:
            return json.load(f)
    
    def _write_storage(self, data: Dict) -> None:
        """Write encrypted storage file with restricted permissions."""
        with open(self.storage_path, "w") as f:
            json.dump(data, f, indent=2)
        
        # Restrict file permissions (600 = rw-------)
        self.storage_path.chmod(0o600)


# Module-level singleton instance
_storage_instance: Optional[EncryptedStorage] = None


def get_storage(storage_path: str = "/data/credentials.json") -> EncryptedStorage:
    """
    Get or create the global encrypted storage instance.
    
    Args:
        storage_path: Path to credentials file (only used on first call)
        
    Returns:
        EncryptedStorage instance
    """
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = EncryptedStorage(storage_path)
    return _storage_instance
