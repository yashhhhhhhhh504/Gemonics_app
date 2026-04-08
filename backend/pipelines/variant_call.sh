#!/bin/bash
# ============================================================================
# NGS Pipeline - Variant Calling Step
# Uses GATK HaplotypeCaller or bcftools for variant calling
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  VARIANT CALLING"
echo "  $(date)"
echo "=========================================="

VCF_DIR="${NGS_RESULTS_DIR}/variants"
mkdir -p "${VCF_DIR}"

REFERENCE="${NGS_REFERENCES_DIR}/genome.fa"

# Use processed BAMs if available
if [ -f "${NGS_RESULTS_DIR}/.processed_bams.txt" ]; then
    BAM_LIST=$(cat "${NGS_RESULTS_DIR}/.processed_bams.txt")
else
    BAM_LIST=$(cat "${NGS_RESULTS_DIR}/.aligned_bams.txt")
fi

IFS=',' read -ra BAM_FILES <<< "${BAM_LIST}"

# Set caller confidence based on run mode
STAND_CALL_CONF=20
if [ "${NGS_RUN_MODE}" = "high_sensitivity" ]; then
    STAND_CALL_CONF=10
elif [ "${NGS_RUN_MODE}" = "fast" ]; then
    STAND_CALL_CONF=30
fi

VCF_FILES=()

for bam in "${BAM_FILES[@]}"; do
    basename_bam=$(basename "${bam}" | sed 's/\.\(dedup\|bqsr\|sorted\)\.bam$//')
    output_vcf="${VCF_DIR}/${basename_bam}.raw.vcf.gz"

    echo "[VC] Calling variants: ${basename_bam}"

    if command -v ${GATK_PATH:-gatk} &>/dev/null; then
        # GATK HaplotypeCaller
        ${GATK_PATH:-gatk} HaplotypeCaller \
            -I "${bam}" \
            -R "${REFERENCE}" \
            -O "${output_vcf}" \
            --native-pair-hmm-threads "${NGS_THREADS}" \
            --standard-min-confidence-threshold-for-calling "${STAND_CALL_CONF}" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        # Filter variants
        filtered_snp="${VCF_DIR}/${basename_bam}.filtered_snps.vcf.gz"
        filtered_indel="${VCF_DIR}/${basename_bam}.filtered_indels.vcf.gz"

        # Select and filter SNPs
        ${GATK_PATH:-gatk} SelectVariants \
            -R "${REFERENCE}" \
            -V "${output_vcf}" \
            --select-type-to-include SNP \
            -O "${VCF_DIR}/${basename_bam}.raw_snps.vcf.gz" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        ${GATK_PATH:-gatk} VariantFiltration \
            -R "${REFERENCE}" \
            -V "${VCF_DIR}/${basename_bam}.raw_snps.vcf.gz" \
            --filter-expression "QD < 2.0" --filter-name "LowQD" \
            --filter-expression "FS > 60.0" --filter-name "HighFS" \
            --filter-expression "MQ < 40.0" --filter-name "LowMQ" \
            --filter-expression "SOR > 3.0" --filter-name "HighSOR" \
            -O "${filtered_snp}" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        # Select and filter Indels
        ${GATK_PATH:-gatk} SelectVariants \
            -R "${REFERENCE}" \
            -V "${output_vcf}" \
            --select-type-to-include INDEL \
            -O "${VCF_DIR}/${basename_bam}.raw_indels.vcf.gz" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        ${GATK_PATH:-gatk} VariantFiltration \
            -R "${REFERENCE}" \
            -V "${VCF_DIR}/${basename_bam}.raw_indels.vcf.gz" \
            --filter-expression "QD < 2.0" --filter-name "LowQD" \
            --filter-expression "FS > 200.0" --filter-name "HighFS" \
            --filter-expression "SOR > 10.0" --filter-name "HighSOR" \
            -O "${filtered_indel}" \
            --java-options "-Xmx${NGS_MEMORY_GB}g"

        VCF_FILES+=("${filtered_snp}" "${filtered_indel}")
    else
        echo "[VC] GATK not found, using bcftools"
        # bcftools fallback
        ${BCFTOOLS_PATH:-bcftools} mpileup \
            -f "${REFERENCE}" \
            --threads "${NGS_THREADS}" \
            -d 250 \
            "${bam}" \
        | ${BCFTOOLS_PATH:-bcftools} call \
            -mv \
            --threads "${NGS_THREADS}" \
            -Oz \
            -o "${output_vcf}"

        ${BCFTOOLS_PATH:-bcftools} index "${output_vcf}"

        # Basic filtering
        filtered_vcf="${VCF_DIR}/${basename_bam}.filtered.vcf.gz"
        ${BCFTOOLS_PATH:-bcftools} filter \
            -i "QUAL>=${STAND_CALL_CONF} && DP>=5" \
            -Oz -o "${filtered_vcf}" \
            "${output_vcf}"
        ${BCFTOOLS_PATH:-bcftools} index "${filtered_vcf}"

        VCF_FILES+=("${filtered_vcf}")
    fi

    echo "[VC] Variant calling completed: ${basename_bam}"
done

# Generate variant stats
for vcf in "${VCF_FILES[@]}"; do
    if command -v ${BCFTOOLS_PATH:-bcftools} &>/dev/null; then
        ${BCFTOOLS_PATH:-bcftools} stats "${vcf}" > "${vcf%.vcf.gz}.stats.txt" 2>/dev/null || true
    fi
done

echo "$(IFS=','; echo "${VCF_FILES[*]}")" > "${NGS_RESULTS_DIR}/.variant_vcfs.txt"

# Write variant stats summary
echo "Variant calling completed at $(date)" > "${NGS_RESULTS_DIR}/variant_stats.txt"
echo "VCF files generated: ${#VCF_FILES[@]}" >> "${NGS_RESULTS_DIR}/variant_stats.txt"

echo "[VC] Variant calling step completed successfully"
