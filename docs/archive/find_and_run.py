#!/usr/bin/env python3
"""
Find available port and run Next.js app
Automatically allocates ports for multiple instances
"""

import sys
import os
import subprocess

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '_shared_templates'))

try:
    from port_utils import find_available_port, save_app_port, DEFAULT_PORTS
    PORT_UTILS_AVAILABLE = True
except ImportError:
    PORT_UTILS_AVAILABLE = False
    print("⚠️ Port utilities not available - using default port 4090")

def main():
    """Find available port and start Next.js app"""
    
    if PORT_UTILS_AVAILABLE:
        # Get available port starting from 4090
        preferred_port = DEFAULT_PORTS.get('project-hub', 4090)
        port = find_available_port(preferred_port)
        print(f"\n✅ Allocated port {port} for Meddey Tech Workspace (preferred: {preferred_port})")
        
        # Save port information for other apps
        workspace_root = os.path.join(os.path.dirname(__file__), '..')
        save_app_port('project-hub', port, workspace_root)
    else:
        # Fallback to default
        port = 4090
        print(f"\n⚠️ Using default port {port}\n")
    
    # Display network access information with Network IP as PRIMARY
    print("="*60)
    print("  Meddey Tech Workspace - Access URLs")
    print("="*60)
    
    # Try to get network IP first (PRIMARY)
    network_ip = None
    try:
        import socket
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        
        # Try to get all IP addresses and find the best one
        try:
            import subprocess as sp
            result = sp.run(['ipconfig'], capture_output=True, text=True, shell=True)
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                for line in lines:
                    if 'IPv4' in line and ('192.168' in line or '10.' in line or '172.' in line):
                        ip = line.split(':')[-1].strip()
                        if ip and '.' in ip:
                            network_ip = ip
                            break
        except:
            pass
        
        # Fallback to hostname IP if no specific network IP found
        if not network_ip:
            network_ip = local_ip
    except:
        pass
    
    # Display PRIMARY URL (Network IP)
    if network_ip:
        print(f"\n  🌐 PRIMARY URL (Share this with others):")
        print(f"    ➜ http://{network_ip}:{port}")
        print(f"\n  📍 Local alternatives (this PC only):")
        print(f"    • http://localhost:{port}")
        print(f"    • http://127.0.0.1:{port}")
    else:
        print(f"\n  📍 Local access:")
        print(f"    • http://localhost:{port}")
        print(f"    • http://127.0.0.1:{port}")
        print(f"\n  🌐 Network access:")
        print(f"    • http://YOUR_IP_ADDRESS:{port}")
        print(f"    (Run 'ipconfig' to find your IP address)")
    
    print(f"\n  ℹ️  NETWORK INFO:")
    print(f"    • Port {port} auto-allocated and ready")
    print(f"    • Multi-user support enabled")
    print(f"    • Share the PRIMARY URL with team members")
    print(f"    • All devices must be on same network")
    print(f"    • If blocked, run CONFIGURE_FIREWALL_ALL.bat")
    print("="*60 + "\n")
    
    # Set environment variables for Next.js
    env = os.environ.copy()
    env['PORT'] = str(port)
    env['HOST'] = '0.0.0.0'  # Bind to all network interfaces
    env['HOSTNAME'] = '0.0.0.0'
    
    # Change to project directory
    project_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check if npm is available
    try:
        npm_check = subprocess.run(
            ['npm', '--version'],
            capture_output=True,
            shell=True,
            check=False
        )
        if npm_check.returncode != 0:
            print("\n❌ Error: npm is not installed or not in PATH")
            print("   Please install Node.js from https://nodejs.org/")
            return 1
    except Exception as e:
        print(f"\n❌ Error: Cannot find npm: {e}")
        print("   Please install Node.js from https://nodejs.org/")
        return 1
    
    # Check if node_modules exists, install if needed
    node_modules_path = os.path.join(project_dir, 'node_modules')
    if not os.path.exists(node_modules_path):
        print("\n📦 Installing dependencies (first time setup)...")
        try:
            subprocess.run(
                ['npm', 'install'],
                cwd=project_dir,
                env=env,
                shell=True,
                check=True
            )
            print("✅ Dependencies installed successfully\n")
        except subprocess.CalledProcessError as e:
            print(f"\n❌ Error installing dependencies: {e}")
            return 1
    
    # Start Next.js development server
    print(f"🚀 Starting Next.js development server on port {port}...\n")
    try:
        subprocess.run(
            ['npm', 'run', 'dev'],
            cwd=project_dir,
            env=env,
            shell=True,
            check=True
        )
    except KeyboardInterrupt:
        print("\n\n✅ Meddey Tech Workspace stopped")
    except FileNotFoundError:
        print("\n❌ Error: npm command not found")
        print("   Please ensure Node.js is installed and npm is in your PATH")
        print("   Download from: https://nodejs.org/")
        return 1
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error starting Meddey Tech Workspace: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
