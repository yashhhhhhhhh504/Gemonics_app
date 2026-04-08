#!/bin/bash
# ============================================================================
# NGS Pipeline - RNA-seq Alignment Step
# Uses HISAT2 or STAR for splice-aware alignment
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  RNA-seq ALIGNMENT"
echo "  $(date)"
echo "=========================================="

ALIGN_DIR="${NGS_RESULTS_DIR}/alignment"
mkdir -p "${ALIGN_DIR}"

# Use trimmed reads if available
if [ -f "${NGS_RESULTS_DIR}/.trimmed_r1.txt" ]; then
    SAMPLE_R1=$(cat "${NGS_RESULTS_DIR}/.trimmed_r1.txt")
    SAMPLE_R2=$(cat "${NGS_RESULTS_DIR}/.trimmed_r2.txt" 2>/dev/null || echo "")
else
    SAMPLE_R1="${NGS_SAMPLE_R1}"
    SAMPLE_R2="${NGS_SAMPLE_R2:-}"
fi

IFS=',' read -ra R1_FILES <<< "${SAMPLE_R1}"
IFS=',' read -ra R2_FILES <<< "${SAMPLE_R2:-}"

REFERENCE="${NGS_REFERENCES_DIR}/genome.fa"

BAM_FILES=()

for i in "${!R1_FILES[@]}"; do
    r1="${R1_FILES[$i]}"
    basename_r1=$(basename "${r1}" | sed 's/_trimmed\.\(fastq\|fq\)\(\.gz\)\?$//' | sed 's/\.\(fastq\|fq\)\(\.gz\)\?$//')
    output_bam="${ALIGN_DIR}/${basename_r1}.sorted.bam"

    echo "[ALIGN-RNA] Aligning: ${basename_r1}"

    if command -v hisat2 &>/dev/null; then
        HISAT2_INDEX="${NGS_REFERENCES_DIR}/hisat2_index/genome"
        if [ ! -f "${HISAT2_INDEX}.1.ht2" ]; then
            echo "[ALIGN-RNA] Building HISAT2 index..."
            mkdir -p "$(dirname ${HISAT2_INDEX})"
            hisat2-build -p "${NGS_THREADS}" "${REFERENCE}" "${HISAT2_INDEX}"
        fi

        if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
            hisat2 -p "${NGS_THREADS}" -x "${HISAT2_INDEX}" \
                -1 "${r1}" -2 "${R2_FILES[$i]}" \
                --dta \
            | ${SAMTOOLS_PATH:-samtools} sort -@ "${NGS_THREADS}" -o "${output_bam}" -
        else
            hisat2 -p "${NGS_THREADS}" -x "${HISAT2_INDEX}" \
                -U "${r1}" \
                --dta \
            | ${SAMTOOLS_PATH:-samtools} sort -@ "${NGS_THREADS}" -o "${output_bam}" -
        fi
    else
        # Fallback to minimap2 for RNA-seq
        echo "[ALIGN-RNA] Using minimap2 for splice-aware alignment"
        if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
            ${MINIMAP2_PATH:-minimap2} -t "${NGS_THREADS}" -ax splice \
                "${REFERENCE}" "${r1}" "${R2_FILES[$i]}" \
            | ${SAMTOOLS_PATH:-samtools} sort -@ "${NGS_THREADS}" -o "${output_bam}" -
        else
            ${MINIMAP2_PATH:-minimap2} -t "${NGS_THREADS}" -ax splice \
                "${REFERENCE}" "${r1}" \
            | ${SAMTOOLS_PATH:-samtools} sort -@ "${NGS_THREADS}" -o "${output_bam}" -
        fi
    fi

    ${SAMTOOLS_PATH:-samtools} index -@ "${NGS_THREADS}" "${output_bam}"
    ${SAMTOOLS_PATH:-samtools} flagstat "${output_bam}" > "${ALIGN_DIR}/${basename_r1}.flagstat.txt"

    BAM_FILES+=("${output_bam}")
    echo "[ALIGN-RNA] Alignment completed: ${basename_r1}"
done

echo "$(IFS=','; echo "${BAM_FILES[*]}")" > "${NGS_RESULTS_DIR}/.aligned_bams.txt"

echo "[ALIGN-RNA] RNA-seq alignment step completed successfully"
