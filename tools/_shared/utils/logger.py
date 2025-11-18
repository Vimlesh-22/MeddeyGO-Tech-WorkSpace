"""
Structured JSON Logger for Python Applications
Provides consistent logging across all Python backends with JSON formatting
"""
import json
import logging
import sys
from datetime import datetime
from typing import Any, Dict, Optional

class StructuredLogger:
    """JSON structured logger with multiple severity levels"""
    
    def __init__(self, app_name: str, level: str = "INFO"):
        self.app_name = app_name
        self.logger = logging.getLogger(app_name)
        
        # Set level
        level_map = {
            "DEBUG": logging.DEBUG,
            "INFO": logging.INFO,
            "WARN": logging.WARNING,
            "ERROR": logging.ERROR,
            "FATAL": logging.CRITICAL
        }
        self.logger.setLevel(level_map.get(level.upper(), logging.INFO))
        
        # Remove existing handlers
        self.logger.handlers = []
        
        # Add JSON formatter handler
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(self._get_json_formatter())
        self.logger.addHandler(handler)
    
    def _get_json_formatter(self):
        """Create custom JSON formatter"""
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_data = {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "level": record.levelname,
                    "app": record.name,
                    "message": record.getMessage(),
                }
                
                # Add extra fields if present
                if hasattr(record, 'context'):
                    log_data.update(record.context)
                
                # Add exception info if present
                if record.exc_info:
                    log_data["error"] = {
                        "type": record.exc_info[0].__name__,
                        "message": str(record.exc_info[1]),
                        "stack": self.formatException(record.exc_info)
                    }
                
                return json.dumps(log_data)
        
        return JsonFormatter()
    
    def _log(self, level: str, message: str, context: Optional[Dict[str, Any]] = None):
        """Internal log method with context support"""
        extra = {"context": context} if context else {}
        getattr(self.logger, level.lower())(message, extra=extra)
    
    def debug(self, message: str, context: Optional[Dict[str, Any]] = None):
        """Log debug message"""
        self._log("DEBUG", message, context)
    
    def info(self, message: str, context: Optional[Dict[str, Any]] = None):
        """Log info message"""
        self._log("INFO", message, context)
    
    def warn(self, message: str, context: Optional[Dict[str, Any]] = None):
        """Log warning message"""
        self._log("WARNING", message, context)
    
    def error(self, message: str, context: Optional[Dict[str, Any]] = None, exc_info: bool = False):
        """Log error message with optional exception info"""
        extra = {"context": context} if context else {}
        self.logger.error(message, extra=extra, exc_info=exc_info)
    
    def fatal(self, message: str, context: Optional[Dict[str, Any]] = None, exc_info: bool = False):
        """Log fatal error message"""
        extra = {"context": context} if context else {}
        self.logger.critical(message, extra=extra, exc_info=exc_info)


def create_logger(app_name: str, level: str = "INFO") -> StructuredLogger:
    """
    Factory function to create a structured logger
    
    Args:
        app_name: Name of the application
        level: Log level (DEBUG, INFO, WARN, ERROR, FATAL)
    
    Returns:
        StructuredLogger instance
    
    Example:
        logger = create_logger("mer-backend", "INFO")
        logger.info("Server started", {"port": 5000})
        logger.error("Database connection failed", {"db": "mongodb"}, exc_info=True)
    """
    return StructuredLogger(app_name, level)


# Convenience function for quick setup
def setup_logging(app_name: str, level: str = "INFO") -> StructuredLogger:
    """
    Setup and return logger instance
    
    Usage:
        from utils.logger import setup_logging
        logger = setup_logging("my-app")
        logger.info("Application started")
    """
    return create_logger(app_name, level)