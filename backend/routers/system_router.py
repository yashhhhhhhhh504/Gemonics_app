import shutil
import psutil
from fastapi import APIRouter, Depends
from auth import get_current_user
from config import settings
from models import User

router = APIRouter(prefix="/api/system", tags=["System"])


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/resources")
async def get_resources(user: User = Depends(get_current_user)):
    cpu_percent = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = shutil.disk_usage(settings.UPLOAD_DIR)

    return {
        "cpu": {
            "percent": cpu_percent,
            "cores": psutil.cpu_count(logical=False),
            "threads": psutil.cpu_count(logical=True),
        },
        "memory": {
            "total_gb": round(mem.total / (1024 ** 3), 1),
            "available_gb": round(mem.available / (1024 ** 3), 1),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024 ** 3), 1),
            "free_gb": round(disk.free / (1024 ** 3), 1),
            "percent": round(disk.used / disk.total * 100, 1),
        },
        "config": {
            "max_threads": settings.MAX_THREADS,
            "max_memory_gb": settings.MAX_MEMORY_GB,
            "max_concurrent_jobs": settings.MAX_CONCURRENT_JOBS,
        },
    }


@router.get("/tools")
async def check_tools(user: User = Depends(get_current_user)):
    import subprocess

    tools = {
        "fastqc": settings.FASTQC_PATH,
        "fastp": settings.FASTP_PATH,
        "bwa": settings.BWA_PATH,
        "minimap2": settings.MINIMAP2_PATH,
        "samtools": settings.SAMTOOLS_PATH,
        "gatk": settings.GATK_PATH,
        "bcftools": settings.BCFTOOLS_PATH,
        "multiqc": settings.MULTIQC_PATH,
    }

    results = {}
    for name, path in tools.items():
        try:
            result = subprocess.run(
                [path, "--version"], capture_output=True, text=True, timeout=10
            )
            version = (result.stdout + result.stderr).strip().split("\n")[0]
            results[name] = {"installed": True, "version": version, "path": path}
        except (FileNotFoundError, subprocess.TimeoutExpired):
            results[name] = {"installed": False, "version": None, "path": path}

    return results
