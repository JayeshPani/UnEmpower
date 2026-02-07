"""
Configuration settings loaded from environment
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # Database
    DATABASE_URL: str = "postgresql://unempower:unempower123@localhost:5432/unempower"
    
    # Blockchain
    RPC_URL: str = "http://127.0.0.1:8545"
    CHAIN_ID: int = 31337
    
    # Contract addresses (filled after deployment)
    WORKER_REGISTRY_ADDRESS: str = ""
    WORK_PROOF_ADDRESS: str = ""
    CREDIT_ATTESTATION_VERIFIER_ADDRESS: str = ""
    LOAN_VAULT_ADDRESS: str = ""
    MOCK_USDC_ADDRESS: str = ""
    
    # AI Signer private key (demo only - never use in production!)
    AI_SIGNER_PRIVATE_KEY: str = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    
    # Attestation config
    ATTESTATION_VALIDITY_MINUTES: int = 30
    
    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
