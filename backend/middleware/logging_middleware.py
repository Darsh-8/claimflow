import time
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from logger.app_logger import client_ip_cv, req_id_cv, get_app_logger

logger = get_app_logger()

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Generate a unique request ID
        req_id = str(uuid.uuid4())[:8]
        req_id_cv.set(req_id)
        
        # Get client IP
        client_ip = request.client.host if request.client else "-"
        client_ip_cv.set(client_ip)

        start_time = time.time()
        
        # Log request start (optional, we'll just log completion to reduce noise)
        # logger.debug(f"Handling request: {request.method} {request.url.path}")

        try:
            response = await call_next(request)
            
            process_time = (time.time() - start_time) * 1000
            
            # Log the completion of the request
            logger.info(
                f"{request.method} {request.url.path} - HTTP {response.status_code} - {process_time:.2f}ms"
            )
            
            # Add request ID to headers so clients can trace it
            response.headers["X-Request-ID"] = req_id
            return response
            
        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(f"{request.method} {request.url.path} - FAILED {type(e).__name__} - {process_time:.2f}ms")
            raise
