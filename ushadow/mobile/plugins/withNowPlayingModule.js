const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Stable UUIDs for project.pbxproj entries (must never change between prebuilds)
const FILES = [
  {
    name: 'LiveActivityModule.m',
    buildUUID: 'A1B2C3D4E5F60005A1B2C3D5',
    fileUUID:  'A1B2C3D4E5F60006A1B2C3D5',
    type: 'sourcecode.c.objc',
  },
  {
    name: 'RecordingActivityManager.swift',
    buildUUID: 'A1B2C3D4E5F60007A1B2C3D6',
    fileUUID:  'A1B2C3D4E5F60008A1B2C3D6',
    type: 'sourcecode.swift',
  },
  {
    name: 'RecordingActivityAttributes.swift',
    buildUUID: 'A1B2C3D4E5F60009A1B2C3D7',
    fileUUID:  'A1B2C3D4E5F60010A1B2C3D7',
    type: 'sourcecode.swift',
  },
];

// Source file contents written into ios/ushadow/ during every prebuild.
const FILE_CONTENTS = {
  'RecordingActivityAttributes.swift': `import ActivityKit
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
`,

  'RecordingActivityManager.swift': `import ActivityKit
import Foundation

/// React Native module that controls iOS Live Activities for recording sessions.
/// Exposed to JS as \`NativeModules.LiveActivityModule\`.
@available(iOS 16.2, *)
@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

  private var activities: [String: Activity<RecordingActivityAttributes>] = [:]
  private let queue = DispatchQueue(label: "com.ushadow.liveactivity", qos: .userInitiated)

  @objc
  func startActivity(_ deviceName: String,
                     sessionId: String,
                     resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      do {
        let attrs = RecordingActivityAttributes(deviceName: deviceName, sessionId: sessionId)
        let initialState = RecordingActivityAttributes.ContentState(isRecording: true, elapsedSeconds: 0)
        let content = ActivityContent(state: initialState, staleDate: nil)
        let activity = try Activity<RecordingActivityAttributes>.request(
          attributes: attrs,
          content: content,
          pushType: nil
        )
        self.activities[activity.id] = activity
        resolve(activity.id)
      } catch {
        reject("START_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc
  func updateActivity(_ activityId: String,
                      elapsed: Int,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    guard let activity = activities[activityId] else {
      resolve(nil)
      return
    }
    Task {
      let newState = RecordingActivityAttributes.ContentState(isRecording: true, elapsedSeconds: elapsed)
      await activity.update(ActivityContent(state: newState, staleDate: nil))
      resolve(nil)
    }
  }

  @objc
  func endActivity(_ activityId: String,
                   resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    guard let activity = activities[activityId] else {
      resolve(nil)
      return
    }
    Task {
      let finalState = RecordingActivityAttributes.ContentState(isRecording: false, elapsedSeconds: 0)
      await activity.end(ActivityContent(state: finalState, staleDate: nil), dismissalPolicy: .immediate)
      self.activities.removeValue(forKey: activityId)
      resolve(nil)
    }
  }
}
`,

  'LiveActivityModule.m': `#import <React/RCTBridgeModule.h>

// Bridges the Swift LiveActivityModule class to React Native.
// The Swift implementation lives in RecordingActivityManager.swift.
@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)deviceName
                  sessionId:(NSString *)sessionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSString *)activityId
                  elapsed:(NSInteger)elapsed
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(NSString *)activityId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
`,
};

module.exports = function withNativeModules(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const targetDir = path.join(projectRoot, 'ushadow');
      const pbxprojPath = path.join(projectRoot, 'ushadow.xcodeproj', 'project.pbxproj');

      // Write source files into ios/ushadow/ (they are wiped by --clean prebuild)
      for (const [filename, content] of Object.entries(FILE_CONTENTS)) {
        const dest = path.join(targetDir, filename);
        fs.writeFileSync(dest, content, 'utf8');
        console.log(`[withNativeModules] Wrote ${filename}`);
      }

      // Also update bridging header to expose React types to Swift
      const bridgingHeader = path.join(targetDir, 'ushadow-Bridging-Header.h');
      if (fs.existsSync(bridgingHeader)) {
        let header = fs.readFileSync(bridgingHeader, 'utf8');
        if (!header.includes('RCTBridgeModule.h')) {
          header = header.trimEnd() + '\n#import <React/RCTBridgeModule.h>\n';
          fs.writeFileSync(bridgingHeader, header, 'utf8');
          console.log('[withNativeModules] Updated bridging header');
        }
      }

      // Patch project.pbxproj to add file references
      let content = fs.readFileSync(pbxprojPath, 'utf8');

      for (const file of FILES) {
        if (content.includes(file.name)) {
          console.log(`[withNativeModules] ${file.name} already present in pbxproj, skipping.`);
          continue;
        }

        // 1. PBXBuildFile
        content = content.replace(
          /^(\/\* End PBXBuildFile section \*\/)/m,
          `\t\t${file.buildUUID} /* ${file.name} in Sources */ = {isa = PBXBuildFile; fileRef = ${file.fileUUID} /* ${file.name} */; };\n$1`
        );

        // 2. PBXFileReference
        content = content.replace(
          /^(\/\* End PBXFileReference section \*\/)/m,
          `\t\t${file.fileUUID} /* ${file.name} */ = {isa = PBXFileReference; lastKnownFileType = ${file.type}; name = ${file.name}; path = ushadow/${file.name}; sourceTree = "<group>"; };\n$1`
        );

        // 3. PBXGroup (insert after AppDelegate.swift)
        content = content.replace(
          /(F11748412D0307B40044C1D9 \/\* AppDelegate\.swift \*\/,)/,
          `$1\n\t\t\t\t${file.fileUUID} /* ${file.name} */,`
        );

        // 4. PBXSourcesBuildPhase (insert after AppDelegate.swift in Sources)
        content = content.replace(
          /(F11748422D0307B40044C1D9 \/\* AppDelegate\.swift in Sources \*\/,)/,
          `$1\n\t\t\t\t${file.buildUUID} /* ${file.name} in Sources */,`
        );

        console.log(`[withNativeModules] Added ${file.name} to Xcode project.`);
      }

      fs.writeFileSync(pbxprojPath, content);
      return config;
    },
  ]);
};
