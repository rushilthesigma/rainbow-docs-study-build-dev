# Mac Island

A native macOS floating live-activity surface built with SwiftUI and AppKit. It reads the current display's notch geometry, pins a pure-black surface to the top edge, keeps compact information in dedicated wings on either side of the notch, expands with a spring animation, appears on every Space, and includes interactive music, timer, Focus, and AirDrop-style demo activities.

## Run

```bash
cd MacIsland
swift run MacIsland
```

Click the island to expand or collapse it. Use its controls to switch activities, or use the capsule icon in the menu bar to show the island, change activity, or quit.

## Build a Mac app

```bash
chmod +x scripts/build-app.sh
./scripts/build-app.sh
open "build/Mac Island.app"
```

This creates a double-clickable `build/Mac Island.app` bundle. The app runs as a menu-bar utility and does not add an extra Dock icon.

## Verify

```bash
swift build -c release
```

The project requires macOS 14 or later. It can also be opened as a Swift package in Xcode for signing, XCTest coverage, and app-bundle distribution. The standalone Command Line Tools installation can build the app, but does not bundle Apple's XCTest frameworks.
