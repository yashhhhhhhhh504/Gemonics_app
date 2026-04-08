import asyncio
import os
import subprocess
import shutil
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from config import settings
from models import User

router = APIRouter(prefix="/api/references", tags=["References"])

# Track active downloads in memory
_active_downloads: dict[str, dict] = {}

# Define all reference files with download info
REFERENCE_FILES = {
    "GRCh38": {
        "genome": {
            "filename": "genome.fa",
            "description": "GRCh38 human reference genome (no alt contigs)",
            "url": "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/000/001/405/GCA_000001405.15_GRCh38/seqs_for_alignment_pipelines.ucsc_ids/GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz",
            "compressed_name": "GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz",
            "decompressed_name": "GCA_000001405.15_GRCh38_no_alt_analysis_set.fna",
            "size_gb": "~0.8 GB compressed, ~3 GB decompressed",
            "required": True,
        },
        "known_sites": {
            "filename": "known_sites.vcf.gz",
            "description": "dbSNP known variant sites for BQSR",
            "url": "https://storage.googleapis.com/gcp-public-data--broad-references/hg38/v0/Homo_sapiens_assembly38.dbsnp138.vcf.gz",
            "size_gb": "~1.5 GB",
            "required": False,
        },
        "known_sites_index": {
            "filename": "known_sites.vcf.gz.tbi",
            "description": "Index for known variant sites",
            "url": "https://storage.googleapis.com/gcp-public-data--broad-references/hg38/v0/Homo_sapiens_assembly38.dbsnp138.vcf.gz.tbi",
            "size_gb": "~2 MB",
            "required": False,
        },
        "gtf": {
            "filename": "genes.gtf",
            "description": "Ensembl gene annotation (for RNA-seq quantification)",
            "url": "https://ftp.ensembl.org/pub/release-110/gtf/homo_sapiens/Homo_sapiens.GRCh38.110.gtf.gz",
            "compressed_name": "Homo_sapiens.GRCh38.110.gtf.gz",
            "decompressed_name": "Homo_sapiens.GRCh38.110.gtf",
            "size_gb": "~50 MB compressed",
            "required": False,
        },
    },
    "GRCm39": {
        "genome": {
            "filename": "genome.fa",
            "description": "GRCm39 mouse reference genome",
            "url": "https://ftp.ensembl.org/pub/release-110/fasta/mus_musculus/dna/Mus_musculus.GRCm39.dna.primary_assembly.fa.gz",
            "compressed_name": "Mus_musculus.GRCm39.dna.primary_assembly.fa.gz",
            "decompressed_name": "Mus_musculus.GRCm39.dna.primary_assembly.fa",
            "size_gb": "~0.7 GB compressed, ~2.7 GB decompressed",
            "required": True,
        },
        "gtf": {
            "filename": "genes.gtf",
            "description": "Ensembl mouse gene annotation",
            "url": "https://ftp.ensembl.org/pub/release-110/gtf/mus_musculus/Mus_musculus.GRCm39.110.gtf.gz",
            "compressed_name": "Mus_musculus.GRCm39.110.gtf.gz",
            "decompressed_name": "Mus_musculus.GRCm39.110.gtf",
            "size_gb": "~30 MB compressed",
            "required": False,
        },
    },
}


def _check_file_status(ref_dir: str) -> dict:
    """Check which reference files exist and which indexes are built."""
    status = {
        "genome_fa": os.path.isfile(os.path.join(ref_dir, "genome.fa")),
        "genome_fai": os.path.isfile(os.path.join(ref_dir, "genome.fa.fai")),
        "bwa_index": os.path.isfile(os.path.join(ref_dir, "genome.fa.bwt")),
        "known_sites": os.path.isfile(os.path.join(ref_dir, "known_sites.vcf.gz")),
        "known_sites_index": os.path.isfile(os.path.join(ref_dir, "known_sites.vcf.gz.tbi")),
        "genes_gtf": os.path.isfile(os.path.join(ref_dir, "genes.gtf")),
    }

    # Get file sizes
    sizes = {}
    for key, exists in status.items():
        if exists:
            fmap = {
                "genome_fa": "genome.fa", "genome_fai": "genome.fa.fai",
                "bwa_index": "genome.fa.bwt", "known_sites": "known_sites.vcf.gz",
                "known_sites_index": "known_sites.vcf.gz.tbi", "genes_gtf": "genes.gtf",
            }
            path = os.path.join(ref_dir, fmap[key])
            sizes[key] = round(os.path.getsize(path) / (1024 ** 3), 2)
        else:
            sizes[key] = 0

    # Disk space
    disk = shutil.disk_usage(ref_dir)

    return {
        "files": status,
        "sizes_gb": sizes,
        "disk_free_gb": round(disk.free / (1024 ** 3), 1),
        "ref_dir": ref_dir,
        "active_downloads": {k: v for k, v in _active_downloads.items()},
    }


