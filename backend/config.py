import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Project root is one level up from backend/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _PROJECT_ROOT / "data"


class Settings(BaseSettings):
    APP_NAME: str = "NGS Analysis Platform"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-use-openssl-rand-hex-32")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DATA_DIR / 'ngs_platform.db'}"

    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", str(_DATA_DIR / "uploads"))
    RESULTS_DIR: str = os.getenv("RESULTS_DIR", str(_DATA_DIR / "results"))
    REFERENCES_DIR: str = os.getenv("REFERENCES_DIR", str(_DATA_DIR / "references"))
    TEMP_DIR: str = os.getenv("TEMP_DIR", str(_DATA_DIR / "temp"))

    MAX_UPLOAD_SIZE_GB: int = 50
    MAX_THREADS: int = int(os.getenv("MAX_THREADS", os.cpu_count() or 4))
    MAX_MEMORY_GB: int = int(os.getenv("MAX_MEMORY_GB", 16))
    MAX_CONCURRENT_JOBS: int = int(os.getenv("MAX_CONCURRENT_JOBS", 2))

    # Tool paths (auto-detected or set via env)
    FASTQC_PATH: str = os.getenv("FASTQC_PATH", "fastqc")
    TRIMMOMATIC_PATH: str = os.getenv("TRIMMOMATIC_PATH", "trimmomatic")
    BWA_PATH: str = os.getenv("BWA_PATH", "bwa")
    SAMTOOLS_PATH: str = os.getenv("SAMTOOLS_PATH", "samtools")
    GATK_PATH: str = os.getenv("GATK_PATH", "gatk")
    BCFTOOLS_PATH: str = os.getenv("BCFTOOLS_PATH", "bcftools")
    SNPEFF_PATH: str = os.getenv("SNPEFF_PATH", "snpEff")
    MULTIQC_PATH: str = os.getenv("MULTIQC_PATH", "multiqc")
    FASTP_PATH: str = os.getenv("FASTP_PATH", "fastp")
    MINIMAP2_PATH: str = os.getenv("MINIMAP2_PATH", "minimap2")

    class Config:
        env_file = ".env"


settings = Settings()
