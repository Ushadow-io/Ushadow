const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Custom Expo config plugin to force exclude android.support libraries
 * and resolve dependencies to use androidx instead.
 *
 * This adds configuration to the project's build.gradle to:
 * 1. Exclude all android.support.* dependencies
 * 2. Force resolve conflicts to use androidx versions
 */
module.exports = function withAndroidGradleFix(config) {
  return withProjectBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Add exclusion rules in allprojects block
    const exclusionRules = `
    configurations.all {
        exclude group: 'com.android.support', module: 'support-compat'
        exclude group: 'com.android.support', module: 'support-v4'
        exclude group: 'com.android.support', module: 'versionedparcelable'

        resolutionStrategy {
            force 'androidx.core:core:1.16.0'
            force 'androidx.versionedparcelable:versionedparcelable:1.1.1'
        }
    }`;

    // Insert after allprojects { repositories {
    const allProjectsPattern = /(allprojects\s*\{[\s\S]*?repositories\s*\{[\s\S]*?\})/;

    if (allProjectsPattern.test(buildGradle)) {
      buildGradle = buildGradle.replace(
        allProjectsPattern,
        `$1${exclusionRules}`
      );
    } else {
      // Fallback: add at the end of allprojects block
      buildGradle = buildGradle.replace(
        /allprojects\s*\{/,
        `allprojects {${exclusionRules}`
      );
    }

    config.modResults.contents = buildGradle;
    return config;
  });
};
