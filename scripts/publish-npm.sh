#!/bin/bash
# Publish @archguard/cli to npm
# Usage: ./scripts/publish-npm.sh [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CLI_DIR="$ROOT_DIR/packages/cli"
PUBLISH_DIR="$ROOT_DIR/.publish"

echo "🔨 Building all packages..."
cd "$ROOT_DIR"
pnpm build

echo "📦 Bundling CLI..."
node scripts/bundle-cli.mjs

echo "📋 Preparing publish directory..."
rm -rf "$PUBLISH_DIR"
mkdir -p "$PUBLISH_DIR/dist"

# Copy the bundle
cp "$CLI_DIR/dist/archguard.cjs" "$PUBLISH_DIR/dist/"

# Copy the npm-specific package.json
cp "$CLI_DIR/package.npm.json" "$PUBLISH_DIR/package.json"

# Copy README and LICENSE from root
cp "$ROOT_DIR/README.md" "$PUBLISH_DIR/"
cp "$ROOT_DIR/LICENSE" "$PUBLISH_DIR/"

echo "📤 Publishing..."
cd "$PUBLISH_DIR"

if [[ "${1:-}" == "--dry-run" ]]; then
  npm publish --access public --dry-run
  echo "✅ Dry run complete"
else
  npm publish --access public
  echo "✅ Published @archguard/cli to npm"
fi

# Cleanup
cd "$ROOT_DIR"
rm -rf "$PUBLISH_DIR"