@router.get("/status")
async def get_reference_status(user: User = Depends(get_current_user)):
    ref_dir = settings.REFERENCES_DIR
    os.makedirs(ref_dir, exist_ok=True)
    return _check_file_status(ref_dir)


@router.get("/available/{genome_build}")
async def get_available_references(genome_build: str, user: User = Depends(get_current_user)):
    refs = REFERENCE_FILES.get(genome_build)
    if not refs:
        builds = list(REFERENCE_FILES.keys())
        raise HTTPException(status_code=404, detail=f"Unknown build. Available: {builds}")
    return {"genome_build": genome_build, "files": refs}


class DownloadRequest(BaseModel):
    genome_build: str = "GRCh38"
    file_key: str  # "genome", "known_sites", "gtf", etc.


@router.post("/download")
async def start_download(req: DownloadRequest, user: User = Depends(get_current_user)):
    refs = REFERENCE_FILES.get(req.genome_build)
    if not refs or req.file_key not in refs:
        raise HTTPException(status_code=400, detail="Invalid genome build or file key")

    dl_key = f"{req.genome_build}_{req.file_key}"
    if dl_key in _active_downloads and _active_downloads[dl_key].get("status") == "downloading":
        return {"message": "Download already in progress", **_active_downloads[dl_key]}

    file_info = refs[req.file_key]
    _active_downloads[dl_key] = {
        "status": "downloading",
        "file_key": req.file_key,
        "step": f"Downloading {file_info['filename']}...",
        "progress": 0,
    }

    asyncio.create_task(_run_download(dl_key, req.genome_build, req.file_key, file_info))
    return {"message": "Download started", "key": dl_key}


async def _run_download(dl_key: str, genome_build: str, file_key: str, file_info: dict):
    """Download, decompress, and index a reference file."""
    ref_dir = settings.REFERENCES_DIR
    os.makedirs(ref_dir, exist_ok=True)

    try:
        url = file_info["url"]
        target_filename = file_info["filename"]
        compressed_name = file_info.get("compressed_name")
        decompressed_name = file_info.get("decompressed_name")

        # Step 1: Download
        _active_downloads[dl_key]["step"] = f"Downloading {target_filename}..."
        _active_downloads[dl_key]["progress"] = 5

        dl_path = os.path.join(ref_dir, compressed_name or target_filename)

        # Try wget first, fall back to curl
        if shutil.which("wget"):
            proc = await asyncio.create_subprocess_exec(
                "wget", "-q", "--show-progress", "-O", dl_path, url,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
        else:
            proc = await asyncio.create_subprocess_exec(
                "curl", "-fSL", "-o", dl_path, url,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

        if proc.returncode != 0:
            err_msg = stderr.decode().strip()[-200:] if stderr else "Unknown error"
            _active_downloads[dl_key] = {"status": "failed", "step": f"Download failed: {err_msg}", "progress": 0}
            return

        _active_downloads[dl_key]["progress"] = 50

        # Step 2: Decompress if needed
        if compressed_name and compressed_name.endswith(".gz"):
            _active_downloads[dl_key]["step"] = f"Decompressing {compressed_name}..."
            _active_downloads[dl_key]["progress"] = 55
            proc = await asyncio.create_subprocess_exec(
                "gunzip", "-f", dl_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            # Rename to target filename
            if decompressed_name:
                src = os.path.join(ref_dir, decompressed_name)
                dst = os.path.join(ref_dir, target_filename)
                if os.path.isfile(src) and src != dst:
                    os.rename(src, dst)

            _active_downloads[dl_key]["progress"] = 70

        # Step 3: Build indexes for genome.fa
        if target_filename == "genome.fa":
            genome_path = os.path.join(ref_dir, "genome.fa")

            # samtools faidx
            _active_downloads[dl_key]["step"] = "Building samtools index..."
            _active_downloads[dl_key]["progress"] = 75
            proc = await asyncio.create_subprocess_exec(
                "samtools", "faidx", genome_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            # BWA index
            _active_downloads[dl_key]["step"] = "Building BWA index (this takes ~1 hour)..."
            _active_downloads[dl_key]["progress"] = 80
            proc = await asyncio.create_subprocess_exec(
                "bwa", "index", genome_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            if proc.returncode != 0:
                _active_downloads[dl_key]["step"] = "BWA indexing failed"
                _active_downloads[dl_key]["status"] = "failed"
                return

        _active_downloads[dl_key] = {
            "status": "completed",
            "step": f"{target_filename} ready",
            "progress": 100,
        }

    except Exception as e:
        _active_downloads[dl_key] = {
            "status": "failed",
            "step": f"Error: {str(e)}",
            "progress": 0,
        }


@router.get("/download/status")
async def download_status(user: User = Depends(get_current_user)):
    return _active_downloads
