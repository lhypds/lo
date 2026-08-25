#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting..."

cd "$ROOT"
echo "Pulling latest code..."
git pull --ff-only

# Create .env from .env.example if not present
if [ ! -f "$ROOT/.env" ]; then
  echo "Creating .env from .env.example..."
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

# Install pm2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo "Installing pm2..."
  npm install -g pm2
fi

if command -v pnpm &> /dev/null; then
  PKG=pnpm
else
  PKG=npm
fi

echo "Installing dependencies with $PKG..."
"$PKG" install

echo "Building frontend..."
"$PKG" run build

"$ROOT/stop.sh"
"$ROOT/start.sh"
