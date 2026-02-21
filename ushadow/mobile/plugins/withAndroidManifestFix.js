const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Custom Expo config plugin to fix AndroidManifest merge conflicts
 * when mixing androidx and android.support libraries.
 *
 * Adds tools:replace="android:appComponentFactory" to resolve the conflict
 * between androidx.core.app.CoreComponentFactory and android.support.v4.app.CoreComponentFactory
 */
module.exports = function withAndroidManifestFix(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add tools namespace if not present
    if (!androidManifest.manifest.$) {
      androidManifest.manifest.$ = {};
    }
    androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Add tools:replace for appComponentFactory
    if (!mainApplication.$) {
      mainApplication.$ = {};
    }

    // Set the appComponentFactory to use androidx version
    mainApplication.$['android:appComponentFactory'] = 'androidx.core.app.CoreComponentFactory';

    // Add or append to tools:replace attribute
    if (mainApplication.$['tools:replace']) {
      if (!mainApplication.$['tools:replace'].includes('android:appComponentFactory')) {
        mainApplication.$['tools:replace'] += ',android:appComponentFactory';
      }
    } else {
      mainApplication.$['tools:replace'] = 'android:appComponentFactory';
    }

    return config;
  });
};
