import SwiftUI

struct ActivityGlyph: View {
    let activity: IslandActivity
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(activity.tint.gradient)
            Image(systemName: activity.symbol)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .shadow(color: activity.tint.opacity(0.25), radius: 8)
    }
}

struct MusicControls: View {
    @ObservedObject var model: IslandModel

    var body: some View {
        VStack(spacing: 11) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.12))
                    Capsule().fill(model.activity.tint)
                        .frame(width: proxy.size.width * model.musicProgress)
                }
            }
            .frame(height: 3)

            HStack(spacing: 28) {
                controlButton("backward.fill", size: 13) { model.musicProgress = max(0, model.musicProgress - 0.1) }
                controlButton(model.isPlaying ? "pause.fill" : "play.fill", size: 18) { model.isPlaying.toggle() }
                controlButton("forward.fill", size: 13) { model.musicProgress = min(1, model.musicProgress + 0.1) }
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 8)
    }

    private func controlButton(_ symbol: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 28)
        }
        .buttonStyle(.plain)
    }
}

struct TimerControls: View {
    @ObservedObject var model: IslandModel

    var body: some View {
        HStack(spacing: 14) {
            Button(model.isTimerRunning ? "Pause" : "Start") { model.toggleTimer() }
                .buttonStyle(IslandButtonStyle(tint: .orange, isPrimary: true))
            Button("Reset") { model.resetTimer() }
                .buttonStyle(IslandButtonStyle(tint: .orange, isPrimary: false))
            Spacer()
            CircularProgress(value: Double(model.timerRemaining) / 720, tint: .orange, lineWidth: 4)
                .frame(width: 36, height: 36)
        }
        .padding(.horizontal, 22)
    }
}

struct FocusControls: View {
    @ObservedObject var model: IslandModel

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: model.isFocusActive ? "checkmark.shield.fill" : "bell.badge.fill")
                .font(.system(size: 24))
                .foregroundStyle(model.isFocusActive ? .indigo : .white.opacity(0.5))
            VStack(alignment: .leading, spacing: 2) {
                Text(model.isFocusActive ? "Deep work is on" : "Focus is paused")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                Text("\(model.focusMinutes) minutes remaining")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.45))
            }
            Spacer()
            Button(model.isFocusActive ? "End" : "Resume") { model.toggleFocus() }
                .buttonStyle(IslandButtonStyle(tint: .indigo, isPrimary: !model.isFocusActive))
        }
        .padding(.horizontal, 22)
    }
}

struct TransferControls: View {
    @ObservedObject var model: IslandModel

    var body: some View {
        VStack(spacing: 9) {
            HStack {
                Text("Design-assets.zip")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.8))
                Spacer()
                Text("\(Int(model.transferProgress * 100))%")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(.cyan)
            }
            ProgressView(value: model.transferProgress)
                .tint(.cyan)
        }
        .padding(.horizontal, 22)
    }
}

struct MiniWaveform: View {
    let isActive: Bool
    let color: Color

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach([0.42, 0.9, 0.64, 1.0, 0.54, 0.78, 0.35], id: \.self) { value in
                Capsule()
                    .fill(color)
                    .frame(width: 2, height: isActive ? 18 * value : 3)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: isActive)
    }
}

struct CircularProgress: View {
    let value: Double
    let tint: Color
    var lineWidth: CGFloat = 2.5

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.12), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0, min(1, value)))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 22, height: 22)
    }
}

struct IslandButtonStyle: ButtonStyle {
    let tint: Color
    let isPrimary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(isPrimary ? Color.black : .white.opacity(0.78))
            .padding(.horizontal, 15)
            .frame(height: 30)
            .background(isPrimary ? tint.opacity(configuration.isPressed ? 0.75 : 1) : .white.opacity(configuration.isPressed ? 0.14 : 0.08), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
