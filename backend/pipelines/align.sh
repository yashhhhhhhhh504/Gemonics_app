#!/bin/bash
# ============================================================================
# NGS Pipeline - Alignment Step
# Aligns reads to reference genome using BWA-MEM2 or BWA-MEM
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  ALIGNMENT"
echo "  $(date)"
echo "=========================================="

ALIGN_DIR="${NGS_RESULTS_DIR}/alignment"
mkdir -p "${ALIGN_DIR}"

# Use trimmed reads if available, otherwise raw
if [ -f "${NGS_RESULTS_DIR}/.trimmed_r1.txt" ]; then
    SAMPLE_R1=$(cat "${NGS_RESULTS_DIR}/.trimmed_r1.txt")
    SAMPLE_R2=$(cat "${NGS_RESULTS_DIR}/.trimmed_r2.txt" 2>/dev/null || echo "")
else
    SAMPLE_R1="${NGS_SAMPLE_R1}"
    SAMPLE_R2="${NGS_SAMPLE_R2:-}"
fi

IFS=',' read -ra R1_FILES <<< "${SAMPLE_R1}"
IFS=',' read -ra R2_FILES <<< "${SAMPLE_R2:-}"

# Reference genome
REFERENCE="${NGS_REFERENCES_DIR}/genome.fa"
if [ ! -f "${REFERENCE}" ]; then
    echo "[ALIGN] ERROR: Reference genome not found at ${REFERENCE}"
    echo "[ALIGN] Please download and place your reference genome at: ${NGS_REFERENCES_DIR}/genome.fa"
    echo "[ALIGN] For GRCh38: https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/000/001/405/GCA_000001405.15_GRCh38/seqs_for_alignment_pipelines.ucsc_ids/"
    exit 1
fi

# Check BWA index
if [ ! -f "${REFERENCE}.bwt" ] && [ ! -f "${REFERENCE}.bwt.2bit.64" ]; then
    echo "[ALIGN] Building BWA index (this may take a while for large genomes)..."
    ${BWA_PATH:-bwa} index "${REFERENCE}"
fi

# Create samtools fai index if missing
if [ ! -f "${REFERENCE}.fai" ]; then
    echo "[ALIGN] Creating samtools fai index..."
    ${SAMTOOLS_PATH:-samtools} faidx "${REFERENCE}"
fi

# Create GATK/Picard sequence dictionary if missing
DICT_FILE="${REFERENCE%.fa}.dict"
if [ ! -f "${DICT_FILE}" ] && command -v ${GATK_PATH:-gatk} &>/dev/null; then
    echo "[ALIGN] Creating sequence dictionary..."
    ${GATK_PATH:-gatk} CreateSequenceDictionary -R "${REFERENCE}" 2>/dev/null || \
        ${SAMTOOLS_PATH:-samtools} dict "${REFERENCE}" -o "${DICT_FILE}" 2>/dev/null || true
fi

BAM_FILES=()

for i in "${!R1_FILES[@]}"; do
    r1="${R1_FILES[$i]}"
    basename_r1=$(basename "${r1}" | sed 's/_trimmed\.\(fastq\|fq\)\(\.gz\)\?$//' | sed 's/\.\(fastq\|fq\)\(\.gz\)\?$//')
    output_bam="${ALIGN_DIR}/${basename_r1}.sorted.bam"

    RGID="${basename_r1}"
    RGSM="${basename_r1}"
    RGLB="lib1"
    RGPL="ILLUMINA"
    RGPU="unit1"

    echo "[ALIGN] Aligning: ${basename_r1}"

    if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
        # Paired-end alignment
        ${BWA_PATH:-bwa} mem \
            -t "${NGS_THREADS}" \
            -R "@RG\tID:${RGID}\tSM:${RGSM}\tLB:${RGLB}\tPL:${RGPL}\tPU:${RGPU}" \
            "${REFERENCE}" \
            "${r1}" "${R2_FILES[$i]}" \
        | ${SAMTOOLS_PATH:-samtools} sort \
            -@ "${NGS_THREADS}" \
            -m "$(( NGS_MEMORY_GB * 1024 / NGS_THREADS ))M" \
            -o "${output_bam}" -
    else
        # Single-end alignment
        ${BWA_PATH:-bwa} mem \
            -t "${NGS_THREADS}" \
            -R "@RG\tID:${RGID}\tSM:${RGSM}\tLB:${RGLB}\tPL:${RGPL}\tPU:${RGPU}" \
            "${REFERENCE}" \
            "${r1}" \
        | ${SAMTOOLS_PATH:-samtools} sort \
            -@ "${NGS_THREADS}" \
            -m "$(( NGS_MEMORY_GB * 1024 / NGS_THREADS ))M" \
            -o "${output_bam}" -
    fi

    # Index BAM
    ${SAMTOOLS_PATH:-samtools} index -@ "${NGS_THREADS}" "${output_bam}"

    # Alignment stats
    ${SAMTOOLS_PATH:-samtools} flagstat "${output_bam}" > "${ALIGN_DIR}/${basename_r1}.flagstat.txt"
    ${SAMTOOLS_PATH:-samtools} stats "${output_bam}" > "${ALIGN_DIR}/${basename_r1}.stats.txt"

    BAM_FILES+=("${output_bam}")
    echo "[ALIGN] Alignment completed: ${basename_r1}"
done

# Export BAM paths for downstream
echo "$(IFS=','; echo "${BAM_FILES[*]}")" > "${NGS_RESULTS_DIR}/.aligned_bams.txt"

echo "[ALIGN] Alignment step completed successfully"
