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

module.exports = function withNativeModules(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const pbxprojPath = path.join(
        config.modRequest.platformProjectRoot,
        'ushadow.xcodeproj',
        'project.pbxproj'
      );

      let content = fs.readFileSync(pbxprojPath, 'utf8');

      for (const file of FILES) {
        if (content.includes(file.name)) {
          console.log(`[withNativeModules] ${file.name} already present, skipping.`);
          continue;
        }

        const ext = file.name.endsWith('.swift') ? 'swift' : 'objc';

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
