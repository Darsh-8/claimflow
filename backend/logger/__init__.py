"""
logger package — ClaimFlow application logger.

Usage anywhere in the backend:

    from logger import get_app_logger
    logger = get_app_logger()

    logger.info("Something happened")
    logger.warning("Watch out")
    logger.error("Something went wrong")
    logger.debug("Verbose detail")

Log files are written to:
    backend/logger/log/YYYY-MM-DD/HH-00.log
"""

from .app_logger import AppLogger, get_app_logger

__all__ = ["AppLogger", "get_app_logger"]
