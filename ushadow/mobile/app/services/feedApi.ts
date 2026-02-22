/**
 * Feed API Client — Mobile
 *
 * Authenticated HTTP calls for the personalized multi-platform feed.
 * Routes directly to ushadow backend at /api/feed/*.
 */

import { getAuthToken, getApiUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';

// ═══════════════════════════════════════════════════════════════════════════
// Types (mirrors backend models + web feedApi.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface FeedPost {
  post_id: string;
  user_id: string;
  source_id: string;
  external_id: string;
  platform_type: 'mastodon' | 'youtube';
  author_handle: string;
  author_display_name: string;
  author_avatar: string | null;
  content: string;
  url: string;
  published_at: string;
  hashtags: string[];
  language: string | null;
  // Mastodon
  boosts_count: number | null;
  favourites_count: number | null;
  replies_count: number | null;
  // YouTube
  thumbnail_url?: string | null;
  video_id?: string | null;
  channel_title?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  duration?: string | null;
  // Scoring & interaction
  relevance_score: number;
  matched_interests: string[];
  seen: boolean;
  bookmarked: boolean;
  fetched_at: string;
}

export interface FeedInterest {
  name: string;
  node_id: string;
  labels: string[];
  relationship_count: number;
  last_active: string | null;
  hashtags: string[];
}

export interface FeedResponse {
  posts: FeedPost[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RefreshResult {
  status: string;
  interests_count: number;
  posts_fetched: number;
  posts_new: number;
  message?: string;
}

export interface FeedStats {
  total_posts: number;
  unseen_posts: number;
  bookmarked_posts: number;
  sources_count: number;
}

export interface PostSource {
  source_id: string;
  name: string;
  platform_type: 'mastodon' | 'youtube';
  instance_url: string | null;
  enabled: boolean;
  // access_token intentionally omitted — sensitive, not needed by mobile
}

export interface MastodonConnectRequest {
  instance_url: string;
  code: string;
  redirect_uri: string;
  name?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (same pattern as memoriesApi.ts)
// ═══════════════════════════════════════════════════════════════════════════

async function getBaseUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();
  if (activeUnode?.apiUrl) return activeUnode.apiUrl;

  const storedUrl = await getApiUrl();
  if (storedUrl) return storedUrl;

  return 'https://ushadow.wolf-tawny.ts.net';
}

async function getToken(): Promise<string | null> {
  const activeUnode = await getActiveUnode();
  if (activeUnode?.authToken) return activeUnode.authToken;
  return getAuthToken();
}

async function feedRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const [baseUrl, token] = await Promise.all([getBaseUrl(), getToken()]);

  if (!token) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const url = `${baseUrl}/api/feed${endpoint}`;
  console.log(`[FeedAPI] ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[FeedAPI] Request failed: ${response.status}`, errorText);
    throw new Error(`Feed API request failed: ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchFeedPosts(params: {
  page?: number;
  page_size?: number;
  interest?: string;
  show_seen?: boolean;
  platform_type?: string;
}): Promise<FeedResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  if (params.interest) query.set('interest', params.interest);
  if (params.show_seen !== undefined) query.set('show_seen', String(params.show_seen));
  if (params.platform_type) query.set('platform_type', params.platform_type);

  const qs = query.toString();
  return feedRequest<FeedResponse>(`/posts${qs ? `?${qs}` : ''}`);
}

export async function fetchFeedInterests(): Promise<FeedInterest[]> {
  const data = await feedRequest<{ interests: FeedInterest[] }>('/interests');
  return data.interests;
}

export async function refreshFeed(platformType?: string): Promise<RefreshResult> {
  const qs = platformType ? `?platform_type=${platformType}` : '';
  return feedRequest<RefreshResult>(`/refresh${qs}`, { method: 'POST' });
}

export async function markPostSeen(postId: string): Promise<void> {
  await feedRequest(`/posts/${postId}/seen`, { method: 'POST' });
}

export async function bookmarkPost(postId: string): Promise<void> {
  await feedRequest(`/posts/${postId}/bookmark`, { method: 'POST' });
}

export async function fetchFeedStats(): Promise<FeedStats> {
  return feedRequest<FeedStats>('/stats');
}

export async function fetchFeedSources(): Promise<PostSource[]> {
  const data = await feedRequest<{ sources: PostSource[] }>('/sources');
  return data.sources;
}

export async function getMastodonAuthUrl(
  instanceUrl: string,
  redirectUri: string,
): Promise<string> {
  const qs = new URLSearchParams({ instance_url: instanceUrl, redirect_uri: redirectUri });
  const data = await feedRequest<{ authorization_url: string }>(
    `/sources/mastodon/auth-url?${qs}`,
  );
  return data.authorization_url;
}

export async function connectMastodon(req: MastodonConnectRequest): Promise<PostSource> {
  return feedRequest<PostSource>('/sources/mastodon/connect', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
