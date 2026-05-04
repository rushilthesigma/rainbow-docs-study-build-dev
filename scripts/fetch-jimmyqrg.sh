#!/usr/bin/env bash
# =========================================================
# fetch-jimmyqrg.sh — populate ./games/ from jimmyqrg's public repos.
#
# Usage:
#   ./scripts/fetch-jimmyqrg.sh           # interactive — pick repos
#   ./scripts/fetch-jimmyqrg.sh all       # clone every public repo
#   ./scripts/fetch-jimmyqrg.sh slope crossy-road basket-random ...
#
# Outputs:
#   games/<repo-name>/   one folder per game, each with its own index.html
#
# Notes:
#   - Each repo is cloned with `--depth 1` (shallow) so disk usage stays
#     reasonable. There are 100+ repos; cloning them all is ~3-5 GB.
#   - This script does NOT modify .gitignore. Whether you track games/
#     in version control is your call.
#   - The covalent-ai server only serves /games/ to loopback addresses,
#     so what's in there is reachable from your machine alone.
# =========================================================
set -euo pipefail

USER="jimmyqrg"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/games"
mkdir -p "$DEST_DIR"

if ! command -v git >/dev/null; then
  echo "git is required" >&2; exit 1
fi
if ! command -v curl >/dev/null; then
  echo "curl is required" >&2; exit 1
fi

# List of repos to clone — provided on command line, "all", or interactive.
list_all_repos() {
  # GitHub paginates at 100. Most of jimmyqrg's profile fits in 2 pages.
  local page=1
  while :; do
    local body
    body=$(curl -sf "https://api.github.com/users/${USER}/repos?per_page=100&page=${page}") || break
    if [ "$(echo "$body" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")" -eq 0 ]; then break; fi
    echo "$body" | python3 -c "import json,sys; [print(r['name']) for r in json.load(sys.stdin)]"
    page=$((page+1))
  done
}

if [ "$#" -eq 0 ]; then
  echo "Usage:"
  echo "  $0 all                # clone every public repo (~3-5 GB)"
  echo "  $0 <repo> [<repo>...] # clone specific repos"
  echo ""
  echo "Available repos:"
  list_all_repos | sed 's/^/  /'
  exit 0
fi

if [ "$1" = "all" ]; then
  REPOS=()
  while IFS= read -r r; do REPOS+=("$r"); done < <(list_all_repos)
else
  REPOS=("$@")
fi

echo "Cloning ${#REPOS[@]} repo(s) into $DEST_DIR ..."
for repo in "${REPOS[@]}"; do
  target="$DEST_DIR/$repo"
  if [ -d "$target" ]; then
    echo "  [skip] $repo (already exists)"
    continue
  fi
  echo "  [get ] $repo"
  if ! git clone --depth 1 "https://github.com/${USER}/${repo}.git" "$target" 2>/tmp/fetch-jimmyqrg.err; then
    echo "         failed: $(cat /tmp/fetch-jimmyqrg.err | head -1)" >&2
  fi
done

# Light reporting: how many of these have an index.html the BrowserShell
# will pick up?
playable=0
total=0
for d in "$DEST_DIR"/*/; do
  [ -d "$d" ] || continue
  total=$((total+1))
  if [ -f "$d/index.html" ] || [ -f "$d/index.htm" ]; then
    playable=$((playable+1))
  fi
done

echo ""
echo "Done. $playable/$total games are wired (folders with index.html)."
echo "They'll appear as tabs the next time you open the BrowserShell."
