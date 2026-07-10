import AppKit
import SwiftUI

@main
enum MacIslandApp {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) {
            application.run()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = IslandModel()
    private var islandController: IslandWindowController?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        islandController = IslandWindowController(model: model)
        islandController?.showWindow(nil)
        configureMenuBarItem()
    }

    private func configureMenuBarItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "capsule.fill", accessibilityDescription: "Mac Island")

        let menu = NSMenu()
        let showItem = NSMenuItem(title: "Show Mac Island", action: #selector(showIsland), keyEquivalent: "i")
        showItem.target = self
        menu.addItem(showItem)

        let activities = NSMenu(title: "Activity")
        for activity in IslandActivity.allCases {
            let activityItem = NSMenuItem(title: activity.title, action: #selector(selectActivity(_:)), keyEquivalent: "")
            activityItem.representedObject = activity.rawValue
            activityItem.image = NSImage(systemSymbolName: activity.symbol, accessibilityDescription: activity.title)
            activityItem.target = self
            activities.addItem(activityItem)
        }
        let activityMenuItem = NSMenuItem(title: "Activity", action: nil, keyEquivalent: "")
        activityMenuItem.submenu = activities
        menu.addItem(activityMenuItem)

        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "Quit Mac Island", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quitItem)
        item.menu = menu
        statusItem = item
    }

    @objc private func showIsland() {
        islandController?.showWindow(nil)
        islandController?.window?.orderFrontRegardless()
        model.expand()
    }

    @objc private func selectActivity(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? String,
              let activity = IslandActivity(rawValue: value) else { return }
        model.select(activity)
        islandController?.window?.orderFrontRegardless()
    }
}
