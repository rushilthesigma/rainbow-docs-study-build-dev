#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
CONFIGURATION="${1:-release}"
APP_DIR="$ROOT/build/Mac Island.app"
CONTENTS="$APP_DIR/Contents"

swift build --package-path "$ROOT" -c "$CONFIGURATION"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
install -m 755 "$ROOT/.build/$CONFIGURATION/MacIsland" "$CONTENTS/MacOS/MacIsland"
install -m 644 "$ROOT/Resources/Info.plist" "$CONTENTS/Info.plist"
touch "$APP_DIR"

print "$APP_DIR"
