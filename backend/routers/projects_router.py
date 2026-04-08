from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import User, Project, Sample, Job

router = APIRouter(prefix="/api/projects", tags=["Projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    organism: str = "Homo sapiens"
    genome_build: str = "GRCh38"


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    organism: str
    genome_build: str
    created_at: datetime
    sample_count: int = 0
    job_count: int = 0

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()
    responses = []
    for p in projects:
        sample_count = (await db.execute(
            select(func.count(Sample.id)).where(Sample.project_id == p.id)
        )).scalar() or 0
        job_count = (await db.execute(
            select(func.count(Job.id)).where(Job.project_id == p.id)
        )).scalar() or 0
        responses.append(ProjectResponse(
            id=p.id, name=p.name, description=p.description,
            organism=p.organism, genome_build=p.genome_build,
            created_at=p.created_at, sample_count=sample_count, job_count=job_count,
        ))
    return responses


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(name=req.name, description=req.description,
                      organism=req.organism, genome_build=req.genome_build,
                      owner_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        organism=project.organism, genome_build=project.genome_build,
        created_at=project.created_at,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sample_count = (await db.execute(
        select(func.count(Sample.id)).where(Sample.project_id == project.id)
    )).scalar() or 0
    job_count = (await db.execute(
        select(func.count(Job.id)).where(Job.project_id == project.id)
    )).scalar() or 0
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        organism=project.organism, genome_build=project.genome_build,
        created_at=project.created_at, sample_count=sample_count, job_count=job_count,
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
