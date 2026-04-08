import json
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import settings
from database import get_db
from models import User, Project, Job, JobStatus, AnalysisType, RunMode

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


class JobCreate(BaseModel):
    project_id: int
    name: str
    analysis_type: AnalysisType = AnalysisType.WGS
    run_mode: RunMode = RunMode.STANDARD
    threads: int = 4
    memory_gb: int = 8
    parameters: dict = {}


class JobResponse(BaseModel):
    id: int
    name: str
    status: str
    analysis_type: str
    run_mode: str
    progress: int
    current_step: str
    error_message: str | None
    threads: int
    memory_gb: int
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    project_id: int

    class Config:
        from_attributes = True


class TrimParams(BaseModel):
    quality: int = 20
    min_length: int = 36
    trim_front: int = 0
    trim_tail: int = 0
    adapter_r1: str = ""
    adapter_r2: str = ""


@router.get("/", response_model=list[JobResponse])
async def list_jobs(
    project_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Job).where(Job.user_id == user.id)
    if project_id:
        query = query.where(Job.project_id == project_id)
    result = await db.execute(query.order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=JobResponse, status_code=201)
async def create_job(
    req: JobCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == req.project_id, Project.owner_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Check concurrent job limit
    running = (await db.execute(
        select(Job).where(Job.user_id == user.id, Job.status == JobStatus.RUNNING)
    )).scalars().all()
    if len(running) >= settings.MAX_CONCURRENT_JOBS:
        raise HTTPException(status_code=429, detail=f"Max {settings.MAX_CONCURRENT_JOBS} concurrent jobs allowed")

    threads = min(req.threads, settings.MAX_THREADS)
    memory_gb = min(req.memory_gb, settings.MAX_MEMORY_GB)

    results_dir = os.path.join(settings.RESULTS_DIR, str(req.project_id), f"job_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")
    os.makedirs(results_dir, exist_ok=True)
    log_path = os.path.join(results_dir, "pipeline.log")

    job = Job(
        name=req.name,
        analysis_type=req.analysis_type,
        run_mode=req.run_mode,
        threads=threads,
        memory_gb=memory_gb,
        parameters_json=json.dumps(req.parameters),
        results_dir=results_dir,
        log_path=log_path,
        project_id=req.project_id,
        user_id=user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger pipeline in background
    from services.pipeline_runner import start_pipeline
    import asyncio
    asyncio.create_task(start_pipeline(job.id))

    return job


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/resume", response_model=JobResponse)
async def resume_job(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in (JobStatus.FAILED, JobStatus.AWAITING_INPUT):
        raise HTTPException(status_code=400, detail="Only failed or paused jobs can be resumed")

    job.status = JobStatus.PENDING
    job.error_message = None
    job.completed_at = None
    await db.commit()
    await db.refresh(job)

    from services.pipeline_runner import start_pipeline
    import asyncio
    asyncio.create_task(start_pipeline(job.id))
    return job


@router.get("/{job_id}/qc-report")
async def get_qc_report(
    job_id: int,
    report_type: str = "raw",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get QC report data: FastQC zip contents or MultiQC HTML."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if report_type == "raw":
        qc_dir = os.path.join(job.results_dir, "qc")
        multiqc_path = os.path.join(qc_dir, "multiqc_report.html")
    elif report_type == "post_trim":
        qc_dir = os.path.join(job.results_dir, "post_trim_qc")
        multiqc_path = os.path.join(qc_dir, "multiqc_post_trim.html")
    elif report_type == "comparison":
        qc_dir = os.path.join(job.results_dir, "post_trim_qc")
        multiqc_path = os.path.join(qc_dir, "multiqc_comparison.html")
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type")

    # Try to return MultiQC HTML
    if os.path.isfile(multiqc_path):
        with open(multiqc_path) as f:
            return HTMLResponse(content=f.read())

    # Fall back to listing FastQC files
    files = []
    if os.path.isdir(qc_dir):
        for fn in os.listdir(qc_dir):
            fp = os.path.join(qc_dir, fn)
            if fn.endswith(".html") and os.path.isfile(fp):
                files.append(fn)

    if not files:
        raise HTTPException(status_code=404, detail="No QC reports found yet")

    return {"available_reports": files, "qc_dir": qc_dir}


@router.get("/{job_id}/qc-report-file/{filename}")
async def get_qc_report_file(
    job_id: int,
    filename: str,
    report_type: str = "raw",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve an individual QC report HTML file."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if report_type == "raw":
        qc_dir = os.path.join(job.results_dir, "qc")
    elif report_type in ("post_trim", "comparison"):
        qc_dir = os.path.join(job.results_dir, "post_trim_qc")
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type")

    full_path = os.path.normpath(os.path.join(qc_dir, filename))
    if not full_path.startswith(os.path.normpath(qc_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    if filename.endswith(".html"):
        with open(full_path) as f:
            return HTMLResponse(content=f.read())
    return FileResponse(full_path)


@router.get("/{job_id}/qc-summary")
async def get_qc_summary(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get parsed FastQC summary data for display in the frontend."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    summary = {"raw": {}, "post_trim": {}, "fastp": []}

    # Parse FastQC summary data from the QC directory
    for phase, dirname in [("raw", "qc"), ("post_trim", "post_trim_qc")]:
        qc_dir = os.path.join(job.results_dir, dirname)
        if not os.path.isdir(qc_dir):
            continue

        reports = []
        for fn in os.listdir(qc_dir):
            if fn.endswith(".html") and not fn.startswith("multiqc"):
                reports.append(fn)

        has_multiqc = os.path.isfile(os.path.join(qc_dir, "multiqc_report.html")) or \
                      os.path.isfile(os.path.join(qc_dir, "multiqc_post_trim.html"))

        summary[phase] = {
            "fastqc_reports": reports,
            "has_multiqc": has_multiqc,
            "report_count": len(reports),
        }

    # Parse fastp JSON reports for detailed stats
    trim_dir = os.path.join(job.results_dir, "trimmed")
    if os.path.isdir(trim_dir):
        for fn in os.listdir(trim_dir):
            if fn.endswith("_fastp.json"):
                try:
                    with open(os.path.join(trim_dir, fn)) as f:
                        fastp_data = json.load(f)
                    summary["fastp"].append({
                        "filename": fn,
                        "before_filtering": fastp_data.get("summary", {}).get("before_filtering", {}),
                        "after_filtering": fastp_data.get("summary", {}).get("after_filtering", {}),
                        "filtering_result": fastp_data.get("filtering_result", {}),
                        "adapter_cutting": fastp_data.get("adapter_cutting", {}),
                    })
                except (json.JSONDecodeError, KeyError):
                    pass

    return summary


@router.post("/{job_id}/set-trim-params", response_model=JobResponse)
async def set_trim_params(
    job_id: int,
    params: TrimParams,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set trimming parameters and continue the pipeline."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.AWAITING_INPUT:
        raise HTTPException(status_code=400, detail="Job is not awaiting input")

    # Update job parameters with trim settings
    current_params = json.loads(job.parameters_json) if job.parameters_json else {}
    current_params["trim_quality"] = params.quality
    current_params["trim_min_length"] = params.min_length
    current_params["trim_front"] = params.trim_front
    current_params["trim_tail"] = params.trim_tail
    if params.adapter_r1:
        current_params["trim_adapter_r1"] = params.adapter_r1
    if params.adapter_r2:
        current_params["trim_adapter_r2"] = params.adapter_r2
    job.parameters_json = json.dumps(current_params)

    # Resume pipeline
    job.status = JobStatus.PENDING
    job.error_message = None
    await db.commit()
    await db.refresh(job)

    from services.pipeline_runner import start_pipeline
    import asyncio
    asyncio.create_task(start_pipeline(job.id))
    return job


@router.post("/{job_id}/continue", response_model=JobResponse)
async def continue_pipeline(
    job_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Continue the pipeline after user review (no parameter changes)."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.AWAITING_INPUT:
        raise HTTPException(status_code=400, detail="Job is not awaiting input")

    job.status = JobStatus.PENDING
    job.error_message = None
    await db.commit()
    await db.refresh(job)

    from services.pipeline_runner import start_pipeline
    import asyncio
    asyncio.create_task(start_pipeline(job.id))
    return job


@router.get("/{job_id}/log")
async def get_job_log(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.log_path and os.path.exists(job.log_path):
        with open(job.log_path) as f:
            return {"log": f.read()}
    return {"log": ""}
