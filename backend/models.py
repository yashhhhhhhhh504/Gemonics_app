import datetime
import enum
from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from database import Base


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    AWAITING_INPUT = "awaiting_input"


class AnalysisType(str, enum.Enum):
    WGS = "wgs"
    WES = "wes"
    GENE_PANEL = "gene_panel"
    RNA_SEQ = "rna_seq"


class RunMode(str, enum.Enum):
    STANDARD = "standard"
    FAST = "fast"
    HIGH_SENSITIVITY = "high_sensitivity"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    role = Column(String(20), default="user")  # user, admin
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    projects = relationship("Project", back_populates="owner")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    organism = Column(String(100), default="Homo sapiens")
    genome_build = Column(String(20), default="GRCh38")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    owner = relationship("User", back_populates="projects")
    samples = relationship("Sample", back_populates="project", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="project", cascade="all, delete-orphan")


class Sample(Base):
    __tablename__ = "samples"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    file_r1 = Column(String(500))  # Forward read path
    file_r2 = Column(String(500))  # Reverse read path (optional for SE)
    file_type = Column(String(20), default="fastq")  # fastq, bam, vcf
    file_size_mb = Column(Float, default=0)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)

    project = relationship("Project", back_populates="samples")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING)
    analysis_type = Column(Enum(AnalysisType), default=AnalysisType.WGS)
    run_mode = Column(Enum(RunMode), default=RunMode.STANDARD)
    progress = Column(Integer, default=0)  # 0-100
    current_step = Column(String(100), default="Queued")
    log_path = Column(String(500))
    results_dir = Column(String(500))
    parameters_json = Column(Text, default="{}")
    error_message = Column(Text)
    completed_steps = Column(Text, default="")  # comma-separated list of completed step IDs for checkpoint/resume
    threads = Column(Integer, default=4)
    memory_gb = Column(Integer, default=8)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    project = relationship("Project", back_populates="jobs")
    user = relationship("User")
