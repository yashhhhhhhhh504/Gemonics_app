#!/bin/bash
# ============================================================================
# NGS Pipeline - Quality Control Step
# Runs FastQC and/or fastp for raw read quality assessment
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  QUALITY CONTROL"
echo "  $(date)"
echo "=========================================="

QC_DIR="${NGS_RESULTS_DIR}/qc"
mkdir -p "${QC_DIR}"

IFS=',' read -ra R1_FILES <<< "${NGS_SAMPLE_R1}"
IFS=',' read -ra R2_FILES <<< "${NGS_SAMPLE_R2:-}"

for i in "${!R1_FILES[@]}"; do
    r1="${R1_FILES[$i]}"
    echo "[QC] Processing: $(basename ${r1})"

    # Run FastQC if available
    if command -v ${FASTQC_PATH:-fastqc} &>/dev/null; then
        ${FASTQC_PATH:-fastqc} \
            --outdir "${QC_DIR}" \
            --threads "${NGS_THREADS}" \
            --quiet \
            "${r1}"

        if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
            ${FASTQC_PATH:-fastqc} \
                --outdir "${QC_DIR}" \
                --threads "${NGS_THREADS}" \
                --quiet \
                "${R2_FILES[$i]}"
        fi
        echo "[QC] FastQC completed for $(basename ${r1})"
    else
        echo "[QC] WARNING: FastQC not found, skipping FastQC analysis"
    fi
done

# Run MultiQC to aggregate reports
if command -v ${MULTIQC_PATH:-multiqc} &>/dev/null; then
    ${MULTIQC_PATH:-multiqc} \
        "${QC_DIR}" \
        -o "${QC_DIR}" \
        --filename "multiqc_report" \
        --quiet \
        --force
    echo "[QC] MultiQC report generated"
else
    echo "[QC] WARNING: MultiQC not found, skipping aggregated report"
fi

# Generate QC summary
echo "QC completed at $(date)" > "${NGS_RESULTS_DIR}/qc_summary.txt"
echo "Samples processed: ${#R1_FILES[@]}" >> "${NGS_RESULTS_DIR}/qc_summary.txt"
echo "Reports available in: ${QC_DIR}" >> "${NGS_RESULTS_DIR}/qc_summary.txt"

echo "[QC] Quality control step completed successfully"
