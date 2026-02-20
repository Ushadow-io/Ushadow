import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Helpers

private func formatElapsed(_ seconds: Int) -> String {
  let m = seconds / 60
  let s = seconds % 60
  return String(format: "%02d:%02d", m, s)
}

// MARK: - Lock Screen view

struct RecordingLockScreenView: View {
  let context: ActivityViewContext<RecordingActivityAttributes>

  var body: some View {
    HStack(spacing: 12) {
      // Ushadow logo
      Image("UshadowLogo")
        .resizable()
        .scaledToFit()
        .frame(width: 36, height: 36)
        .clipShape(RoundedRectangle(cornerRadius: 8))

      VStack(alignment: .leading, spacing: 2) {
        Text("Recording")
          .font(.headline)
          .foregroundColor(.primary)
        Text(context.attributes.deviceName)
          .font(.caption)
          .foregroundColor(.secondary)
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 2) {
        // Pulsing red dot
        Circle()
          .fill(Color.red)
          .frame(width: 8, height: 8)

        Text(formatElapsed(context.state.elapsedSeconds))
          .font(.title3)
          .fontDesign(.monospaced)
          .foregroundColor(.primary)
          .contentTransition(.numericText())
      }
    }
    .padding()
  }
}

// MARK: - Widget definition

struct RecordingWidgetLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RecordingActivityAttributes.self) { context in
      RecordingLockScreenView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.8))

    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded view (long-press on Dynamic Island)
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image("UshadowLogo")
              .resizable()
              .scaledToFit()
              .frame(width: 28, height: 28)
              .clipShape(RoundedRectangle(cornerRadius: 6))
            Circle()
              .fill(Color.red)
              .frame(width: 8, height: 8)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(formatElapsed(context.state.elapsedSeconds))
            .font(.title3)
            .fontDesign(.monospaced)
            .contentTransition(.numericText())
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(context.attributes.deviceName)
            .font(.caption)
            .foregroundColor(.secondary)
        }
      } compactLeading: {
        Image("UshadowLogo")
          .resizable()
          .scaledToFit()
          .frame(width: 16, height: 16)
          .clipShape(RoundedRectangle(cornerRadius: 3))
      } compactTrailing: {
        HStack(spacing: 3) {
          Circle()
            .fill(Color.red)
            .frame(width: 6, height: 6)
          Text(formatElapsed(context.state.elapsedSeconds))
            .font(.caption2)
            .fontDesign(.monospaced)
            .contentTransition(.numericText())
        }
      } minimal: {
        Image("UshadowLogo")
          .resizable()
          .scaledToFit()
          .frame(width: 14, height: 14)
          .clipShape(RoundedRectangle(cornerRadius: 3))
      }
      .keylineTint(.red)
    }
  }
}
