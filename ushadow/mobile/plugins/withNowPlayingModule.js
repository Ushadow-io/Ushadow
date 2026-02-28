const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
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

/**
 * Phase 1 (dangerous mod): Write Swift/ObjC source files to ios/ushadow/.
 *
 * withDangerousMod can create arbitrary files on disk early in the prebuild.
 * We also patch the bridging header here if it already exists (incremental
 * prebuilds). On --clean prebuilds the bridging header doesn't exist yet at
 * this point — it will be written by the Expo template after this phase, so
 * we can't patch it here. The pbxproj additions are handled in phase 2.
 */
function withSwiftFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const targetDir = path.join(projectRoot, 'ushadow');

      // Ensure directory exists (wiped by --clean prebuild)
      fs.mkdirSync(targetDir, { recursive: true });

      // Write source files
      for (const [filename, content] of Object.entries(FILE_CONTENTS)) {
        const dest = path.join(targetDir, filename);
        fs.writeFileSync(dest, content, 'utf8');
        console.log(`[withNativeModules] Wrote ${filename}`);
      }

      // Patch bridging header if it already exists (incremental prebuilds)
      const bridgingHeader = path.join(targetDir, 'ushadow-Bridging-Header.h');
      if (fs.existsSync(bridgingHeader)) {
        let header = fs.readFileSync(bridgingHeader, 'utf8');
        if (!header.includes('RCTBridgeModule.h')) {
          header = header.trimEnd() + '\n#import <React/RCTBridgeModule.h>\n';
          fs.writeFileSync(bridgingHeader, header, 'utf8');
          console.log('[withNativeModules] Updated bridging header');
        }
      }

      return config;
    },
  ]);
}

/**
 * Phase 2 (withXcodeProject): Add file references and build phase entries to
 * the in-memory Xcode project.
 *
 * withXcodeProject operates on the parsed project object BEFORE it is written
 * to disk, so this works correctly for both --clean and incremental prebuilds.
 * Entries are keyed by stable UUIDs so the operation is idempotent.
 */
function withPbxprojEntries(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const objects = xcodeProject.hash.project.objects;

    // Find main app target to locate the correct Sources build phase
    const nativeTargets = objects.PBXNativeTarget || {};
    let sourcesBuildPhase = null;
    let mainGroup = null;

    for (const [key, target] of Object.entries(nativeTargets)) {
      if (key.endsWith('_comment')) continue;
      const name = target.name;
      if (name === '"ushadow"' || name === 'ushadow') {
        // Find Sources build phase for this target
        for (const phaseRef of (target.buildPhases || [])) {
          const phaseUUID = typeof phaseRef === 'object' ? phaseRef.value : phaseRef;
          const phase = (objects.PBXSourcesBuildPhase || {})[phaseUUID];
          if (phase) {
            sourcesBuildPhase = phase;
            break;
          }
        }
        break;
      }
    }

    // Find main app group named 'ushadow'
    for (const [key, group] of Object.entries(objects.PBXGroup || {})) {
      if (key.endsWith('_comment')) continue;
      if (group.name === '"ushadow"' || group.name === 'ushadow') {
        mainGroup = group;
        break;
      }
    }

    for (const file of FILES) {
      // Idempotent: skip if file reference UUID already present
      if ((objects.PBXFileReference || {})[file.fileUUID]) {
        console.log(`[withNativeModules] ${file.name} already present in pbxproj, skipping.`);
        continue;
      }

      // 1. PBXFileReference
      objects.PBXFileReference = objects.PBXFileReference || {};
      objects.PBXFileReference[file.fileUUID] = {
        isa: 'PBXFileReference',
        lastKnownFileType: file.type,
        name: `"${file.name}"`,
        path: `"ushadow/${file.name}"`,
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[file.fileUUID + '_comment'] = file.name;

      // 2. PBXBuildFile
      objects.PBXBuildFile = objects.PBXBuildFile || {};
      objects.PBXBuildFile[file.buildUUID] = {
        isa: 'PBXBuildFile',
        fileRef: file.fileUUID,
        fileRef_comment: file.name,
      };
      objects.PBXBuildFile[file.buildUUID + '_comment'] = `${file.name} in Sources`;

      // 3. Add to PBXGroup (main app group)
      if (mainGroup && mainGroup.children) {
        if (!mainGroup.children.some(c => c.value === file.fileUUID)) {
          mainGroup.children.push({ value: file.fileUUID, comment: file.name });
        }
      } else {
        console.warn(`[withNativeModules] Could not find main group for ${file.name}`);
      }

      // 4. Add to PBXSourcesBuildPhase
      if (sourcesBuildPhase && sourcesBuildPhase.files) {
        if (!sourcesBuildPhase.files.some(f => f.value === file.buildUUID)) {
          sourcesBuildPhase.files.push({ value: file.buildUUID, comment: `${file.name} in Sources` });
        }
      } else {
        console.warn(`[withNativeModules] Could not find Sources build phase for ${file.name}`);
      }

      console.log(`[withNativeModules] Added ${file.name} to Xcode project.`);
    }

    return config;
  });
}

module.exports = function withNativeModules(config) {
  config = withSwiftFiles(config);
  config = withPbxprojEntries(config);
  return config;
};
