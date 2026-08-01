# instrumentation/fastapi_middleware.py
# Example FastAPI middleware to add per-request metadata and sanitized forwarding.
from fastapi import FastAPI, Request
import time
import logging
import os

logger = logging.getLogger("copilot")

def sanitize_input(text: str) -> str:
    # Minimal example: strip emails and phone-like tokens (extend per policy)
    import re
    text = re.sub(r'\S+@\S+\.\S+', '[redacted_email]', text)
    text = re.sub(r'\+?\d[\d\-\s]{7,}\d', '[redacted_phone]', text)
    return text

def add_instrumentation(app: FastAPI):
    @app.middleware("http")
    async def instrument(request: Request, call_next):
        start = time.time()
        body = await request.body()
        # do not log sensitive contents; only record length and hash if needed
        sanitized = sanitize_input(body.decode('utf-8', errors='ignore'))
        response = await call_next(request)
        latency = (time.time() - start) * 1000.0
        # emit structured log (no keys)
        logger.info({
            'path': str(request.url.path),
            'method': request.method,
            'latency_ms': latency,
            'input_length': len(body),
            # add user/provider metadata downstream
        })
        return response
