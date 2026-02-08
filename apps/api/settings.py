"""
UnEmpower API Settings

Uses pydantic-settings for environment variable validation.
Hard errors on startup if required variables are missing.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # === RPC & Chain ===
    RPC_URL: str = Field(..., description="Ethereum RPC URL (e.g., http://127.0.0.1:8545)")
    CHAIN_ID: int = Field(..., description="Chain ID (31337 for hardhat, 11155111 for Sepolia)")

    # === Contract Addresses ===
    WORKER_REGISTRY_ADDRESS: str = Field(..., description="WorkerRegistry contract address")
    WORKPROOF_ADDRESS: str = Field(..., description="WorkProof contract address")
    ATTESTATION_VERIFIER_ADDRESS: str = Field(..., description="CreditAttestationVerifier contract address")
    LOAN_VAULT_ADDRESS: str = Field(..., description="LoanVault contract address")
    MOCK_USDC_ADDRESS: str = Field(..., description="MockUSDC contract address")

    # === Private Keys ===
    AI_SIGNER_PRIVATE_KEY: str = Field(..., description="Private key for signing attestations")
    WORKPROOF_VERIFIER_PRIVATE_KEY: str = Field(..., description="Private key for submitting work proofs")

    # === Database ===
    POSTGRES_URL: str = Field(
        default="postgresql://unempower:unempower123@localhost:5432/unempower",
        description="PostgreSQL connection URL"
    )
    DB_PORT: int = Field(
        default=5432,
        description="PostgreSQL port for health checks"
    )

    # === CORS ===
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed origins"
    )

    # === Logging ===
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # === Indexer ===
    INDEXER_POLL_INTERVAL: int = Field(default=3, description="Block polling interval in seconds")
    INDEXER_START_BLOCK: int = Field(default=0, description="Block to start indexing from")

    # === Demo ===
    DEMO_MODE: bool = Field(default=False, description="Enable demo endpoints")

    # === Manager Module ===
    MANAGER_ADMIN_TOKEN: str = Field(
        default="manager-secret-token",
        description="Bearer token for manager API authentication"
    )

    # === Groq Chatbot ===
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key for chatbot LLM"
    )

    @field_validator("CHAIN_ID", mode="before")
    @classmethod
    def parse_chain_id(cls, v):
        if isinstance(v, str):
            return int(v)
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def ai_signer_address(self) -> str:
        """Derive address from AI signer private key."""
        from eth_account import Account
        return Account.from_key(self.AI_SIGNER_PRIVATE_KEY).address

    @property
    def verifier_address(self) -> str:
        """Derive address from verifier private key."""
        from eth_account import Account
        return Account.from_key(self.WORKPROOF_VERIFIER_PRIVATE_KEY).address

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Raises ValidationError if required env vars are missing.
    """
    return Settings()


def validate_settings_on_startup():
    """Validate settings and print summary. Call this in main.py startup."""
    try:
        settings = get_settings()
        print("=" * 60)
        print("✅ UnEmpower API Configuration Loaded")
        print("=" * 60)
        print(f"  Chain ID:        {settings.CHAIN_ID}")
        print(f"  RPC URL:         {settings.RPC_URL[:50]}...")
        print(f"  AI Signer:       {settings.ai_signer_address}")
        print(f"  Verifier:        {settings.verifier_address}")
        print(f"  CORS Origins:    {settings.cors_origins_list}")
        print(f"  Log Level:       {settings.LOG_LEVEL}")
        print("=" * 60)
        print("  Contracts:")
        print(f"    WorkerRegistry: {settings.WORKER_REGISTRY_ADDRESS}")
        print(f"    WorkProof:      {settings.WORKPROOF_ADDRESS}")
        print(f"    Verifier:       {settings.ATTESTATION_VERIFIER_ADDRESS}")
        print(f"    LoanVault:      {settings.LOAN_VAULT_ADDRESS}")
        print(f"    MockUSDC:       {settings.MOCK_USDC_ADDRESS}")
        print("=" * 60)
        return settings
    except Exception as e:
        print("=" * 60)
        print("❌ CONFIGURATION ERROR - Missing required environment variables")
        print("=" * 60)
        print(str(e))
        print("\nPlease create a .env file based on .env.example")
        print("=" * 60)
        raise SystemExit(1)
