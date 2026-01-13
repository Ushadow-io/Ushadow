/**
 * Memories API Wrapper
 *
 * Wraps the memories API to support demo mode.
 * When demo mode is enabled, routes calls to demo implementation.
 * Otherwise, uses the real API.
 */

import { isDemoMode } from '../utils/demoModeStorage';
import * as realMemoriesApi from './memoriesApi';
import * as demoApi from './demoApiService';
import type { Memory, MemoriesSearchResponse } from './memoriesApi';

/**
 * Fetch memories with optional search query and pagination.
 * Routes to demo API if in demo mode.
 */
export async function fetchMemories(
  userId: string,
  query?: string,
  page: number = 1,
  size: number = 100
): Promise<MemoriesSearchResponse> {
  const demoMode = await isDemoMode();

  if (demoMode) {
    return demoApi.demoFetchMemories(userId, query, page, size);
  }

  return realMemoriesApi.fetchMemories(userId, query, page, size);
}

/**
 * Search memories with query string.
 * Routes to demo API if in demo mode.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit: number = 50
): Promise<MemoriesSearchResponse> {
  if (await isDemoMode()) {
    return demoApi.demoSearchMemories(userId, query, limit);
  }
  return realMemoriesApi.searchMemories(userId, query, limit);
}

/**
 * Create a new memory.
 * Routes to demo API if in demo mode.
 */
export async function createMemory(
  userId: string,
  text: string,
  app: string = 'ushadow-mobile'
): Promise<Memory> {
  if (await isDemoMode()) {
    return demoApi.demoCreateMemory(userId, text, app);
  }
  return realMemoriesApi.createMemory(userId, text, app);
}

/**
 * Delete memories by IDs.
 * Routes to demo API if in demo mode.
 */
export async function deleteMemories(userId: string, memoryIds: string[]): Promise<void> {
  if (await isDemoMode()) {
    return demoApi.demoDeleteMemories(userId, memoryIds);
  }
  return realMemoriesApi.deleteMemories(userId, memoryIds);
}

// Re-export types
export type { Memory, MemoriesSearchResponse } from './memoriesApi';
