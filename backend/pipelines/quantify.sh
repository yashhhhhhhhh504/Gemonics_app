#!/bin/bash
# ============================================================================
# NGS Pipeline - RNA-seq Quantification Step
# Uses featureCounts or HTSeq for gene-level quantification
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  RNA-seq QUANTIFICATION"
echo "  $(date)"
echo "=========================================="

QUANT_DIR="${NGS_RESULTS_DIR}/quantification"
mkdir -p "${QUANT_DIR}"

BAM_LIST=$(cat "${NGS_RESULTS_DIR}/.aligned_bams.txt")
IFS=',' read -ra BAM_FILES <<< "${BAM_LIST}"

GTF_FILE="${NGS_REFERENCES_DIR}/genes.gtf"

if [ ! -f "${GTF_FILE}" ]; then
    echo "[QUANT] WARNING: GTF annotation file not found at ${GTF_FILE}"
    echo "[QUANT] Please download the GTF file for your genome."
    echo "[QUANT] For GRCh38: https://ftp.ensembl.org/pub/release-110/gtf/homo_sapiens/"
    echo "[QUANT] Skipping quantification."
    exit 0
fi

if command -v featureCounts &>/dev/null; then
    echo "[QUANT] Running featureCounts..."
    featureCounts \
        -T "${NGS_THREADS}" \
        -a "${GTF_FILE}" \
        -o "${QUANT_DIR}/gene_counts.txt" \
        -p --countReadPairs \
        -B -C \
        "${BAM_FILES[@]}"

    # Extract just the counts (remove header/metadata columns)
    tail -n +2 "${QUANT_DIR}/gene_counts.txt" | cut -f1,7- > "${QUANT_DIR}/gene_counts_matrix.txt"
    echo "[QUANT] featureCounts completed"
elif command -v htseq-count &>/dev/null; then
    echo "[QUANT] Running HTSeq-count..."
    for bam in "${BAM_FILES[@]}"; do
        sample=$(basename "${bam}" .sorted.bam)
        htseq-count \
            -f bam \
            -r pos \
            -s no \
            "${bam}" "${GTF_FILE}" \
            > "${QUANT_DIR}/${sample}_counts.txt"
    done
    echo "[QUANT] HTSeq-count completed"
else
    echo "[QUANT] WARNING: Neither featureCounts nor htseq-count found."
    echo "[QUANT] Install subread (featureCounts) for quantification."
    exit 0
fi

echo "[QUANT] Quantification step completed successfully"
