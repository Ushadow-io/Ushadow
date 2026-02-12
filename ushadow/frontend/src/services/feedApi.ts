/**
 * Feed API Client
 *
 * HTTP functions for the personalized fediverse feed feature.
 * Uses the shared `api` axios instance (includes JWT auth automatically).
 */

import { api } from './api'

export interface FeedPost {
  post_id: string
  user_id: string
  source_id: string
  external_id: string
  author_handle: string
  author_display_name: string
  author_avatar: string | null
  content: string
  url: string
  published_at: string
  hashtags: string[]
  language: string | null
  boosts_count: number
  favourites_count: number
  replies_count: number
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
  instance_url: string
  platform_type: string
  enabled: boolean
  created_at: string
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

export const feedApi = {
  // Posts
  getPosts: (params: {
    page?: number
    page_size?: number
    interest?: string
    show_seen?: boolean
  }) => api.get<FeedResponse>('/api/feed/posts', { params }),

  // Refresh
  refresh: () => api.post<RefreshResult>('/api/feed/refresh'),

  // Interests
  getInterests: () =>
    api.get<{ interests: FeedInterest[] }>('/api/feed/interests'),

  // Sources
  getSources: () =>
    api.get<{ sources: FeedSource[] }>('/api/feed/sources'),

  addSource: (data: { name: string; instance_url: string; platform_type?: string }) =>
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
}
