// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "MacIsland",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "MacIsland", targets: ["MacIsland"])
    ],
    targets: [
        .executableTarget(name: "MacIsland")
    ]
)
