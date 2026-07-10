import Combine
import Foundation

@MainActor
final class IslandModel: ObservableObject {
    @Published private(set) var presentation: IslandPresentation = .compact
    @Published var activity: IslandActivity {
        didSet { UserDefaults.standard.set(activity.rawValue, forKey: Self.activityKey) }
    }
    @Published var isPlaying = true
    @Published var musicProgress = 0.38
    @Published var timerRemaining = 12 * 60
    @Published var isTimerRunning = false
    @Published var focusMinutes = 48
    @Published var isFocusActive = true
    @Published var transferProgress = 0.72

    var onPresentationChange: ((IslandPresentation) -> Void)?
    private var clock: Timer?

    private static let activityKey = "selectedActivity"

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.activityKey)
        activity = IslandActivity(rawValue: stored ?? "") ?? .music
        startClock()
    }

    func togglePresentation() {
        setPresentation(presentation == .compact ? .expanded : .compact)
    }

    func expand() {
        setPresentation(.expanded)
    }

    func collapse() {
        setPresentation(.compact)
    }

    func select(_ newActivity: IslandActivity) {
        activity = newActivity
        expand()
    }

    func toggleTimer() {
        if timerRemaining == 0 { timerRemaining = 12 * 60 }
        isTimerRunning.toggle()
    }

    func resetTimer() {
        isTimerRunning = false
        timerRemaining = 12 * 60
    }

    func toggleFocus() {
        isFocusActive.toggle()
    }

    private func setPresentation(_ value: IslandPresentation) {
        guard presentation != value else { return }
        presentation = value
        onPresentationChange?(value)
    }

    private func startClock() {
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.isTimerRunning, self.timerRemaining > 0 {
                    self.timerRemaining -= 1
                    if self.timerRemaining == 0 { self.isTimerRunning = false }
                }
                if self.isPlaying {
                    self.musicProgress = self.musicProgress >= 0.99 ? 0.02 : self.musicProgress + 0.0015
                }
                if self.transferProgress < 1 {
                    self.transferProgress = min(1, self.transferProgress + 0.0008)
                }
            }
        }
    }
}
