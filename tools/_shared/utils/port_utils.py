"""
Thread-safe port allocation utilities with file locking.
Prevents race conditions when multiple applications start simultaneously.
"""
import socket
import json
import os
import time
import fcntl
from pathlib import Path
from typing import Optional, Dict


def is_port_available(port: int) -> bool:
    """
    Check if a port is available for binding.
    
    Args:
        port: Port number to check
        
    Returns:
        True if port is available, False otherwise
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('0.0.0.0', port))
            return True
    except OSError:
        return False


def find_available_port_with_lock(preferred_port: int, max_attempts: int = 100, 
                                   workspace_root: Optional[str] = None) -> int:
    """
    Find an available port with file locking to prevent race conditions.
    
    This function acquires an exclusive lock before checking ports and updating
    the ports registry, ensuring that multiple applications starting simultaneously
    don't allocate the same port.
    
    Args:
        preferred_port: The first port to try
        max_attempts: Maximum number of ports to try
        workspace_root: Root directory of workspace. If None, auto-detects.
        
    Returns:
        Available port number
        
    Raises:
        RuntimeError: If no available port found within max_attempts
    """
    if workspace_root is None:
        workspace_root = Path(__file__).parent.parent.parent
    else:
        workspace_root = Path(workspace_root)
    
    lock_file_path = workspace_root / '.port_allocation.lock'
    ports_file = workspace_root / '.ports.json'
    
    # Ensure lock file exists
    lock_file_path.touch(exist_ok=True)
    
    # Acquire exclusive lock with timeout
    max_wait = 10  # seconds
    start_time = time.time()
    
    with open(lock_file_path, 'r+') as lock_file:
        # Try to acquire lock with timeout
        while True:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break  # Lock acquired
            except BlockingIOError:
                if time.time() - start_time > max_wait:
                    raise RuntimeError("Timeout waiting for port allocation lock")
                time.sleep(0.1)  # Wait 100ms before retry
        
        try:
            # Load currently allocated ports
            allocated_ports = set()
            if ports_file.exists():
                try:
                    with open(ports_file, 'r') as f:
                        ports_data = json.load(f)
                        allocated_ports = {info['port'] for info in ports_data.values()}
                except (json.JSONDecodeError, IOError):
                    pass
            
            # Find available port
            for offset in range(max_attempts):
                port = preferred_port + offset
                
                # Skip if already allocated by another app
                if port in allocated_ports:
                    continue
                
                # Check if port is actually available on the system
                if is_port_available(port):
                    return port
            
            raise RuntimeError(
                f"Could not find available port starting from {preferred_port} "
                f"after {max_attempts} attempts"
            )
        finally:
            # Release lock
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def save_app_port(app_name: str, port: int, workspace_root: Optional[str] = None):
    """
    Save the actual port an application is running on to a shared JSON file.
    This allows other apps (like the dashboard) to discover running services.
    
    Uses file locking to prevent concurrent write conflicts.
    
    Args:
        app_name: Name of the application (e.g., 'project-hub', 'gsheet', 'mer')
        port: The port the application is running on
        workspace_root: Root directory of workspace. If None, auto-detects.
    """
    if workspace_root is None:
        workspace_root = Path(__file__).parent.parent.parent
    else:
        workspace_root = Path(workspace_root)
    
    ports_file = workspace_root / '.ports.json'
    lock_file_path = workspace_root / '.port_allocation.lock'
    
    # Ensure lock file exists
    lock_file_path.touch(exist_ok=True)
    
    with open(lock_file_path, 'r+') as lock_file:
        # Acquire exclusive lock
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        
        try:
            # Load existing ports
            ports_data = {}
            if ports_file.exists():
                try:
                    with open(ports_file, 'r') as f:
                        ports_data = json.load(f)
                except (json.JSONDecodeError, IOError):
                    ports_data = {}
            
            # Update with new port
            ports_data[app_name] = {
                'port': port,
                'url': f'http://localhost:{port}',
                'network_url_template': f'http://{{network_ip}}:{port}',
                'timestamp': time.time()
            }
            
            # Save back to file atomically
            temp_file = ports_file.with_suffix('.json.tmp')
            with open(temp_file, 'w') as f:
                json.dump(ports_data, f, indent=2)
            
            # Atomic rename
            temp_file.replace(ports_file)
            
        finally:
            # Release lock
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def get_app_port(app_name: str, workspace_root: Optional[str] = None) -> Optional[int]:
    """
    Get the port an application is currently running on.
    
    Args:
        app_name: Name of the application
        workspace_root: Root directory of workspace. If None, auto-detects.
        
    Returns:
        Port number if found, None otherwise
    """
    if workspace_root is None:
        workspace_root = Path(__file__).parent.parent.parent
    else:
        workspace_root = Path(workspace_root)
    
    ports_file = workspace_root / '.ports.json'
    
    if not ports_file.exists():
        return None
    
    try:
        with open(ports_file, 'r') as f:
            ports_data = json.load(f)
            if app_name in ports_data:
                return ports_data[app_name]['port']
    except (json.JSONDecodeError, IOError):
        pass
    
    return None


def get_all_app_ports(workspace_root: Optional[str] = None) -> Dict:
    """
    Get all running application ports.
    
    Args:
        workspace_root: Root directory of workspace. If None, auto-detects.
        
    Returns:
        Dictionary mapping app names to port information
    """
    if workspace_root is None:
        workspace_root = Path(__file__).parent.parent.parent
    else:
        workspace_root = Path(workspace_root)
    
    ports_file = workspace_root / '.ports.json'
    
    if not ports_file.exists():
        return {}
    
    try:
        with open(ports_file, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def find_available_port(preferred_port: int, max_attempts: int = 100) -> int:
    """
    Legacy function - redirects to thread-safe version.
    Maintained for backwards compatibility.
    
    Args:
        preferred_port: The first port to try
        max_attempts: Maximum number of ports to try
        
    Returns:
        Available port number
    """
    return find_available_port_with_lock(preferred_port, max_attempts)


# Port configuration for all applications
DEFAULT_PORTS = {
    'project-hub': 4090,
    'gsheet': 4091,
    'data-extractor': 4092,
    'mer': 4093,
    'quote-backend': 4094,
    'quote-frontend': 4095,
    'inventory-backend': 4096,
    'inventory-frontend': 4097,
    'order-id-extractor': 4098,
}


if __name__ == '__main__':
    # Test the utilities
    print("Testing thread-safe port utilities...")
    print(f"Port 4090 available: {is_port_available(4090)}")
    print(f"Port 4091 available: {is_port_available(4091)}")
    
    try:
        available = find_available_port_with_lock(4090)
        print(f"First available port from 4090: {available}")
        
        # Test saving
        save_app_port('test-app', available)
        print(f"Saved port {available} for test-app")
        
        # Test retrieving
        retrieved = get_app_port('test-app')
        print(f"Retrieved port for test-app: {retrieved}")
        
        # Test all ports
        all_ports = get_all_app_ports()
        print(f"All allocated ports: {all_ports}")
        
    except RuntimeError as e:
        print(f"Error: {e}")