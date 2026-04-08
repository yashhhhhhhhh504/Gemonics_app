import os
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import settings
from database import get_db
from models import User, Project, Sample

router = APIRouter(prefix="/api/projects/{project_id}/samples", tags=["Samples"])


class SampleResponse(BaseModel):
    id: int
    name: str
    file_r1: str | None
    file_r2: str | None
    file_type: str
    file_size_mb: float
    created_at: datetime

    class Config:
        from_attributes = True


def _sanitize_filename(name: str) -> str:
    """Replace spaces and special chars with underscores, keep extensions."""
    name = name.strip()
    name = re.sub(r'[^\w.\-]', '_', name)
    name = re.sub(r'_+', '_', name)
    return name


def _detect_file_type(filename: str) -> str:
    """Detect file type from filename, handling double extensions like .fastq.gz"""
    lower = filename.lower()
    if lower.endswith('.fastq.gz') or lower.endswith('.fq.gz'):
        return 'fastq'
    if lower.endswith('.fastq') or lower.endswith('.fq'):
        return 'fastq'
    if lower.endswith('.bam'):
        return 'bam'
    if lower.endswith('.vcf') or lower.endswith('.vcf.gz'):
        return 'vcf'
    if lower.endswith('.cram'):
        return 'cram'
    return lower.rsplit('.', 1)[-1] if '.' in lower else 'unknown'


async def _get_project(project_id: int, user: User, db: AsyncSession) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _save_upload(upload: UploadFile, dest_path: str) -> int:
    """Save uploaded file in chunks, return total bytes written."""
    total = 0
    with open(dest_path, "wb") as f:
        while True:
            chunk = await upload.read(16 * 1024 * 1024)  # 16MB chunks
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total


@router.get("/", response_model=list[SampleResponse])
async def list_samples(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, user, db)
    result = await db.execute(
        select(Sample).where(Sample.project_id == project_id).order_by(Sample.created_at.desc())
    )
    return result.scalars().all()


@router.post("/upload", response_model=SampleResponse, status_code=201)
async def upload_sample(
    project_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Handle file upload using raw multipart parsing for maximum compatibility."""
    project = await _get_project(project_id, user, db)

    upload_dir = os.path.join(settings.UPLOAD_DIR, str(project_id))
    os.makedirs(upload_dir, exist_ok=True)

    # Parse the multipart form manually for robustness
    form = await request.form()

    sample_name = form.get("sample_name")
    if not sample_name:
        raise HTTPException(status_code=422, detail="sample_name is required")

    file_r1: UploadFile | None = form.get("file_r1")
    file_r2: UploadFile | None = form.get("file_r2")

    if not file_r1 or not hasattr(file_r1, 'filename') or not file_r1.filename:
        raise HTTPException(status_code=422, detail="file_r1 is required")

    # Save R1
    r1_filename = _sanitize_filename(file_r1.filename)
    r1_path = os.path.join(upload_dir, r1_filename)
    total_size = await _save_upload(file_r1, r1_path)

    # Save R2 if provided
    r2_path = None
    if file_r2 and hasattr(file_r2, 'filename') and file_r2.filename:
        r2_filename = _sanitize_filename(file_r2.filename)
        r2_path = os.path.join(upload_dir, r2_filename)
        total_size += await _save_upload(file_r2, r2_path)

    file_type = _detect_file_type(file_r1.filename)

    sample = Sample(
        name=sample_name if isinstance(sample_name, str) else str(sample_name),
        file_r1=r1_path,
        file_r2=r2_path,
        file_type=file_type,
        file_size_mb=round(total_size / (1024 * 1024), 2),
        project_id=project_id,
    )
    db.add(sample)
    await db.commit()
    await db.refresh(sample)
    return sample


@router.delete("/{sample_id}", status_code=204)
async def delete_sample(
    project_id: int,
    sample_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, user, db)
    result = await db.execute(select(Sample).where(Sample.id == sample_id, Sample.project_id == project_id))
    sample = result.scalar_one_or_none()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    for path in [sample.file_r1, sample.file_r2]:
        if path and os.path.exists(path):
            os.remove(path)

    await db.delete(sample)
    await db.commit()
