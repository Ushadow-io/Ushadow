/**
 * App Configuration
 *
 * Central configuration for the Ushadow mobile app.
 * Configuration is read from environment variables at build time.
 *
 * To set a default server URL for your build:
 * 1. Create a .env file in ushadow/mobile/
 * 2. Add: EXPO_PUBLIC_DEFAULT_SERVER_URL=https://your-server.ts.net
 * 3. Build the app
 *
 * See README.md for more details.
 */

export const AppConfig = {
  /**
   * Default server URL.
   * Read from EXPO_PUBLIC_DEFAULT_SERVER_URL environment variable.
   * If not set, users enter the URL manually during first login.
   * Once logged in, the URL is persisted in AsyncStorage.
   *
   * Format: https://{your-tailscale-host}
   * Example: https://blue.spangled-kettle.ts.net
   */
  DEFAULT_SERVER_URL: process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL || '',

  /**
   * App version info
   */
  APP_NAME: 'Ushadow Mobile',
};

export default AppConfig;
