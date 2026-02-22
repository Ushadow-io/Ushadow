/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'RecordingWidget',
  deploymentTarget: '16.2',
  frameworks: ['ActivityKit', 'SwiftUI', 'WidgetKit'],
  images: {
    UshadowLogo: '../../assets/logo.png',
  },
};
