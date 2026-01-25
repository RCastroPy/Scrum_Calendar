#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(date +%Y%m%d)"

perl -pi -e "s/\bv=\d{8}\b/v=${VERSION}/g" "${ROOT_DIR}/frontend"/*.html

echo "Updated cache-bust to v=${VERSION} in frontend/*.html"
