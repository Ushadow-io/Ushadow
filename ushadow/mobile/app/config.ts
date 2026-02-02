/**
 * App Configuration
 *
 * Central configuration for the Ushadow mobile app.
 * The default server URL can be changed here or overridden by the user during setup.
 */

export const AppConfig = {
  /**
   * Default server URL.
   * This is used as the initial value when the app is first installed.
   * Users can change this in the login screen.
   *
   * Format: https://{your-tailscale-host}
   * Example: https://blue.spangled-kettle.ts.net
   */
  DEFAULT_SERVER_URL: 'https://ushadow.wolf-tawny.ts.net',

  /**
   * App version info
   */
  APP_NAME: 'Ushadow Mobile',
};

export default AppConfig;
