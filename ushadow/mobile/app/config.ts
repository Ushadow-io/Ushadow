/**
 * App Configuration
 *
 * Central configuration for the Ushadow mobile app.
 * The default server URL can be changed here or overridden by the user during setup.
 */

export const AppConfig = {
  /**
   * Default server URL.
   * Empty by default - users set this during first login.
   * Once set, it's persisted in AsyncStorage and used for future logins.
   *
   * Format: https://{your-tailscale-host}
   * Example: https://blue.spangled-kettle.ts.net
   */
  DEFAULT_SERVER_URL: '',

  /**
   * App version info
   */
  APP_NAME: 'Ushadow Mobile',
};

export default AppConfig;
