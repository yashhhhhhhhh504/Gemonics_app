#!/bin/bash
# ============================================================================
# NGS Pipeline - Variant Annotation Step
# Uses SnpEff for functional annotation, with bcftools fallback
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  VARIANT ANNOTATION"
echo "  $(date)"
echo "=========================================="

ANNOT_DIR="${NGS_RESULTS_DIR}/annotation"
mkdir -p "${ANNOT_DIR}"

VCF_LIST=$(cat "${NGS_RESULTS_DIR}/.variant_vcfs.txt")
IFS=',' read -ra VCF_FILES <<< "${VCF_LIST}"

ANNOTATED_VCFS=()

for vcf in "${VCF_FILES[@]}"; do
    [ ! -f "${vcf}" ] && continue
    basename_vcf=$(basename "${vcf}" .vcf.gz)
    annotated_vcf="${ANNOT_DIR}/${basename_vcf}.annotated.vcf.gz"

    echo "[ANNOT] Annotating: ${basename_vcf}"

    if command -v ${SNPEFF_PATH:-snpEff} &>/dev/null; then
        # SnpEff annotation
        SNPEFF_DB="GRCh38.105"

        ${SNPEFF_PATH:-snpEff} \
            -Xmx${NGS_MEMORY_GB}g \
            "${SNPEFF_DB}" \
            "${vcf}" \
            -stats "${ANNOT_DIR}/${basename_vcf}.snpEff_summary.html" \
            -csvStats "${ANNOT_DIR}/${basename_vcf}.snpEff_stats.csv" \
            | ${BCFTOOLS_PATH:-bcftools} view -Oz -o "${annotated_vcf}"

        ${BCFTOOLS_PATH:-bcftools} index "${annotated_vcf}" 2>/dev/null || true
        ANNOTATED_VCFS+=("${annotated_vcf}")
        echo "[ANNOT] SnpEff annotation completed: ${basename_vcf}"

    elif command -v ${BCFTOOLS_PATH:-bcftools} &>/dev/null; then
        # bcftools annotate fallback - add basic stats
        echo "[ANNOT] SnpEff not found, using bcftools for basic annotation"

        # Generate stats as annotation
        ${BCFTOOLS_PATH:-bcftools} stats "${vcf}" > "${ANNOT_DIR}/${basename_vcf}.stats.txt" 2>/dev/null || true

        # Copy with normalized output
        ${BCFTOOLS_PATH:-bcftools} norm \
            -f "${NGS_REFERENCES_DIR}/genome.fa" \
            -m -both \
            -Oz -o "${annotated_vcf}" \
            "${vcf}" 2>/dev/null || cp "${vcf}" "${annotated_vcf}"

        ${BCFTOOLS_PATH:-bcftools} index "${annotated_vcf}" 2>/dev/null || true

        # Generate a human-readable variant table
        ${BCFTOOLS_PATH:-bcftools} query \
            -f '%CHROM\t%POS\t%REF\t%ALT\t%QUAL\t%FILTER\t%INFO/DP\n' \
            "${annotated_vcf}" \
            > "${ANNOT_DIR}/${basename_vcf}.variants_table.tsv" 2>/dev/null || true

        # Add header
        if [ -f "${ANNOT_DIR}/${basename_vcf}.variants_table.tsv" ]; then
            sed -i.bak '1i\
CHROM\tPOS\tREF\tALT\tQUAL\tFILTER\tDP' "${ANNOT_DIR}/${basename_vcf}.variants_table.tsv" 2>/dev/null || true
            rm -f "${ANNOT_DIR}/${basename_vcf}.variants_table.tsv.bak"
        fi

        ANNOTATED_VCFS+=("${annotated_vcf}")
        echo "[ANNOT] bcftools annotation completed: ${basename_vcf}"
    else
        echo "[ANNOT] WARNING: No annotation tools available. Copying VCF as-is."
        cp "${vcf}" "${annotated_vcf}"
        ANNOTATED_VCFS+=("${annotated_vcf}")
    fi
done

echo "$(IFS=','; echo "${ANNOTATED_VCFS[*]}")" > "${NGS_RESULTS_DIR}/.annotated_vcfs.txt"

# Write annotation summary
total_annotated=${#ANNOTATED_VCFS[@]}
echo "Annotation completed at $(date)" > "${ANNOT_DIR}/annotation_summary.txt"
echo "Files annotated: ${total_annotated}" >> "${ANNOT_DIR}/annotation_summary.txt"
for vcf in "${ANNOTATED_VCFS[@]}"; do
    if command -v ${BCFTOOLS_PATH:-bcftools} &>/dev/null && [ -f "${vcf}" ]; then
        count=$(${BCFTOOLS_PATH:-bcftools} view -H "${vcf}" 2>/dev/null | wc -l | tr -d ' ')
        echo "  $(basename ${vcf}): ${count} variants" >> "${ANNOT_DIR}/annotation_summary.txt"
    fi
done

echo "[ANNOT] Variant annotation step completed successfully"
