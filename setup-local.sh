#!/usr/bin/env bash
# ============================================================================
# NGS Analysis Platform — Local Setup (macOS / Linux)
#
# This script:
#   1. Installs all runtime dependencies (Python, Node, bioinfo tools)
#   2. Creates a Python venv and installs backend packages
#   3. Installs frontend packages and builds the production bundle
#   4. Verifies every pipeline script has the tools it needs
#
# Usage:
#   chmod +x setup-local.sh && ./setup-local.sh
#
# After setup, start the platform with:
#   ./start.command          (macOS — double-click)
#   bash start.command       (Linux)
# ============================================================================
set -euo pipefail

# ---- Colours ----------------------------------------------------------------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  NGS Analysis Platform — Setup${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ---- Detect OS & package manager -------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"

BREW=false; APT=false; YUM=false
command -v brew   &>/dev/null && BREW=true
command -v apt-get &>/dev/null && APT=true
command -v yum    &>/dev/null && YUM=true

PIP="pip3"; command -v pip3 &>/dev/null || PIP="pip"

ok()   { echo -e "  ${GREEN}[OK]${NC} $*"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $*"; }
info() { echo -e "  ${CYAN}[..]${NC} $*"; }

# ---- Helper: try to install a CLI tool --------------------------------------
install_tool() {
    local cmd="$1"
    local brew_pkg="${2:-$1}"
    local apt_pkg="${3:-$2}"

    if command -v "$cmd" &>/dev/null; then
        ok "$cmd already installed"
        return 0
    fi

    # Try Homebrew (macOS / Linuxbrew)
    if $BREW; then
        info "Installing $cmd via Homebrew ($brew_pkg)..."
        if brew install "$brew_pkg" &>/dev/null 2>&1; then
            ok "$cmd installed"; return 0
        fi
    fi

    # Try apt (Debian / Ubuntu)
    if $APT; then
        info "Installing $cmd via apt ($apt_pkg)..."
        if sudo apt-get install -y -qq "$apt_pkg" &>/dev/null 2>&1; then
            ok "$cmd installed"; return 0
        fi
    fi

    # Try yum (CentOS / RHEL)
    if $YUM; then
        info "Installing $cmd via yum ($apt_pkg)..."
        if sudo yum install -y -q "$apt_pkg" &>/dev/null 2>&1; then
            ok "$cmd installed"; return 0
        fi
    fi

    warn "$cmd could not be installed automatically"
    return 1
}

install_pip_tool() {
    local cmd="$1"; local pkg="${2:-$1}"
    if command -v "$cmd" &>/dev/null; then
        ok "$cmd already installed"; return 0
    fi
    info "Installing $cmd via pip ($pkg)..."
    if $PIP install --quiet "$pkg" 2>/dev/null; then
        ok "$cmd installed"; return 0
    fi
    warn "$cmd pip install failed"; return 1
}

# =============================================================================
# 1. Core runtimes
# =============================================================================
echo -e "${CYAN}[1/6] Core runtimes${NC}"

# Python
if command -v python3 &>/dev/null; then
    ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
else
    fail "Python 3 is required — https://www.python.org/downloads/"
    exit 1
fi

# Node.js
if command -v node &>/dev/null; then
    ok "Node.js $(node --version)"
else
    fail "Node.js is required — https://nodejs.org/"
    exit 1
fi

# Java (optional but useful for GATK/snpEff)
if command -v java &>/dev/null; then
    ok "Java found"
else
    warn "Java not found (needed for GATK & snpEff)"
    echo "       Install: brew install openjdk  OR  sudo apt install default-jre"
fi

# =============================================================================
# 2. Bioinformatics tools
# =============================================================================
echo ""
echo -e "${CYAN}[2/6] Bioinformatics tools${NC}"

echo ""
echo "  -- QC & Trimming --"
install_tool  "fastqc"   "fastqc"    "fastqc"
install_tool  "fastp"    "fastp"     "fastp"
install_pip_tool "multiqc"

echo ""
echo "  -- Alignment --"
install_tool  "bwa"       "bwa"       "bwa"
install_tool  "samtools"  "samtools"  "samtools"
install_tool  "minimap2"  "minimap2"  "minimap2"
install_tool  "hisat2"    "hisat2"    "hisat2"

echo ""
echo "  -- Variant Calling & Annotation --"
install_tool  "bcftools"  "bcftools"  "bcftools"

if command -v gatk &>/dev/null; then
    ok "gatk"
else
    warn "gatk not found — samtools/bcftools used as fallback"
    echo "       Install: conda install -c bioconda gatk4"
fi

if command -v snpEff &>/dev/null; then
    ok "snpEff"
else
    warn "snpEff not found — bcftools used as fallback"
    echo "       Install: conda install -c bioconda snpeff"
fi

echo ""
echo "  -- RNA-seq Quantification --"
install_tool  "featureCounts" "subread" "subread"
install_pip_tool "htseq-count" "HTSeq"

# =============================================================================
# 3. Data directories
# =============================================================================
echo ""
echo -e "${CYAN}[3/6] Data directories${NC}"
mkdir -p "${PROJECT_DIR}/data"/{uploads,results,references,temp}
ok "data/{uploads,results,references,temp}"

# =============================================================================
# 4. Python backend
# =============================================================================
echo ""
echo -e "${CYAN}[4/6] Python backend${NC}"
cd "${PROJECT_DIR}/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    ok "Virtual environment created"
else
    ok "Virtual environment exists"
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip 2>/dev/null || true
pip install --quiet -r requirements.txt 2>/dev/null
ok "Backend dependencies installed"

# =============================================================================
# 5. Frontend
# =============================================================================
echo ""
echo -e "${CYAN}[5/6] Frontend${NC}"
cd "${PROJECT_DIR}/frontend"
npm install --silent 2>/dev/null
npm run build --silent 2>/dev/null
ok "Frontend built (dist/)"

# =============================================================================
# 6. Verify pipelines
# =============================================================================
echo ""
echo -e "${CYAN}[6/6] Pipeline readiness${NC}"
echo ""

READY=0; FALLBACK=0; MISSING=0

check_pipeline() {
    local name="$1"; shift
    local all_ok=true has_fallback=false missing=""

    while [ $# -gt 0 ]; do
        local entry="$1"; shift
        if [[ "$entry" == *"|"* ]]; then
            IFS='|' read -ra alts <<< "$entry"
            local found=false
            for alt in "${alts[@]}"; do
                command -v "$alt" &>/dev/null && { found=true; break; }
            done
            if ! $found; then
                all_ok=false; missing="$missing (${entry//|/ or })"
            elif ! command -v "${alts[0]}" &>/dev/null; then
                has_fallback=true
            fi
        else
            command -v "$entry" &>/dev/null || { all_ok=false; missing="$missing $entry"; }
        fi
    done

    if $all_ok && ! $has_fallback; then
        echo -e "  ${GREEN}[READY]${NC}     $name"
        READY=$((READY + 1))
    elif $all_ok; then
        echo -e "  ${YELLOW}[FALLBACK]${NC}  $name"
        FALLBACK=$((FALLBACK + 1))
    else
        echo -e "  ${RED}[MISSING]${NC}   $name — needs:${missing}"
        MISSING=$((MISSING + 1))
    fi
}

check_pipeline "QC"              "fastqc" "multiqc"
check_pipeline "Trimming"        "fastp"
check_pipeline "Post-Trim QC"    "fastqc" "multiqc"
check_pipeline "DNA Alignment"   "bwa" "samtools"
check_pipeline "RNA Alignment"   "samtools" "hisat2|minimap2"
check_pipeline "Post-Alignment"  "samtools" "gatk|samtools"
check_pipeline "Variant Calling" "gatk|bcftools"
check_pipeline "Annotation"      "snpEff|bcftools"
check_pipeline "Quantification"  "featureCounts|htseq-count"
check_pipeline "Report"          "bcftools"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "  Ready: ${GREEN}${READY}${NC}  Fallback: ${YELLOW}${FALLBACK}${NC}  Missing: ${RED}${MISSING}${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
if [ $MISSING -eq 0 ]; then
    echo -e "  ${GREEN}All pipelines are operational.${NC}"
fi
echo ""
echo "  To start the platform:"
echo ""
echo "    ./start.command"
echo ""
echo "  Or manually:"
echo "    cd backend && source venv/bin/activate"
echo "    uvicorn main:app --host 127.0.0.1 --port 8000"
echo "    Then open http://localhost:8000"
echo ""
