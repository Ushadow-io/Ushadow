/**
 * useFeed Hooks
 *
 * React Query hooks for the personalized fediverse feed feature.
 * Provides hooks for posts, interests, sources, refresh, and post actions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { feedApi, type FeedPost } from '../services/feedApi'
import { useAuth } from '../contexts/AuthContext'
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'

/** Resolve user email from whichever auth provider is active. */
function useUserId(): { userId: string; isLoadingUser: boolean } {
  const { user: legacyUser, isLoading: legacyLoading } = useAuth()
  const { isAuthenticated: kcAuthenticated, user: kcUser, isLoading: kcLoading } = useKeycloakAuth()

  const user = kcAuthenticated && kcUser ? kcUser : legacyUser
  return {
    userId: user?.email || 'ushadow',
    isLoadingUser: legacyLoading || kcLoading,
  }
}

// ---------------------------------------------------------------------------
// Feed Posts
// ---------------------------------------------------------------------------

export function useFeedPosts(
  page: number = 1,
  pageSize: number = 20,
  interest?: string,
  showSeen: boolean = true,
) {
  const { userId, isLoadingUser } = useUserId()
  const queryClient = useQueryClient()

  const postsQuery = useQuery({
    queryKey: ['feedPosts', userId, page, pageSize, interest, showSeen],
    queryFn: () =>
      feedApi.getPosts({ page, page_size: pageSize, interest, show_seen: showSeen }).then(r => r.data),
    staleTime: 60_000,
    enabled: !isLoadingUser,
  })

  const markSeenMutation = useMutation({
    mutationFn: (postId: string) => feedApi.markSeen(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedPosts'] })
      queryClient.invalidateQueries({ queryKey: ['feedStats'] })
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: (postId: string) => feedApi.bookmarkPost(postId),
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({ queryKey: ['feedPosts'] })
      queryClient.setQueriesData<{ posts: FeedPost[] }>(
        { queryKey: ['feedPosts'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            posts: old.posts.map((p) =>
              p.post_id === postId ? { ...p, bookmarked: !p.bookmarked } : p,
            ),
          }
        },
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedPosts'] })
      queryClient.invalidateQueries({ queryKey: ['feedStats'] })
    },
  })

  return {
    posts: postsQuery.data?.posts ?? [],
    total: postsQuery.data?.total ?? 0,
    totalPages: postsQuery.data?.total_pages ?? 1,
    isLoading: postsQuery.isLoading,
    isFetching: postsQuery.isFetching,
    error: postsQuery.error,
    refetch: postsQuery.refetch,

    markSeen: markSeenMutation.mutate,
    toggleBookmark: bookmarkMutation.mutate,
  }
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

export function useFeedInterests() {
  const { userId, isLoadingUser } = useUserId()

  const query = useQuery({
    queryKey: ['feedInterests', userId],
    queryFn: () => feedApi.getInterests().then(r => r.data),
    staleTime: 120_000,
    enabled: !isLoadingUser,
  })

  return {
    interests: query.data?.interests ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export function useFeedSources() {
  const { userId, isLoadingUser } = useUserId()
  const queryClient = useQueryClient()

  const sourcesQuery = useQuery({
    queryKey: ['feedSources', userId],
    queryFn: () => feedApi.getSources().then(r => r.data),
    staleTime: 120_000,
    enabled: !isLoadingUser,
  })

  const addMutation = useMutation({
    mutationFn: (data: { name: string; instance_url: string; platform_type?: string }) =>
      feedApi.addSource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedSources'] })
      queryClient.invalidateQueries({ queryKey: ['feedStats'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (sourceId: string) => feedApi.removeSource(sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedSources'] })
      queryClient.invalidateQueries({ queryKey: ['feedStats'] })
    },
  })

  return {
    sources: sourcesQuery.data?.sources ?? [],
    isLoading: sourcesQuery.isLoading,
    error: sourcesQuery.error,

    addSource: addMutation.mutateAsync,
    isAdding: addMutation.isPending,

    removeSource: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  }
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export function useRefreshFeed() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => feedApi.refresh().then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedPosts'] })
      queryClient.invalidateQueries({ queryKey: ['feedInterests'] })
      queryClient.invalidateQueries({ queryKey: ['feedStats'] })
    },
  })

  return {
    refresh: mutation.mutateAsync,
    isRefreshing: mutation.isPending,
    lastResult: mutation.data ?? null,
    error: mutation.error,
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function useFeedStats() {
  const { userId, isLoadingUser } = useUserId()

  const query = useQuery({
    queryKey: ['feedStats', userId],
    queryFn: () => feedApi.getStats().then(r => r.data),
    staleTime: 30_000,
    enabled: !isLoadingUser,
  })

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
  }
}
