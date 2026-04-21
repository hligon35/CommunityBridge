#!/usr/bin/env bash
set -e

echo "Installing dependencies..."
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Please install Node.js and npm first."
  exit 1
fi

npm install

if command -v git >/dev/null 2>&1; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Configuring git hooks (.githooks)..."
    git config core.hooksPath .githooks || true
  fi
fi

echo "Installing Expo CLI (if missing)..."
if ! command -v expo >/dev/null 2>&1; then
  npm install -g expo-cli || true
fi

echo "Done. Run 'npm start' or 'expo start' to launch the app."
