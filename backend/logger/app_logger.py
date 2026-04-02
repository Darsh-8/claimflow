import logging
import threading
import contextvars
from datetime import datetime
from pathlib import Path

# Context variables for request-bound properties
client_ip_cv = contextvars.ContextVar("client_ip", default="-")
req_id_cv = contextvars.ContextVar("req_id", default="-")

class RequestContextFilter(logging.Filter):
    """Injects client IP and request ID into every log record."""
    def filter(self, record):
        record.client_ip = client_ip_cv.get()
        record.req_id = req_id_cv.get()
        return True


class DailyHourlyFileHandler(logging.Handler):
    """
    A logging handler that writes to:
        <base_log_dir>/YYYY-MM-DD/HH-00.log

    Automatically rolls over to a new file at the start of each hour.
    """

    def __init__(self, base_log_dir: Path):
        super().__init__()
        self.base_log_dir = base_log_dir
        self._roll_lock = threading.Lock()
        self._current_hour_key: str = ""
        self._stream = None
        self._open_stream()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _hour_key(self, dt: datetime) -> str:
        """Unique key for each calendar hour, e.g. '2026-04-02-12'."""
        return dt.strftime("%Y-%m-%d-%H")

    def _log_path(self, dt: datetime) -> Path:
        """Compute the absolute path for the current hour's log file."""
        date_dir = self.base_log_dir / dt.strftime("%Y-%m-%d")
        date_dir.mkdir(parents=True, exist_ok=True)
        return date_dir / dt.strftime("%H-00.log")

    def _open_stream(self):
        """Open (or reopen) the stream for the current hour."""
        now = datetime.now()
        self._current_hour_key = self._hour_key(now)
        log_path = self._log_path(now)
        if self._stream:
            try:
                self._stream.close()
            except Exception:
                pass
        self._stream = open(log_path, "a", encoding="utf-8")

    def _rollover_if_needed(self):
        """Check if the hour has changed and rollover if so."""
        now = datetime.now()
        if self._hour_key(now) != self._current_hour_key:
            self._open_stream()

    # ------------------------------------------------------------------
    # logging.Handler interface
    # ------------------------------------------------------------------

    def emit(self, record: logging.LogRecord):
        try:
            with self._roll_lock:
                self._rollover_if_needed()
                msg = self.format(record)
                self._stream.write(msg + "\n")
                self._stream.flush()
        except Exception:
            self.handleError(record)

    def close(self):
        with self._roll_lock:
            if self._stream:
                try:
                    self._stream.close()
                except Exception:
                    pass
                self._stream = None
        super().close()


class AppLogger:
    """
    Thread-safe singleton logger for ClaimFlow.

    Log files are written to:
        backend/logger/log/YYYY-MM-DD/HH-00.log
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialize()
            return cls._instance

    def _initialize(self):
        # Resolve: backend/logger/log/
        base_log_dir = Path(__file__).parent / "log"
        base_log_dir.mkdir(parents=True, exist_ok=True)

        self.logger = logging.getLogger("claimflow")
        self.logger.setLevel(logging.DEBUG)

        # Guard: never add handlers twice (e.g. on hot-reload)
        if self.logger.handlers:
            return

        formatter = logging.Formatter(
            fmt="%(asctime)s | IP:%(client_ip)-15s | REQ:%(req_id)-8s | %(levelname)-8s | %(name)s | [%(filename)s:%(lineno)d] | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        
        req_filter = RequestContextFilter()

        # ── Hourly rotating file handler ──────────────────────────────
        file_handler = DailyHourlyFileHandler(base_log_dir)
        file_handler.setFormatter(formatter)
        file_handler.addFilter(req_filter)
        file_handler.setLevel(logging.DEBUG)     # capture everything to file

        # ── Console handler ───────────────────────────────────────────
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        console_handler.addFilter(req_filter)
        console_handler.setLevel(logging.INFO)   # INFO+ only in terminal

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)

    def get_logger(self) -> logging.Logger:
        return self.logger


# ── Module-level singleton ────────────────────────────────────────────
_logger_instance = AppLogger().get_logger()


def get_app_logger() -> logging.Logger:
    """Return the application-wide ClaimFlow logger."""
    return _logger_instance
