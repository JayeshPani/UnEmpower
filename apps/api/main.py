"""
UnEmpower API

FastAPI backend for AI scoring, EIP-712 signing, and event indexing.
"""

import time
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware

from settings import validate_settings_on_startup, get_settings
from database import init_db, check_db_connection
from routers import ai, workproof, payout, events
from routers import stats, forecast, fraud_router, integrity, alerts, coach_router, audit
from routers import manager, worker, chat, voice, suggestions


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        start_time = time.time()
        
        # Add request ID to scope
        request.state.request_id = request_id
        
        response = await call_next(request)
        
        process_time = time.time() - start_time
        print(f"📝 [{request_id}] {request.method} {request.url.path} - {response.status_code} ({process_time:.3f}s)")
        
        response.headers["X-Request-ID"] = request_id
        return response


# Simple in-memory rate limiter
_rate_limits = {}

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only limit specific endpoints
        if request.url.path in ["/workproof/simulate", "/ai/offer"]:
            client_ip = request.client.host
            key = f"{client_ip}:{request.url.path}"
            now = time.time()
            
            # 10 requests per minute
            history = _rate_limits.get(key, [])
            history = [t for t in history if t > now - 60]
            
            if len(history) >= 10:
                print(f"⚠️ Rate limit exceeded for {client_ip} on {request.url.path}")
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."}
                )
            
            history.append(now)
            _rate_limits[key] = history
            
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    print("\n🚀 Starting UnEmpower API...")
    
    # Validate settings (will exit if invalid)
    settings = validate_settings_on_startup()
    
    # Initialize database
    init_db()
    
    # Pre-train scoring model
    from services.scoring import get_or_train_model
    get_or_train_model()
    
    print("\n✅ API ready to serve requests!\n")
    
    yield
    
    # Shutdown
    print("\n👋 Shutting down API...")


app = FastAPI(
    title="UnEmpower API",
    description="AI-powered credit scoring and EIP-712 attestation signing",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middlewares
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)

# Include routers
app.include_router(ai.router)
app.include_router(workproof.router)
app.include_router(payout.router)
app.include_router(events.router)

# AI Feature Pack routers
app.include_router(stats.router)
app.include_router(forecast.router)
app.include_router(fraud_router.router)
app.include_router(integrity.router)
app.include_router(alerts.router)
app.include_router(coach_router.router)
app.include_router(audit.router)

# Manager Module routers
app.include_router(manager.router)
app.include_router(worker.router)

# Chatbot router
app.include_router(chat.router)

# Voice router
app.include_router(voice.router)

# Suggestions router
app.include_router(suggestions.router)

if settings.DEMO_MODE:
    from routers import demo
    app.include_router(demo.router)
    print("🎭 Demo mode enabled: /demo/bootstrap available")


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    
    Returns OK if API, database, and chain are accessible.
    """
    db_ok = check_db_connection()
    settings = get_settings()
    
    # Check chain connectivity
    chain_ok = False
    current_block = None
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(settings.RPC_URL))
        current_block = w3.eth.block_number
        chain_ok = True
    except Exception as e:
        print(f"⚠️ Chain connectivity check failed: {e}")
    
    status = "healthy" if (db_ok and chain_ok) else "degraded"
    
    return {
        "status": status,
        "database": "connected" if db_ok else "disconnected",
        "chain": "connected" if chain_ok else "disconnected",
        "chain_id": settings.CHAIN_ID,
        "current_block": current_block,
        "ai_signer": settings.ai_signer_address,
        "verifier": settings.verifier_address,
    }


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "UnEmpower API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
