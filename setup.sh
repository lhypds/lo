#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Setting up lo..."

# Node 22+ is required (server uses Node's built-in SQLite)
if ! command -v node &> /dev/null; then
  echo "Node.js not found — install Node.js 22 or later first" >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22 or later is required (found $(node -v))" >&2
  exit 1
fi

# Create .env from .env.example if not present
if [ ! -f "$ROOT/.env" ]; then
  echo "Creating .env from .env.example..."
  cp "$ROOT/.env.example" "$ROOT/.env"
else
  echo ".env already exists, skipping"
fi

# A token another project on this machine already holds, so a credential is
# asked for once rather than once per repo — the same trick liveboard's own
# component setup scripts use.
sibling_token() {
  local file found
  for file in ../*/.env ../*/src/modules/*/*/.env; do
    { [ -f "$file" ] && ! [ "$file" -ef "$ROOT/.env" ]; } || continue
    found=$(grep -h '^VITE_MAPBOX_TOKEN=..*' "$file" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$found" ]; then
      echo "$found"
      return 0
    fi
  done
}

save_token() {
  VALUE="$1" awk '$0 ~ /^VITE_MAPBOX_TOKEN=/ && !done { print "VITE_MAPBOX_TOKEN=" ENVIRON["VALUE"]; done=1; next } { print }' \
    "$ROOT/.env" > "$ROOT/.env.tmp"
  mv "$ROOT/.env.tmp" "$ROOT/.env"
  if ! grep -q '^VITE_MAPBOX_TOKEN=' "$ROOT/.env"; then
    echo "VITE_MAPBOX_TOKEN=$1" >> "$ROOT/.env"
  fi
  echo "Saved VITE_MAPBOX_TOKEN to .env"
}

# The map card is the only part that needs a credential; everything else runs on
# key-free public APIs, so a missing token leaves the rest of the app working.
if ! grep -q '^VITE_MAPBOX_TOKEN=..*' "$ROOT/.env"; then
  TOKEN=$(sibling_token)
  if [ -n "$TOKEN" ]; then
    echo "Taking VITE_MAPBOX_TOKEN from a project that already has it."
    save_token "$TOKEN"
  else
    echo
    echo "VITE_MAPBOX_TOKEN is empty — the map card will ask for it instead of drawing."
    echo "Get a public token at https://account.mapbox.com/access-tokens/"
    if [ -t 0 ]; then
      read -r -p "VITE_MAPBOX_TOKEN (press Enter to skip): " TOKEN || TOKEN=""
      [ -n "$TOKEN" ] && save_token "$TOKEN"
    else
      echo "No terminal to ask on — fill it in at $ROOT/.env and re-run this script."
    fi
    echo
  fi
fi

if command -v pnpm &> /dev/null; then
  PKG=pnpm
else
  PKG=npm
fi

echo "Installing dependencies with $PKG..."
"$PKG" install

# Initialize the database (schema is created on first import of server/db.js)
echo "Initializing database..."
node -e 'import("./server/db.js").then(() => console.log("db.sqlite ready")).catch((e) => { console.error(e); process.exit(1); })'

echo
echo "Setup complete. Next steps:"
echo "  $PKG run dev      # start the dev server"
echo "  $PKG run build    # build the frontend for production"
echo "  ./start.sh        # run under pm2 (after a build)"
