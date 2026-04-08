#!/usr/bin/env bash
# ============================================================================
# NGS Analysis Platform — One-Click Launcher
#
# macOS: double-click this file
# Linux: bash start.command
#
# First run auto-triggers setup. Subsequent runs just start the server.
# ============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8000

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  NGS Analysis Platform${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ---- First run: trigger full setup ------------------------------------------
if [ ! -d "${PROJECT_DIR}/backend/venv" ] || [ ! -f "${PROJECT_DIR}/frontend/dist/index.html" ]; then
    echo -e "${CYAN}First run detected — running setup...${NC}"
    echo ""
    bash "${PROJECT_DIR}/setup-local.sh"
    echo ""
fi

# ---- Kill stale process on our port -----------------------------------------
if command -v lsof &>/dev/null; then
    existing=$(lsof -ti:"${PORT}" 2>/dev/null || true)
    if [ -n "$existing" ]; then
        echo -e "${YELLOW}Port ${PORT} in use — stopping old process...${NC}"
        echo "$existing" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
fi

# ---- Rebuild frontend if source changed since last build --------------------
if [ -d "${PROJECT_DIR}/frontend/src" ] && [ -f "${PROJECT_DIR}/frontend/dist/index.html" ]; then
    changed=$(find "${PROJECT_DIR}/frontend/src" -type f -newer "${PROJECT_DIR}/frontend/dist/index.html" 2>/dev/null | head -1 || true)
    if [ -n "$changed" ]; then
        echo -e "${CYAN}Frontend changes detected — rebuilding...${NC}"
        (cd "${PROJECT_DIR}/frontend" && npm run build --silent 2>/dev/null)
        echo -e "${GREEN}[OK]${NC} Frontend rebuilt"
    fi
fi

# ---- Start the backend (serves API + frontend from dist/) -------------------
echo -e "${CYAN}Starting server on port ${PORT}...${NC}"
cd "${PROJECT_DIR}/backend"
source venv/bin/activate

uvicorn main:app --host 127.0.0.1 --port "${PORT}" &
SERVER_PID=$!

# Wait until the health endpoint responds
echo -n "  Waiting for server"
for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${PORT}/api/system/health" &>/dev/null; then
        echo ""
        echo -e "  ${GREEN}[OK]${NC} Server running (PID ${SERVER_PID})"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# ---- Open browser ------------------------------------------------------------
URL="http://localhost:${PORT}"
echo -e "${GREEN}Opening ${URL}${NC}"
if [[ "${OS:-$(uname -s)}" == "Darwin" ]]; then
    open "$URL" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
    xdg-open "$URL" 2>/dev/null || true
fi

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "  Platform: ${GREEN}${URL}${NC}"
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop"
echo -e "${BOLD}============================================${NC}"
echo ""

# ---- Keep running until Ctrl+C ----------------------------------------------
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo -e "${GREEN}Server stopped.${NC}"
    exit 0
}
trap cleanup INT TERM
wait "$SERVER_PID"
