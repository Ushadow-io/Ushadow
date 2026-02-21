import ActivityKit
import Foundation

// Shared between the Widget Extension and the main app target.
// IMPORTANT: both copies must stay identical — ActivityKit matches them by type identity.
struct RecordingActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var isRecording: Bool
    var elapsedSeconds: Int
  }

  var deviceName: String
  var sessionId: String
}
