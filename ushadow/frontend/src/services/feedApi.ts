/**
 * Feed API Client
 *
 * HTTP functions for the personalized multi-platform feed feature.
 * Uses the shared `api` axios instance (includes JWT auth automatically).
 */

import { api } from './api'

export interface FeedPost {
  post_id: string
  user_id: string
  source_id: string
  external_id: string
  platform_type: string // 'mastodon' | 'youtube' | 'bluesky' | 'bluesky_timeline'
  author_handle: string
  author_display_name: string
  author_avatar: string | null
  content: string
  url: string
  published_at: string
  hashtags: string[]
  language: string | null
  // Mastodon engagement (optional — null for non-mastodon)
  boosts_count: number | null
  favourites_count: number | null
  replies_count: number | null
  // YouTube-specific (optional — null for non-youtube)
  thumbnail_url?: string | null
  video_id?: string | null
  channel_title?: string | null
  view_count?: number | null
  like_count?: number | null
  duration?: string | null
  // Bluesky-specific (optional — null for non-bluesky)
  bluesky_cid?: string | null
  // Scoring & interaction
  relevance_score: number
  matched_interests: string[]
  seen: boolean
  bookmarked: boolean
  fetched_at: string
}

export interface FeedInterest {
  name: string
  node_id: string
  labels: string[]
  relationship_count: number
  last_active: string | null
  hashtags: string[]
}

export interface FeedSource {
  source_id: string
  user_id: string
  name: string
  platform_type: string
  instance_url: string | null
  api_key: string | null
  handle: string | null
  enabled: boolean
  created_at: string
}

export interface BlueskyComposeData {
  source_id: string
  text: string
}

export interface FeedResponse {
  posts: FeedPost[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface RefreshResult {
  status: string
  interests_count: number
  interests_used?: Array<{ name: string; hashtags: string[]; weight: number }>
  posts_fetched: number
  posts_scored?: number
  posts_new: number
  message?: string
}

export interface SourceCreateData {
  name: string
  platform_type: string
  instance_url?: string
  api_key?: string
  handle?: string
}

export const feedApi = {
  // Posts
  getPosts: (params: {
    page?: number
    page_size?: number
    interest?: string
    show_seen?: boolean
    platform_type?: string
  }) => api.get<FeedResponse>('/api/feed/posts', { params }),

  // Refresh (optionally scoped to one platform)
  refresh: (platformType?: string) =>
    api.post<RefreshResult>('/api/feed/refresh', null, {
      params: platformType ? { platform_type: platformType } : undefined,
    }),

  // Interests
  getInterests: () =>
    api.get<{ interests: FeedInterest[] }>('/api/feed/interests'),

  // Sources
  getSources: () =>
    api.get<{ sources: FeedSource[] }>('/api/feed/sources'),

  addSource: (data: SourceCreateData) =>
    api.post<FeedSource>('/api/feed/sources', data),

  removeSource: (sourceId: string) =>
    api.delete(`/api/feed/sources/${sourceId}`),

  // Post actions
  markSeen: (postId: string) =>
    api.post(`/api/feed/posts/${postId}/seen`),

  bookmarkPost: (postId: string) =>
    api.post(`/api/feed/posts/${postId}/bookmark`),

  // Stats
  getStats: () =>
    api.get<{ total_posts: number; unseen_posts: number; bookmarked_posts: number; sources_count: number }>(
      '/api/feed/stats'
    ),

  // Bluesky compose
  bskyPost: (data: BlueskyComposeData) =>
    api.post<{ uri: string; cid: string }>('/api/feed/bluesky/post', data),

  bskyReply: (postId: string, data: BlueskyComposeData) =>
    api.post<{ uri: string; cid: string }>(`/api/feed/bluesky/reply/${postId}`, data),
}
