# ============================================================================
# NGS Analysis Platform - Multi-stage Docker Build
# Works on any machine (amd64 / arm64) via docker compose up
# ============================================================================

# ---------- Stage 1: Build the frontend ----------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Runtime (Python 3.13 + bioinformatics tools) ----------
FROM python:3.13-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ---- System packages & build deps ----
# openjdk-17 is needed by FastQC and GATK
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget curl unzip ca-certificates \
        openjdk-17-jre-headless \
        # build deps for samtools / bcftools / bwa / fastp
        build-essential zlib1g-dev libbz2-dev liblzma-dev \
        libcurl4-openssl-dev libncurses5-dev libdeflate-dev \
        autoconf automake perl \
    && rm -rf /var/lib/apt/lists/*

# ---- samtools 1.21 (compiled from source — works on any arch) ----
RUN cd /tmp \
    && wget -q https://github.com/samtools/samtools/releases/download/1.21/samtools-1.21.tar.bz2 \
    && tar xjf samtools-1.21.tar.bz2 && cd samtools-1.21 \
    && ./configure --prefix=/usr/local && make -j"$(nproc)" && make install \
    && cd /tmp && rm -rf samtools-1.21*

# ---- bcftools 1.21 ----
RUN cd /tmp \
    && wget -q https://github.com/samtools/bcftools/releases/download/1.21/bcftools-1.21.tar.bz2 \
    && tar xjf bcftools-1.21.tar.bz2 && cd bcftools-1.21 \
    && ./configure --prefix=/usr/local && make -j"$(nproc)" && make install \
    && cd /tmp && rm -rf bcftools-1.21*

# ---- BWA 0.7.18 (compiled from source) ----
RUN cd /tmp \
    && wget -q https://github.com/lh3/bwa/releases/download/v0.7.18/bwa-0.7.18.tar.bz2 \
    && tar xjf bwa-0.7.18.tar.bz2 && cd bwa-0.7.18 \
    && make -j"$(nproc)" && cp bwa /usr/local/bin/ \
    && cd /tmp && rm -rf bwa-0.7.18*

# ---- fastp 0.23.4 (compiled from source — no pre-built arm64 binary) ----
RUN cd /tmp \
    && wget -q https://github.com/OpenGene/fastp/archive/refs/tags/v0.23.4.tar.gz \
    && tar xzf v0.23.4.tar.gz && cd fastp-0.23.4 \
    && make -j"$(nproc)" && cp fastp /usr/local/bin/ \
    && cd /tmp && rm -rf fastp-0.23.4* v0.23.4.tar.gz

# ---- minimap2 2.28 (compiled from source for arch portability) ----
RUN cd /tmp \
    && wget -q https://github.com/lh3/minimap2/releases/download/v2.28/minimap2-2.28.tar.bz2 \
    && tar xjf minimap2-2.28.tar.bz2 && cd minimap2-2.28 \
    && make -j"$(nproc)" && cp minimap2 /usr/local/bin/ \
    && cd /tmp && rm -rf minimap2-2.28*

# ---- FastQC 0.12.1 (Java-based, arch-independent) ----
RUN cd /opt \
    && wget -q https://www.bioinformatics.babraham.ac.uk/projects/fastqc/fastqc_v0.12.1.zip \
    && unzip -q fastqc_v0.12.1.zip && rm fastqc_v0.12.1.zip \
    && chmod +x /opt/FastQC/fastqc \
    && ln -s /opt/FastQC/fastqc /usr/local/bin/fastqc

# ---- GATK 4.5.0.0 (Java-based, arch-independent) ----
RUN cd /opt \
    && wget -q https://github.com/broadinstitute/gatk/releases/download/4.5.0.0/gatk-4.5.0.0.zip \
    && unzip -q gatk-4.5.0.0.zip && rm gatk-4.5.0.0.zip \
    && ln -s /opt/gatk-4.5.0.0/gatk /usr/local/bin/gatk

# ---- MultiQC (pip) ----
RUN pip install --no-cache-dir multiqc

# ---- Strip build deps to shrink the image ----
RUN apt-get purge -y build-essential autoconf automake \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /tmp/*

# ---- Application setup ----
WORKDIR /app

# Install Python backend dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create persistent data directories
RUN mkdir -p /app/data/uploads /app/data/results /app/data/references /app/data/temp

WORKDIR /app/backend

EXPOSE 8000

# Default environment variables (overridable via docker-compose)
ENV UPLOAD_DIR=/app/data/uploads \
    RESULTS_DIR=/app/data/results \
    REFERENCES_DIR=/app/data/references \
    TEMP_DIR=/app/data/temp

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
