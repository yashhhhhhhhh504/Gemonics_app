#!/bin/bash
# ============================================================================
# NGS Pipeline - Post-Alignment Processing
# Mark duplicates and optional BQSR
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  POST-ALIGNMENT PROCESSING"
echo "  $(date)"
echo "=========================================="

ALIGN_DIR="${NGS_RESULTS_DIR}/alignment"
REFERENCE="${NGS_REFERENCES_DIR}/genome.fa"

BAM_LIST=$(cat "${NGS_RESULTS_DIR}/.aligned_bams.txt")
IFS=',' read -ra BAM_FILES <<< "${BAM_LIST}"

PROCESSED_BAMS=()

for bam in "${BAM_FILES[@]}"; do
    basename_bam=$(basename "${bam}" .sorted.bam)
    dedup_bam="${ALIGN_DIR}/${basename_bam}.dedup.bam"
    metrics_file="${ALIGN_DIR}/${basename_bam}.dedup_metrics.txt"

    echo "[POST] Marking duplicates: ${basename_bam}"

    if command -v ${GATK_PATH:-gatk} &>/dev/null; then
        # Use GATK MarkDuplicates
        ${GATK_PATH:-gatk} MarkDuplicates \
            -I "${bam}" \
            -O "${dedup_bam}" \
            -M "${metrics_file}" \
            --REMOVE_DUPLICATES false \
            --CREATE_INDEX true \
            --java-options "-Xmx${NGS_MEMORY_GB}g"
    else
        # Fallback to samtools markdup
        echo "[POST] GATK not found, using samtools markdup"
        ${SAMTOOLS_PATH:-samtools} markdup \
            -@ "${NGS_THREADS}" \
            --write-index \
            "${bam}" "${dedup_bam}"
        ${SAMTOOLS_PATH:-samtools} index "${dedup_bam}"
    fi

    # BQSR if known sites VCF is available and not in fast mode
    KNOWN_SITES="${NGS_REFERENCES_DIR}/known_sites.vcf.gz"
    if [ "${NGS_RUN_MODE}" != "fast" ] && command -v ${GATK_PATH:-gatk} &>/dev/null && [ -f "${KNOWN_SITES}" ]; then
        echo "[POST] Running Base Quality Score Recalibration: ${basename_bam}"
        recal_table="${ALIGN_DIR}/${basename_bam}.recal_data.table"
        bqsr_bam="${ALIGN_DIR}/${basename_bam}.bqsr.bam"

        ${GATK_PATH:-gatk} BaseRecalibrator \
            -I "${dedup_bam}" \
            -R "${REFERENCE}" \
            --known-sites "${KNOWN_SITES}" \
            -O "${recal_table}" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        ${GATK_PATH:-gatk} ApplyBQSR \
            -I "${dedup_bam}" \
            -R "${REFERENCE}" \
            --bqsr-recal-file "${recal_table}" \
            -O "${bqsr_bam}" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        ${SAMTOOLS_PATH:-samtools} index "${bqsr_bam}"
        PROCESSED_BAMS+=("${bqsr_bam}")
        echo "[POST] BQSR completed: ${basename_bam}"
    else
        PROCESSED_BAMS+=("${dedup_bam}")
        if [ "${NGS_RUN_MODE}" = "fast" ]; then
            echo "[POST] Skipping BQSR (fast mode)"
        fi
    fi
done

echo "$(IFS=','; echo "${PROCESSED_BAMS[*]}")" > "${NGS_RESULTS_DIR}/.processed_bams.txt"

echo "[POST] Post-alignment processing completed successfully"
