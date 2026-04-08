import asyncio
import json
import os
import subprocess
from datetime import datetime

from sqlalchemy import select
from database import async_session
from config import settings
from models import Job, JobStatus, Sample, AnalysisType, RunMode


PIPELINE_STEPS = {
    AnalysisType.WGS: [
        ("qc", "Quality Control", "qc.sh", 10),
        ("trim", "Read Trimming", "trim.sh", 20),
        ("post_trim_qc", "Post-Trim QC", "post_trim_qc.sh", 25),
        ("align", "Alignment", "align.sh", 50),
        ("post_align", "Post-Alignment Processing", "post_align.sh", 65),
        ("variant_call", "Variant Calling", "variant_call.sh", 85),
        ("annotate", "Variant Annotation", "annotate.sh", 95),
        ("report", "Report Generation", "report.sh", 100),
    ],
    AnalysisType.WES: [
        ("qc", "Quality Control", "qc.sh", 10),
        ("trim", "Read Trimming", "trim.sh", 20),
        ("post_trim_qc", "Post-Trim QC", "post_trim_qc.sh", 25),
        ("align", "Alignment", "align.sh", 50),
        ("post_align", "Post-Alignment Processing", "post_align.sh", 65),
        ("variant_call", "Variant Calling", "variant_call.sh", 85),
        ("annotate", "Variant Annotation", "annotate.sh", 95),
        ("report", "Report Generation", "report.sh", 100),
    ],
    AnalysisType.GENE_PANEL: [
        ("qc", "Quality Control", "qc.sh", 15),
        ("trim", "Read Trimming", "trim.sh", 30),
        ("post_trim_qc", "Post-Trim QC", "post_trim_qc.sh", 35),
        ("align", "Alignment", "align.sh", 55),
        ("variant_call", "Variant Calling", "variant_call.sh", 80),
        ("annotate", "Variant Annotation", "annotate.sh", 95),
        ("report", "Report Generation", "report.sh", 100),
    ],
    AnalysisType.RNA_SEQ: [
        ("qc", "Quality Control", "qc.sh", 10),
        ("trim", "Read Trimming", "trim.sh", 25),
        ("post_trim_qc", "Post-Trim QC", "post_trim_qc.sh", 30),
        ("align", "Alignment", "align_rna.sh", 60),
        ("quantify", "Quantification", "quantify.sh", 85),
        ("report", "Report Generation", "report.sh", 100),
    ],
}

# Steps that pause the pipeline for user review
PAUSE_AFTER_STEPS = {"qc", "post_trim_qc"}


async def update_job(job_id: int, **kwargs):
    async with async_session() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            await db.commit()


def run_pipeline_script(script_name: str, env: dict, log_file: str) -> tuple[int, str]:
    script_path = os.path.join(os.path.dirname(__file__), "..", "pipelines", script_name)

    if not os.path.isfile(script_path):
        return 1, f"Pipeline script not found: {script_name}"

    with open(log_file, "a") as log:
        proc = subprocess.run(
            ["bash", script_path],
            env={**os.environ, **env},
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=86400,  # 24h max
        )
    return proc.returncode, ""


