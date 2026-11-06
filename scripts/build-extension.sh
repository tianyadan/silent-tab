#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node -e 'JSON.parse(require("node:fs").readFileSync("extension/manifest.json", "utf8"))'
for file in extension/*.mjs extension/lib/*.mjs extension/adapters/*.mjs; do
  node --check "$file"
done
node --test extension/tests/*.test.mjs

OUT_DIR="${SILENT_TAB_EXTENSION_OUT:-dist/extension}"
mkdir -p "$OUT_DIR" dist
cp -R extension/. "$OUT_DIR"/
(cd dist && zip -q -r silent-tab-extension.zip extension -x 'extension/tests/*' 'extension/test-fixture/*' 'extension/local-config.json')

echo "Chrome 扩展构建完成：$OUT_DIR"
echo "压缩包：dist/silent-tab-extension.zip"
