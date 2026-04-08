#!/bin/bash
# ============================================================================
# NGS Pipeline - Read Trimming Step
# Uses fastp for adapter trimming and quality filtering
# Accepts user-specified trim parameters via environment variables
# ============================================================================
set -euo pipefail

echo "=========================================="
echo "  READ TRIMMING"
echo "  $(date)"
echo "=========================================="

TRIM_DIR="${NGS_RESULTS_DIR}/trimmed"
mkdir -p "${TRIM_DIR}"

IFS=',' read -ra R1_FILES <<< "${NGS_SAMPLE_R1}"
IFS=',' read -ra R2_FILES <<< "${NGS_SAMPLE_R2:-}"

TRIMMED_R1=()
TRIMMED_R2=()

# Use user-specified quality threshold or fall back to run-mode defaults
if [ -n "${NGS_TRIM_QUALITY:-}" ]; then
    QUALITY_THRESHOLD="${NGS_TRIM_QUALITY}"
    echo "[TRIM] Using user-specified quality threshold: ${QUALITY_THRESHOLD}"
else
    QUALITY_THRESHOLD=20
    if [ "${NGS_RUN_MODE}" = "fast" ]; then
        QUALITY_THRESHOLD=15
    elif [ "${NGS_RUN_MODE}" = "high_sensitivity" ]; then
        QUALITY_THRESHOLD=25
    fi
    echo "[TRIM] Using default quality threshold: ${QUALITY_THRESHOLD} (mode: ${NGS_RUN_MODE})"
fi

# Use user-specified min length or default
MIN_LENGTH="${NGS_TRIM_MIN_LENGTH:-36}"
echo "[TRIM] Minimum read length: ${MIN_LENGTH}"

# Front/tail trimming
TRIM_FRONT="${NGS_TRIM_FRONT:-0}"
TRIM_TAIL="${NGS_TRIM_TAIL:-0}"
if [ "${TRIM_FRONT}" -gt 0 ]; then
    echo "[TRIM] Trimming ${TRIM_FRONT} bases from front of reads"
fi
if [ "${TRIM_TAIL}" -gt 0 ]; then
    echo "[TRIM] Trimming ${TRIM_TAIL} bases from tail of reads"
fi

for i in "${!R1_FILES[@]}"; do
    r1="${R1_FILES[$i]}"
    basename_r1=$(basename "${r1}" | sed 's/\.\(fastq\|fq\)\(\.gz\)\?$//')
    out_r1="${TRIM_DIR}/${basename_r1}_trimmed.fastq.gz"
    TRIMMED_R1+=("${out_r1}")

    if command -v ${FASTP_PATH:-fastp} &>/dev/null; then
        FASTP_ARGS=(
            -i "${r1}"
            -o "${out_r1}"
            --thread "${NGS_THREADS}"
            --qualified_quality_phred "${QUALITY_THRESHOLD}"
            --length_required "${MIN_LENGTH}"
            --json "${TRIM_DIR}/${basename_r1}_fastp.json"
            --html "${TRIM_DIR}/${basename_r1}_fastp.html"
        )

        # Add front/tail trim
        if [ "${TRIM_FRONT}" -gt 0 ]; then
            FASTP_ARGS+=(--trim_front1 "${TRIM_FRONT}")
        fi
        if [ "${TRIM_TAIL}" -gt 0 ]; then
            FASTP_ARGS+=(--trim_tail1 "${TRIM_TAIL}")
        fi

        # Add custom adapter sequences if provided
        if [ -n "${NGS_TRIM_ADAPTER_R1:-}" ]; then
            FASTP_ARGS+=(--adapter_sequence "${NGS_TRIM_ADAPTER_R1}")
        fi

        if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
            r2="${R2_FILES[$i]}"
            basename_r2=$(basename "${r2}" | sed 's/\.\(fastq\|fq\)\(\.gz\)\?$//')
            out_r2="${TRIM_DIR}/${basename_r2}_trimmed.fastq.gz"
            TRIMMED_R2+=("${out_r2}")

            echo "[TRIM] Trimming paired-end: $(basename ${r1}) + $(basename ${r2})"
            FASTP_ARGS+=(-I "${r2}" -O "${out_r2}" --detect_adapter_for_pe)

            if [ "${TRIM_FRONT}" -gt 0 ]; then
                FASTP_ARGS+=(--trim_front2 "${TRIM_FRONT}")
            fi
            if [ "${TRIM_TAIL}" -gt 0 ]; then
                FASTP_ARGS+=(--trim_tail2 "${TRIM_TAIL}")
            fi
            if [ -n "${NGS_TRIM_ADAPTER_R2:-}" ]; then
                FASTP_ARGS+=(--adapter_sequence_r2 "${NGS_TRIM_ADAPTER_R2}")
            fi
        else
            echo "[TRIM] Trimming single-end: $(basename ${r1})"
        fi

        ${FASTP_PATH:-fastp} "${FASTP_ARGS[@]}"
        echo "[TRIM] Trimming completed for $(basename ${r1})"
    else
        echo "[TRIM] WARNING: fastp not found. Copying raw files as-is."
        cp "${r1}" "${out_r1}"
        if [ -n "${R2_FILES[$i]:-}" ] && [ -f "${R2_FILES[$i]:-}" ]; then
            cp "${R2_FILES[$i]}" "${TRIM_DIR}/$(basename ${R2_FILES[$i]})"
            TRIMMED_R2+=("${TRIM_DIR}/$(basename ${R2_FILES[$i]})")
        fi
    fi
done

# Export trimmed file paths for downstream steps
echo "$(IFS=','; echo "${TRIMMED_R1[*]}")" > "${NGS_RESULTS_DIR}/.trimmed_r1.txt"
echo "$(IFS=','; echo "${TRIMMED_R2[*]:-}")" > "${NGS_RESULTS_DIR}/.trimmed_r2.txt"

echo "[TRIM] Read trimming step completed successfully"
echo "[TRIM] Parameters used: quality=${QUALITY_THRESHOLD}, min_length=${MIN_LENGTH}, trim_front=${TRIM_FRONT}, trim_tail=${TRIM_TAIL}"
