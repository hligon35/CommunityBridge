#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

channel="preview"
platform="all"
message=""
input_dir="dist"
skip_fingerprint="0"

usage() {
  cat <<'EOF'
Usage: scripts/eas-update-arm.sh [--channel <name>] [--platform <ios|android|all>] [--message <text>] [--input-dir <dir>] [--skip-fingerprint]

Publishes an EAS Update from an ARM64 Linux machine.

On ARM64, React Native's bundled hermesc in node_modules is typically x86_64-only and cannot run.
This script works around that by exporting with --no-bytecode and then uploading via EAS with --skip-bundler.

Examples:
  scripts/eas-update-arm.sh --channel preview --message "Testing ready"
  scripts/eas-update-arm.sh --channel production --platform all
  scripts/eas-update-arm.sh --channel production --platform android
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel|-c)
      channel="$2"
      shift 2
      ;;
    --platform|-p)
      platform="$2"
      shift 2
      ;;
    --message|-m)
      shift
      if [[ $# -lt 1 ]]; then
        echo "--message requires a value" >&2
        exit 2
      fi
      message="$1"
      shift
      # Allow multi-word messages even if the caller didn't quote them.
      while [[ $# -gt 0 && "$1" != --* && "$1" != -* ]]; do
        message+=" $1"
        shift
      done
      ;;
    --input-dir)
      input_dir="$2"
      shift 2
      ;;
    --skip-fingerprint)
      skip_fingerprint="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$platform" in
  ios|android|all) ;;
  *)
    echo "--platform must be one of: ios, android, all" >&2
    exit 2
    ;;
esac

if [[ -z "$message" ]]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    message="$(git log -1 --pretty=%s 2>/dev/null || true)"
  fi
fi

if [[ -z "$message" ]]; then
  message="EAS update ($platform)"
fi

if [[ "$skip_fingerprint" == "1" ]]; then
  export EAS_SKIP_AUTO_FINGERPRINT=1
fi

rm -rf "$input_dir"
mkdir -p "$input_dir"

# NOTE: --no-bytecode avoids calling hermesc (x86_64) on ARM64.
CI=1 npx expo export \
  --output-dir "$input_dir" \
  --platform "$platform" \
  --no-bytecode \
  --dump-assetmap \
  --source-maps

CI=1 eas update \
  --channel "$channel" \
  -p "$platform" \
  --skip-bundler \
  --input-dir "$input_dir" \
  -m "$message"
