#!/bin/bash
# Build master zip for GitHub — excludes node_modules, dist, .git, etc.
# Run from repo root or from /home/user

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="/home/user"
ZIP_NAME="AI-ASSistant-Master-Github-Repo.zip"
DATE=$(date +%Y-%m-%d)

echo "Building master zip from $REPO_DIR"

cd /home/user

# Remove old zip if exists
rm -f "$OUTPUT_DIR/$ZIP_NAME"
rm -f "$OUTPUT_DIR/AI-ASSistant-Master-Github-Repo-$DATE.zip"

# Build zip excluding heavy dirs
zip -r "$OUTPUT_DIR/$ZIP_NAME" AI-ASSistant-Github-Repo \
  -x "*/node_modules/*" \
  -x "*/dist/*" \
  -x "*/build/*" \
  -x "*/.git/*" \
  -x "*/.next/*" \
  -x "*/.cache/*" \
  -x "*/__pycache__/*" \
  -x "*/.venv/*" \
  -x "*/.turbo/*" \
  -x "*/coverage/*" \
  -x "*/out/*" \
  -x "*/target/*" \
  -x "*.log" \
  -x "archive_zips/*" \
  || true

# Also create dated version
cp "$OUTPUT_DIR/$ZIP_NAME" "$OUTPUT_DIR/AI-ASSistant-Master-Github-Repo-$DATE.zip"

echo "Zips created:"
ls -lh "$OUTPUT_DIR/$ZIP_NAME" "$OUTPUT_DIR/AI-ASSistant-Master-Github-Repo-$DATE.zip"

echo "Contents preview (top level):"
unzip -l "$OUTPUT_DIR/$ZIP_NAME" | head -n 100
