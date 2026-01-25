/**
 * Test Data Fixtures for Frontend E2E Tests
 *
 * Centralized test data to use across E2E tests.
 */

export const testUsers = {
  admin: {
    email: 'admin@test.ushadow.io',
    password: 'test-admin-password-123',
  },
  regularUser: {
    email: 'user@test.ushadow.io',
    password: 'test-user-password-123',
  },
}

export const testApiKeys = {
  openai: 'sk-test-openai-key-for-testing-only',
  anthropic: 'sk-ant-test-key-for-testing-only',
  deepgram: 'test-deepgram-key',
}

export const testServiceConfigs = {
  chronicle: {
    name: 'chronicle',
    llm_provider: 'openai',
    transcription_provider: 'deepgram',
  },
}

/**
 * Stubbed API responses for testing without backend
 */
export const stubbedResponses = {
  healthCheck: {
    status: 'healthy',
    services: {
      database: 'connected',
      redis: 'connected',
    },
  },

  services: [
    {
      id: 'chronicle',
      name: 'Chronicle',
      status: 'running',
      capabilities: ['llm', 'transcription', 'memory'],
    },
  ],

  providers: {
    llm: [
      { id: 'openai', name: 'OpenAI', status: 'configured' },
      { id: 'anthropic', name: 'Anthropic', status: 'not_configured' },
    ],
    transcription: [
      { id: 'deepgram', name: 'Deepgram', status: 'configured' },
      { id: 'whisper', name: 'Whisper (Local)', status: 'not_configured' },
    ],
  },
}

/**
 * Helper to create mock API route handlers for Playwright
 */
export function createMockApiHandlers(page: any) {
  return {
    mockHealthCheck: async () => {
      await page.route('**/api/health', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stubbedResponses.healthCheck),
        })
      })
    },

    mockServices: async () => {
      await page.route('**/api/services', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stubbedResponses.services),
        })
      })
    },

    mockProviders: async () => {
      await page.route('**/api/providers', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(stubbedResponses.providers),
        })
      })
    },

    mockLoginSuccess: async () => {
      await page.route('**/auth/jwt/login', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'test-token-12345',
            token_type: 'bearer',
          }),
        })
      })
    },

    mockLoginFailure: async () => {
      await page.route('**/auth/jwt/login', (route: any) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            detail: 'Invalid credentials',
          }),
        })
      })
    },
  }
}
