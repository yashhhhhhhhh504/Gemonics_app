# ============================================================================
# NGS Analysis Platform - Setup (Windows)
# Run: Right-click > "Run with PowerShell" or: powershell -ExecutionPolicy Bypass -File setup-windows.ps1
# ============================================================================
$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NGS Analysis Platform - Windows Setup"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------------
# 1. Check core runtimes
# --------------------------------------------------------------------------
Write-Host "[1/6] Checking core runtimes..." -ForegroundColor Cyan

# Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python3 -ErrorAction SilentlyContinue }
if ($python) {
    $pyVer = & $python.Source --version 2>&1
    Write-Host "  [OK] $pyVer" -ForegroundColor Green
    $PY = $python.Source
} else {
    Write-Host "  [ERROR] Python 3 required — https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}

# Node
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "  [OK] Node.js $(node --version)" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Node.js required — https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Java
$java = Get-Command java -ErrorAction SilentlyContinue
if ($java) {
    Write-Host "  [OK] Java found" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Java not found (needed for GATK/snpEff)" -ForegroundColor Yellow
}

# Check for package managers
$hasChoco = $null -ne (Get-Command choco -ErrorAction SilentlyContinue)
$hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
$hasConda = $null -ne (Get-Command conda -ErrorAction SilentlyContinue)

# --------------------------------------------------------------------------
# 2. Bioinformatics tools
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/6] Checking bioinformatics tools..." -ForegroundColor Cyan

function Check-Tool {
    param([string]$Name, [string]$InstallHint)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "  [OK] $Name" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  [MISSING] $Name — $InstallHint" -ForegroundColor Yellow
        return $false
    }
}

Write-Host ""
Write-Host "  -- QC & Trimming --"
Check-Tool "fastqc"    "Download from https://www.bioinformatics.babraham.ac.uk/projects/fastqc/"
Check-Tool "fastp"     "Download from https://github.com/OpenGene/fastp/releases"
Check-Tool "multiqc"   "pip install multiqc"

# Auto-install multiqc if missing
if (-not (Get-Command multiqc -ErrorAction SilentlyContinue)) {
    Write-Host "  [INSTALLING] multiqc via pip..." -ForegroundColor Yellow
    & $PY -m pip install --quiet multiqc 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "  [OK] multiqc installed" -ForegroundColor Green }
}

Write-Host ""
Write-Host "  -- Alignment --"
Check-Tool "bwa"       "conda install -c bioconda bwa"
Check-Tool "samtools"  "conda install -c bioconda samtools"
Check-Tool "minimap2"  "conda install -c bioconda minimap2"
Check-Tool "hisat2"    "conda install -c bioconda hisat2"

Write-Host ""
Write-Host "  -- Variant Calling & Annotation --"
Check-Tool "bcftools"  "conda install -c bioconda bcftools"
Check-Tool "gatk"      "conda install -c bioconda gatk4"
Check-Tool "snpEff"    "conda install -c bioconda snpeff"

Write-Host ""
Write-Host "  -- Quantification --"
Check-Tool "featureCounts" "conda install -c bioconda subread"
Check-Tool "htseq-count"   "pip install HTSeq"

if ($hasConda) {
    Write-Host ""
    Write-Host "  Conda detected. To install all tools at once:" -ForegroundColor Cyan
    Write-Host "    conda install -c bioconda fastqc fastp bwa samtools bcftools minimap2 hisat2 subread" -ForegroundColor White
}

# --------------------------------------------------------------------------
# 3. Data directories
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/6] Creating data directories..." -ForegroundColor Cyan
$dirs = @("uploads", "results", "references", "temp")
foreach ($d in $dirs) {
    $path = Join-Path $ProjectDir "data\$d"
    if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}
Write-Host "  [OK] data\{uploads,results,references,temp}" -ForegroundColor Green

# --------------------------------------------------------------------------
# 4. Python backend
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "[4/6] Setting up Python backend..." -ForegroundColor Cyan
Set-Location (Join-Path $ProjectDir "backend")

if (-not (Test-Path "venv")) {
    & $PY -m venv venv
    Write-Host "  [OK] Created virtual environment" -ForegroundColor Green
}

# Activate and install
& ".\venv\Scripts\Activate.ps1"
pip install --quiet -r requirements.txt 2>$null
Write-Host "  [OK] Backend dependencies installed" -ForegroundColor Green

# --------------------------------------------------------------------------
# 5. Frontend
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "[5/6] Setting up frontend..." -ForegroundColor Cyan
Set-Location (Join-Path $ProjectDir "frontend")
npm install --silent 2>$null
npm run build --silent 2>$null
Write-Host "  [OK] Frontend built" -ForegroundColor Green

# --------------------------------------------------------------------------
# 6. Summary
# --------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To start: double-click 'Start NGS Platform.bat'"
Write-Host "  Or run:   powershell -File start-windows.ps1"
Write-Host ""

Set-Location $ProjectDir
