import AppKit
import SwiftUI

enum IslandActivity: String, CaseIterable, Identifiable, Sendable {
    case music
    case timer
    case focus
    case transfer

    var id: String { rawValue }

    var title: String {
        switch self {
        case .music: "Now Playing"
        case .timer: "Timer"
        case .focus: "Focus"
        case .transfer: "AirDrop"
        }
    }

    var compactTitle: String {
        switch self {
        case .music: "Midnight City"
        case .timer: "12:00"
        case .focus: "Focus"
        case .transfer: "Receiving"
        }
    }

    var subtitle: String {
        switch self {
        case .music: "M83 · Hurry Up, We're Dreaming"
        case .timer: "Productivity"
        case .focus: "Notifications silenced"
        case .transfer: "MacBook Pro"
        }
    }

    var symbol: String {
        switch self {
        case .music: "waveform"
        case .timer: "timer"
        case .focus: "moon.fill"
        case .transfer: "airdrop"
        }
    }

    var tint: Color {
        switch self {
        case .music: .pink
        case .timer: .orange
        case .focus: .indigo
        case .transfer: .cyan
        }
    }
}

enum IslandPresentation: Sendable {
    case compact
    case expanded

    func size(for layout: IslandLayout) -> CGSize {
        switch self {
        case .compact: layout.compactSize
        case .expanded: layout.expandedSize
        }
    }
}

struct IslandLayout: Sendable {
    let notchWidth: CGFloat
    let wingWidth: CGFloat
    let compactHeight: CGFloat

    var compactSize: CGSize {
        CGSize(width: notchWidth + (wingWidth * 2), height: compactHeight)
    }

    var expandedSize: CGSize {
        CGSize(width: max(460, compactSize.width), height: 204)
    }

    @MainActor
    static func fitted(to screen: NSScreen?) -> IslandLayout {
        guard let screen else {
            return IslandLayout(notchWidth: 185, wingWidth: 150, compactHeight: 32)
        }

        let measuredNotchWidth: CGFloat
        if let leftArea = screen.auxiliaryTopLeftArea,
           let rightArea = screen.auxiliaryTopRightArea {
            measuredNotchWidth = max(0, rightArea.minX - leftArea.maxX)
        } else {
            measuredNotchWidth = 185
        }

        let menuBarHeight = max(32, min(42, screen.safeAreaInsets.top))
        return IslandLayout(
            notchWidth: max(160, measuredNotchWidth),
            wingWidth: 150,
            compactHeight: menuBarHeight
        )
    }
}

enum IslandFormatters {
    static func duration(_ seconds: Int) -> String {
        let safeSeconds = max(0, seconds)
        return String(format: "%02d:%02d", safeSeconds / 60, safeSeconds % 60)
    }
}
