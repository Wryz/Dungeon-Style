#!/usr/bin/env bash
# Films every shot in reels/shots.json (or the names given), a few at a time.
#   reels/capture/batch.sh [name ...]      (dev server must be up: npx vite --port 5173)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${OUT:-$here/../out}"
jobs="${JOBS:-3}"
mkdir -p "$out"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
node -e '
  const shots = require(process.argv[1]);
  const want = process.argv.slice(2);
  for (const s of shots) if (!want.length || want.includes(s.name)) console.log(JSON.stringify(s));
' "$(realpath "${SHOTS:-$here/../shots.json}")" "$@" |
  xargs -d "\n" -P "$jobs" -I{} sh -c 'node "$0/capture.cjs" "$1" "$2" 2>&1 | grep --line-buffered -v "GL Driver"; exit 0' "$here" {} "$out"
