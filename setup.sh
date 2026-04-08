#!/bin/bash
# ============================================================================
# NGS Analysis Platform - Quick Setup Script
# Run this to install and start the platform
# ============================================================================
set -euo pipefail

echo "============================================"
echo "  NGS Analysis Platform - Setup"
echo "============================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Docker
if command -v docker &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Docker found: $(docker --version)"
else
    echo -e "${RED}[ERROR]${NC} Docker is not installed."
    echo "  Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if docker compose version &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Docker Compose found"
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Docker Compose found: $(docker-compose --version)"
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}[ERROR]${NC} Docker Compose is not installed."
    echo "  Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Create data directories
echo ""
echo "Creating data directories..."
mkdir -p data/{uploads,results,references,temp}
echo -e "${GREEN}[OK]${NC} Data directories created"

# Generate secret key if not set
if grep -q "change-this-to-a-secure-random-string" docker-compose.yml 2>/dev/null; then
    SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "auto-generated-secret-$(date +%s)")
    echo -e "${YELLOW}[INFO]${NC} Generated secret key"
fi

echo ""
echo "============================================"
echo "  Building and starting the platform..."
echo "============================================"
echo ""

$COMPOSE_CMD up --build -d

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  NGS Analysis Platform is running!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Open in your browser:  http://localhost:8000"
echo ""
echo "  Next steps:"
echo "  1. Register an account at the login page"
echo "  2. Create a project and upload your FASTQ files"
echo "  3. Select a pipeline and start analysis"
echo ""
echo "  Reference genomes:"
echo "  Place reference genome files in: ./data/references/"
echo "  Required files:"
echo "    - genome.fa       (reference FASTA)"
echo "    - genome.fa.fai   (FASTA index, auto-generated)"
echo "    - genes.gtf       (GTF annotation, for RNA-seq)"
echo ""
echo "  Download GRCh38 reference:"
echo "    wget https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/000/001/405/GCA_000001405.15_GRCh38/seqs_for_alignment_pipelines.ucsc_ids/GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz"
echo "    gunzip GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz"
echo "    mv GCA_000001405.15_GRCh38_no_alt_analysis_set.fna data/references/genome.fa"
echo ""
echo "  Useful commands:"
echo "    Stop:    $COMPOSE_CMD down"
echo "    Logs:    $COMPOSE_CMD logs -f"
echo "    Restart: $COMPOSE_CMD restart"
echo ""
