import logging
import os
import threading
from pathlib import Path
from logging.handlers import RotatingFileHandler


class AppLogger:
    """Singleton Logger Management for the application."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(AppLogger, cls).__new__(cls)
                cls._instance._initialize()
            return cls._instance

    def _initialize(self):
        # Base logs directory
        log_dir = Path("logs")
        log_dir.mkdir(parents=True, exist_ok=True)

        # Configure logging
        self.logger = logging.getLogger("claimflow")
        self.logger.setLevel(logging.INFO)

        # Prevent multiple handlers from being added
        if not self.logger.handlers:
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
            )

            # File handler
            log_file = log_dir / "app.log"
            file_handler = RotatingFileHandler(
                log_file, maxBytes=10*1024*1024, backupCount=5
            )
            file_handler.setFormatter(formatter)
            file_handler.setLevel(logging.INFO)

            # Console handler
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(formatter)
            console_handler.setLevel(logging.INFO)

            self.logger.addHandler(file_handler)
            self.logger.addHandler(console_handler)

    def get_logger(self):
        return self.logger


# Global instance
logger_instance = AppLogger().get_logger()


def get_app_logger() -> logging.Logger:
    return logger_instance