async def start_pipeline(job_id: int):
    async with async_session() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        # Gather sample files
        samples_result = await db.execute(
            select(Sample).where(Sample.project_id == job.project_id)
        )
        samples = samples_result.scalars().all()
        if not samples:
            await update_job(job_id, status=JobStatus.FAILED, error_message="No samples found in project")
            return

        sample_r1 = [s.file_r1 for s in samples if s.file_r1]
        sample_r2 = [s.file_r2 for s in samples if s.file_r2]
        params = json.loads(job.parameters_json) if job.parameters_json else {}

        env = {
            "NGS_SAMPLE_R1": ",".join(sample_r1),
            "NGS_SAMPLE_R2": ",".join(sample_r2),
            "NGS_RESULTS_DIR": job.results_dir,
            "NGS_THREADS": str(job.threads),
            "NGS_MEMORY_GB": str(job.memory_gb),
            "NGS_ANALYSIS_TYPE": job.analysis_type.value,
            "NGS_RUN_MODE": job.run_mode.value,
            "NGS_REFERENCES_DIR": settings.REFERENCES_DIR,
            "NGS_TEMP_DIR": settings.TEMP_DIR,
            "FASTQC_PATH": settings.FASTQC_PATH,
            "FASTP_PATH": settings.FASTP_PATH,
            "BWA_PATH": settings.BWA_PATH,
            "SAMTOOLS_PATH": settings.SAMTOOLS_PATH,
            "GATK_PATH": settings.GATK_PATH,
            "BCFTOOLS_PATH": settings.BCFTOOLS_PATH,
            "MULTIQC_PATH": settings.MULTIQC_PATH,
            "MINIMAP2_PATH": settings.MINIMAP2_PATH,
        }
        # Inject user-specified trim parameters
        if params.get("trim_quality"):
            env["NGS_TRIM_QUALITY"] = str(params["trim_quality"])
        if params.get("trim_min_length"):
            env["NGS_TRIM_MIN_LENGTH"] = str(params["trim_min_length"])
        if params.get("trim_adapter_r1"):
            env["NGS_TRIM_ADAPTER_R1"] = str(params["trim_adapter_r1"])
        if params.get("trim_adapter_r2"):
            env["NGS_TRIM_ADAPTER_R2"] = str(params["trim_adapter_r2"])
        if params.get("trim_front"):
            env["NGS_TRIM_FRONT"] = str(params["trim_front"])
        if params.get("trim_tail"):
            env["NGS_TRIM_TAIL"] = str(params["trim_tail"])

        env.update({f"NGS_PARAM_{k.upper()}": str(v) for k, v in params.items()})

    await update_job(job_id, status=JobStatus.RUNNING, started_at=datetime.utcnow())

    steps = PIPELINE_STEPS.get(job.analysis_type, PIPELINE_STEPS[AnalysisType.WGS])

    # Load completed steps for checkpoint/resume
    completed_steps = set()
    async with async_session() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        j = result.scalar_one_or_none()
        if j and j.completed_steps:
            completed_steps = set(j.completed_steps.split(","))

    for step_id, step_name, script, progress in steps:
        # Skip already completed steps (checkpoint/resume)
        if step_id in completed_steps:
            await update_job(job_id, progress=progress, current_step=f"{step_name} (cached)")
            continue

        await update_job(job_id, current_step=step_name, progress=progress - 5)

        returncode, error = await asyncio.to_thread(
            run_pipeline_script, script, env, job.log_path
        )

        if returncode != 0:
            await update_job(
                job_id,
                status=JobStatus.FAILED,
                error_message=f"Step '{step_name}' failed (exit code {returncode}). {error}",
                completed_at=datetime.utcnow(),
            )
            return

        # Save checkpoint: mark step as completed
        completed_steps.add(step_id)
        await update_job(job_id, progress=progress, completed_steps=",".join(completed_steps))

        # Pause after certain steps for user review
        if step_id in PAUSE_AFTER_STEPS:
            pause_msg = {
                "qc": "QC complete. Review quality reports and configure trimming parameters before continuing.",
                "post_trim_qc": "Post-trim QC complete. Review trimmed read quality. Continue when satisfied.",
            }
            await update_job(
                job_id,
                status=JobStatus.AWAITING_INPUT,
                current_step=f"Review: {step_name}",
                error_message=pause_msg.get(step_id, "Review results and continue when ready."),
            )
            # Stop the loop — the pipeline will be resumed via the /continue endpoint
            return

    await update_job(
        job_id,
        status=JobStatus.COMPLETED,
        progress=100,
        current_step="Completed",
        completed_at=datetime.utcnow(),
    )
