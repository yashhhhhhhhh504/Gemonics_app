#!/bin/bash
# ============================================================================
# NGS Pipeline - Post-Trim Quality Control
# Runs FastQC and MultiQC on trimmed reads so user can verify trim quality
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  POST-TRIM QUALITY CONTROL"
echo "  $(date)"
echo "=========================================="

POST_TRIM_QC_DIR="${NGS_RESULTS_DIR}/post_trim_qc"
mkdir -p "${POST_TRIM_QC_DIR}"

TRIM_DIR="${NGS_RESULTS_DIR}/trimmed"

# Find trimmed files
TRIMMED_FILES=()
if [ -d "${TRIM_DIR}" ]; then
    while IFS= read -r -d '' f; do
        TRIMMED_FILES+=("$f")
    done < <(find "${TRIM_DIR}" -name "*_trimmed.fastq.gz" -print0 2>/dev/null)
fi

if [ ${#TRIMMED_FILES[@]} -eq 0 ]; then
    echo "[POST_TRIM_QC] No trimmed files found, skipping post-trim QC"
    echo "[POST_TRIM_QC] Post-trim QC step completed successfully"
    exit 0
fi

# Run FastQC on trimmed reads
if command -v ${FASTQC_PATH:-fastqc} &>/dev/null; then
    for f in "${TRIMMED_FILES[@]}"; do
        echo "[POST_TRIM_QC] Running FastQC on: $(basename ${f})"
        ${FASTQC_PATH:-fastqc} \
            --outdir "${POST_TRIM_QC_DIR}" \
            --threads "${NGS_THREADS}" \
            --quiet \
            "${f}"
    done
    echo "[POST_TRIM_QC] FastQC completed for all trimmed files"
else
    echo "[POST_TRIM_QC] WARNING: FastQC not found, skipping FastQC on trimmed reads"
fi

# Run MultiQC to aggregate post-trim reports
if command -v ${MULTIQC_PATH:-multiqc} &>/dev/null; then
    ${MULTIQC_PATH:-multiqc} \
        "${POST_TRIM_QC_DIR}" "${TRIM_DIR}" \
        -o "${POST_TRIM_QC_DIR}" \
        --filename "multiqc_post_trim" \
        --title "Post-Trimming Quality Report" \
        --quiet \
        --force
    echo "[POST_TRIM_QC] MultiQC post-trim report generated"
else
    echo "[POST_TRIM_QC] WARNING: MultiQC not found, skipping aggregated post-trim report"
fi

# Also generate a comparative MultiQC with both pre and post trim
QC_DIR="${NGS_RESULTS_DIR}/qc"
if command -v ${MULTIQC_PATH:-multiqc} &>/dev/null && [ -d "${QC_DIR}" ]; then
    ${MULTIQC_PATH:-multiqc} \
        "${QC_DIR}" "${POST_TRIM_QC_DIR}" "${TRIM_DIR}" \
        -o "${POST_TRIM_QC_DIR}" \
        --filename "multiqc_comparison" \
        --title "Pre vs Post Trimming Comparison" \
        --quiet \
        --force
    echo "[POST_TRIM_QC] Comparison MultiQC report generated"
fi

echo "[POST_TRIM_QC] Post-trim QC step completed successfully"
