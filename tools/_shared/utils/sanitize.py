"""
Input Sanitization Utilities for Python Applications
Provides security functions for validating and sanitizing user inputs
"""
import re
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """
    Sanitize filename to prevent path traversal and invalid characters
    
    Args:
        filename: Original filename
        max_length: Maximum allowed length
        
    Returns:
        Sanitized filename safe for filesystem operations
    """
    # Remove any path components
    filename = os.path.basename(filename)
    
    # Remove or replace dangerous characters
    # Keep alphanumeric, dots, dashes, underscores
    filename = re.sub(r'[^\w\s.-]', '', filename)
    
    # Remove leading/trailing whitespace and dots
    filename = filename.strip('. ')
    
    # Replace multiple dots with single dot
    filename = re.sub(r'\.+', '.', filename)
    
    # Ensure filename is not empty
    if not filename:
        filename = 'unnamed_file'
    
    # Truncate to max length while preserving extension
    if len(filename) > max_length:
        name, ext = os.path.splitext(filename)
        max_name_length = max_length - len(ext)
        filename = name[:max_name_length] + ext
    
    return filename


def validate_file_type(filename: str, allowed_extensions: List[str]) -> bool:
    """
    Validate file extension against allowed types
    
    Args:
        filename: File name to validate
        allowed_extensions: List of allowed extensions (e.g., ['xlsx', 'csv'])
        
    Returns:
        True if file type is allowed, False otherwise
    """
    if not filename or '.' not in filename:
        return False
    
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in [e.lower() for e in allowed_extensions]


def validate_file_size(file_size: int, max_size_mb: int = 100) -> bool:
    """
    Validate file size against maximum allowed size
    
    Args:
        file_size: File size in bytes
        max_size_mb: Maximum allowed size in megabytes
        
    Returns:
        True if size is within limit, False otherwise
    """
    max_size_bytes = max_size_mb * 1024 * 1024
    return file_size <= max_size_bytes


def sanitize_path(path: str, base_dir: str) -> Optional[str]:
    """
    Sanitize and validate path to prevent directory traversal
    
    Args:
        path: Path to sanitize
        base_dir: Base directory that path must be within
        
    Returns:
        Sanitized absolute path if valid, None if path traversal detected
    """
    # Resolve to absolute path
    abs_path = os.path.abspath(os.path.join(base_dir, path))
    abs_base = os.path.abspath(base_dir)
    
    # Check if path is within base directory
    if not abs_path.startswith(abs_base):
        return None
    
    return abs_path


def escape_html(text: str) -> str:
    """
    Escape HTML special characters to prevent XSS
    
    Args:
        text: Text to escape
        
    Returns:
        HTML-escaped text
    """
    html_escape_table = {
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#x27;",
        ">": "&gt;",
        "<": "&lt;",
    }
    return "".join(html_escape_table.get(c, c) for c in text)


def sanitize_dict(data: Dict[str, Any], remove_null: bool = True) -> Dict[str, Any]:
    """
    Sanitize dictionary by removing null values and dangerous patterns
    
    Args:
        data: Dictionary to sanitize
        remove_null: Whether to remove None/null values
        
    Returns:
        Sanitized dictionary
    """
    sanitized = {}
    
    for key, value in data.items():
        # Skip None values if configured
        if remove_null and value is None:
            continue
        
        # Recursively sanitize nested dicts
        if isinstance(value, dict):
            sanitized[key] = sanitize_dict(value, remove_null)
        # Recursively sanitize lists
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_dict(item, remove_null) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    
    return sanitized


def validate_upload_file(file, allowed_extensions: List[str], max_size_mb: int = 100) -> tuple:
    """
    Comprehensive file upload validation
    
    Args:
        file: File object from request
        allowed_extensions: List of allowed file extensions
        max_size_mb: Maximum file size in MB
        
    Returns:
        Tuple of (is_valid, error_message, sanitized_filename)
    """
    # Check if file exists
    if not file or not file.filename:
        return False, "No file provided", None
    
    # Sanitize filename
    safe_filename = sanitize_filename(file.filename)
    
    # Validate file extension
    if not validate_file_type(safe_filename, allowed_extensions):
        return False, f"Invalid file type. Allowed: {', '.join(allowed_extensions)}", None
    
    # Check file size if available
    if hasattr(file, 'content_length') and file.content_length:
        if not validate_file_size(file.content_length, max_size_mb):
            return False, f"File too large. Maximum size: {max_size_mb}MB", None
    
    return True, None, safe_filename


def normalize_sku(sku: str) -> str:
    """
    Normalize SKU format for consistency
    
    Args:
        sku: Product SKU
        
    Returns:
        Normalized SKU (uppercase, trimmed)
    """
    if not sku:
        return ""
    
    # Convert to uppercase and remove whitespace
    normalized = str(sku).upper().strip()
    
    # Remove special characters except dashes and underscores
    normalized = re.sub(r'[^\w-]', '', normalized)
    
    return normalized