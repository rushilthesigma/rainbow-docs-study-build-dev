import SwiftUI

struct IslandRootView: View {
    @ObservedObject var model: IslandModel
    let layout: IslandLayout

    var body: some View {
        ZStack {
            UnevenRoundedRectangle(
                topLeadingRadius: 0,
                bottomLeadingRadius: model.presentation == .compact ? 16 : 34,
                bottomTrailingRadius: model.presentation == .compact ? 16 : 34,
                topTrailingRadius: 0,
                style: .continuous
            )
            .fill(Color.black)

            if model.presentation == .compact {
                CompactIsland(model: model, layout: layout)
                    .transition(.opacity.combined(with: .scale(scale: 0.92)))
            } else {
                ExpandedIsland(model: model, layout: layout)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.togglePresentation() }
        .animation(.spring(response: 0.38, dampingFraction: 0.82), value: model.presentation)
    }
}

private struct CompactIsland: View {
    @ObservedObject var model: IslandModel
    let layout: IslandLayout

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 7) {
                ActivityGlyph(activity: model.activity, size: 24)
                VStack(alignment: .leading, spacing: 0) {
                    Text(model.activity.title.uppercased())
                        .font(.system(size: 7.5, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(model.activity.tint)
                    Text(compactLeftText)
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
            }
            .padding(.leading, 8)
            .frame(width: layout.wingWidth, alignment: .leading)

            Color.clear
                .frame(width: layout.notchWidth)

            HStack(spacing: 7) {
                VStack(alignment: .trailing, spacing: 0) {
                    Text(compactRightText)
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(compactRightCaption)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.white.opacity(0.48))
                        .lineLimit(1)
                }
                compactTrailing
                    .frame(width: 28)
            }
            .padding(.trailing, 8)
            .frame(width: layout.wingWidth, alignment: .trailing)
        }
        .frame(width: layout.compactSize.width, height: layout.compactSize.height)
    }

    private var compactLeftText: String {
        model.activity == .timer ? "Productivity" : model.activity.compactTitle
    }

    private var compactRightText: String {
        switch model.activity {
        case .music: "M83"
        case .timer: IslandFormatters.duration(model.timerRemaining)
        case .focus: "\(model.focusMinutes) min"
        case .transfer: "\(Int(model.transferProgress * 100))%"
        }
    }

    private var compactRightCaption: String {
        switch model.activity {
        case .music: model.isPlaying ? "PLAYING" : "PAUSED"
        case .timer: model.isTimerRunning ? "RUNNING" : "READY"
        case .focus: model.isFocusActive ? "ACTIVE" : "PAUSED"
        case .transfer: "RECEIVING"
        }
    }

    @ViewBuilder
    private var compactTrailing: some View {
        switch model.activity {
        case .music:
            MiniWaveform(isActive: model.isPlaying, color: model.activity.tint)
        case .timer:
            CircularProgress(value: Double(model.timerRemaining) / 720, tint: model.activity.tint)
        case .focus:
            Text("\(model.focusMinutes)m")
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(model.activity.tint)
        case .transfer:
            CircularProgress(value: model.transferProgress, tint: model.activity.tint)
        }
    }
}

private struct ExpandedIsland: View {
    @ObservedObject var model: IslandModel
    let layout: IslandLayout

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                HStack(spacing: 7) {
                    ActivityGlyph(activity: model.activity, size: 25)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(model.activity.title.uppercased())
                            .font(.system(size: 7.5, weight: .bold))
                            .tracking(0.6)
                            .foregroundStyle(model.activity.tint)
                        Text(expandedTitle)
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                    }
                }
                .padding(.leading, 8)
                .frame(width: layout.wingWidth, alignment: .leading)

                Color.clear
                    .frame(width: layout.notchWidth)

                HStack(spacing: 7) {
                    Text(model.activity.subtitle)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1)
                    Button {
                        model.collapse()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .frame(width: 22, height: 22)
                            .background(.white.opacity(0.09), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white.opacity(0.7))
                }
                .padding(.trailing, 8)
                .frame(width: layout.wingWidth, alignment: .trailing)
            }
            .frame(height: layout.compactHeight)

            activityControls
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            HStack(spacing: 7) {
                ForEach(IslandActivity.allCases) { activity in
                    Button {
                        model.select(activity)
                    } label: {
                        Image(systemName: activity.symbol)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(model.activity == activity ? Color.black : .white.opacity(0.6))
                            .frame(width: 28, height: 22)
                            .background(model.activity == activity ? activity.tint : .white.opacity(0.07), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Text("Click island to close")
                    .font(.system(size: 8.5, weight: .medium))
                    .foregroundStyle(.white.opacity(0.25))
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .frame(width: layout.expandedSize.width, height: layout.expandedSize.height)
    }

    private var expandedTitle: String {
        model.activity == .timer ? IslandFormatters.duration(model.timerRemaining) : model.activity.compactTitle
    }

    @ViewBuilder
    private var activityControls: some View {
        switch model.activity {
        case .music: MusicControls(model: model)
        case .timer: TimerControls(model: model)
        case .focus: FocusControls(model: model)
        case .transfer: TransferControls(model: model)
        }
    }
}
