#!/usr/bin/env bash
# Build and install omp-continue-on-early-stop (omp bundle, omp-only).
#
# Usage:
#   ./install.sh          # build omp bundle, install to ~/.omp/agent/extensions/
#   ./install.sh --check  # dry run: print what would change, change nothing
#
set -euo pipefail
bun run build:omp
if [[ "${1:-}" == "--check" ]]; then echo "would copy omp-continue-on-early-stop.ts to ~/.omp/agent/extensions/"; exit 0; fi
cp omp-continue-on-early-stop.ts ~/.omp/agent/extensions/
