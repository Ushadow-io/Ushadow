const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// fmt 11.0.2 (pulled in by React Native) fails to compile under Xcode 26's clang in C++20 mode:
// its FMT_STRING checks become consteval calls that the new compiler rejects. Building only
// the fmt pod as C++17 turns those checks off. `expo prebuild --clean` regenerates the
// Podfile, so the patch has to be re-applied on every prebuild.
const MARKER = '# withFmtCxx17';
const PATCH = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      next unless t.name == 'fmt'
      t.build_configurations.each { |c| c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17' }
    end
`;

module.exports = function withFmtCxx17(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');
      if (src.includes(MARKER)) return cfg;
      // Insert after react_native_post_install(...) so RN's own settings cannot override ours.
      const rnCall = /react_native_post_install\([\s\S]*?\n\s*\)\n/;
      if (!rnCall.test(src)) throw new Error('withFmtCxx17: no react_native_post_install in Podfile');
      fs.writeFileSync(podfile, src.replace(rnCall, (m) => `${m}${PATCH}`));
      return cfg;
    },
  ]);
};
