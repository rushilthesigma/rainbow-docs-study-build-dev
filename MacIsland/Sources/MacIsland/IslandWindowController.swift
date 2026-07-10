import AppKit
import SwiftUI

@MainActor
final class IslandWindowController: NSWindowController {
    private let model: IslandModel
    private let layout: IslandLayout

    init(model: IslandModel) {
        self.model = model
        layout = IslandLayout.fitted(to: NSScreen.main)
        let size = IslandPresentation.compact.size(for: layout)
        let panel = IslandPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init(window: panel)

        panel.contentView = NSHostingView(rootView: IslandRootView(model: model, layout: layout))
        configure(panel)
        position(panel, size: size)

        model.onPresentationChange = { [weak self] presentation in
            guard let self else { return }
            self.resize(to: presentation.size(for: self.layout))
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    private func configure(_ panel: NSPanel) {
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.animationBehavior = .none
    }

    private func position(_ window: NSWindow, size: CGSize) {
        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.frame
        let x = screenFrame.midX - size.width / 2
        let y = screenFrame.maxY - size.height
        window.setFrame(NSRect(x: x, y: y, width: size.width, height: size.height), display: true)
    }

    private func resize(to size: CGSize) {
        guard let window else { return }
        let oldFrame = window.frame
        let newFrame = NSRect(
            x: oldFrame.midX - size.width / 2,
            y: oldFrame.maxY - size.height,
            width: size.width,
            height: size.height
        )
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.32
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            window.animator().setFrame(newFrame, display: true)
        }
    }
}

private final class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
