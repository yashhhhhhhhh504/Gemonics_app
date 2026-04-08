import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import User, Job, JobStatus

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/{job_id}/files")
async def list_result_files(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not yet completed")

    files = []
    if job.results_dir and os.path.isdir(job.results_dir):
        for root, _, filenames in os.walk(job.results_dir):
            for fn in filenames:
                fp = os.path.join(root, fn)
                rel = os.path.relpath(fp, job.results_dir)
                size_mb = round(os.path.getsize(fp) / (1024 * 1024), 2)
                files.append({"name": rel, "size_mb": size_mb})
    return {"job_id": job_id, "files": files}


@router.get("/{job_id}/download/{file_path:path}")
async def download_file(
    job_id: int,
    file_path: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    full_path = os.path.normpath(os.path.join(job.results_dir, file_path))
    if not full_path.startswith(os.path.normpath(job.results_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(full_path, filename=os.path.basename(full_path))


@router.get("/{job_id}/summary")
async def get_summary(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    summary = {
        "job_id": job.id,
        "name": job.name,
        "status": job.status.value if job.status else None,
        "analysis_type": job.analysis_type.value if job.analysis_type else None,
        "run_mode": job.run_mode.value if job.run_mode else None,
        "progress": job.progress,
        "current_step": job.current_step,
    }

    # Read QC summary if available
    qc_summary_path = os.path.join(job.results_dir or "", "qc_summary.txt")
    if os.path.isfile(qc_summary_path):
        with open(qc_summary_path) as f:
            summary["qc_summary"] = f.read()

    # Read variant stats if available
    variant_stats_path = os.path.join(job.results_dir or "", "variant_stats.txt")
    if os.path.isfile(variant_stats_path):
        with open(variant_stats_path) as f:
            summary["variant_stats"] = f.read()

    return summary
