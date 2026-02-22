/**
 * Feed Tab - Ushadow Mobile
 *
 * Multi-platform feed ranked by OpenMemory knowledge graph interests.
 * Platforms: Social (Mastodon), Bluesky, Following (authenticated timeline), Videos (YouTube).
 * All AT Protocol and Mastodon complexity lives in the backend — this screen
 * just fetches from /api/feed/* with a Bearer token.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import {
  fetchPosts,
  refreshFeed,
  markPostSeen,
  bookmarkPost,
  type FeedPost,
} from '../services/feedApi';
import { isAuthenticated } from '../_utils/authStorage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FeedTab = 'social' | 'bluesky' | 'following' | 'videos';

const TAB_LABELS: Record<FeedTab, string> = {
  social: 'Social',
  bluesky: 'Bluesky',
  following: 'Following',
  videos: 'Videos',
};

const TAB_TO_PLATFORM: Record<FeedTab, string> = {
  social: 'mastodon',
  bluesky: 'bluesky',
  following: 'bluesky_timeline',
  videos: 'youtube',
};

const TAB_ICONS: Record<FeedTab, { focused: string; outline: string }> = {
  social: { focused: 'chatbubble-ellipses', outline: 'chatbubble-ellipses-outline' },
  bluesky: { focused: 'cloud', outline: 'cloud-outline' },
  following: { focused: 'people', outline: 'people-outline' },
  videos: { focused: 'play-circle', outline: 'play-circle-outline' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Post Card
// ─────────────────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: FeedPost;
  onBookmark: (postId: string) => void;
  onMarkSeen: (postId: string) => void;
}

function PostCard({ post, onBookmark, onMarkSeen }: PostCardProps) {
  const plainText = stripHtml(post.content);

  const handleOpenLink = () => {
    if (post.url) Linking.openURL(post.url);
  };

  return (
    <View
      style={[styles.postCard, post.seen && styles.postCardSeen]}
      testID={`post-card-${post.post_id}`}
    >
      {/* Header: avatar initial + author info + time */}
      <View style={styles.postHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {(post.author_display_name || post.author_handle).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.authorInfo}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author_display_name || post.author_handle}
          </Text>
          <Text style={styles.authorHandle} numberOfLines={1}>
            {post.author_handle}
          </Text>
        </View>
        <Text style={styles.postTime}>{timeAgo(post.published_at)}</Text>
        {post.relevance_score > 0 && (
          <View style={styles.scorePill} testID={`post-card-${post.post_id}-score`}>
            <Text style={styles.scoreText}>{post.relevance_score.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={6}>
        {plainText}
      </Text>

      {/* Matched interests */}
      {post.matched_interests.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsRow}
          testID={`post-card-${post.post_id}-interests`}
        >
          {post.matched_interests.map((name) => (
            <View key={name} style={styles.interestTag}>
              <Text style={styles.interestTagText}>{name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow}>
          {post.hashtags.slice(0, 5).map((tag) => (
            <Text key={tag} style={styles.hashtag}>
              #{tag}
            </Text>
          ))}
        </ScrollView>
      )}

      {/* Actions */}
      <View style={styles.postActions}>
        <TouchableOpacity
          onPress={() => onBookmark(post.post_id)}
          style={styles.actionButton}
          testID={`post-card-${post.post_id}-bookmark`}
        >
          <Ionicons
            name={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={post.bookmarked ? colors.warning.default : theme.textMuted}
          />
        </TouchableOpacity>

        {!post.seen && (
          <TouchableOpacity
            onPress={() => onMarkSeen(post.post_id)}
            style={styles.actionButton}
            testID={`post-card-${post.post_id}-seen`}
          >
            <Ionicons name="eye-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleOpenLink}
          style={[styles.actionButton, styles.actionButtonRight]}
          testID={`post-card-${post.post_id}-link`}
        >
          <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          <Text style={styles.actionLinkText}>Original</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const [activeTab, setActiveTab] = useState<FeedTab>('social');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadPosts = useCallback(
    async (tab: FeedTab, pageNum: number, append = false, showRefresh = false) => {
      try {
        if (showRefresh) setIsRefreshing(true);
        else if (append) setIsFetchingMore(true);
        else setIsLoading(true);
        setError(null);

        const loggedIn = await isAuthenticated();
        setIsLoggedIn(loggedIn);
        if (!loggedIn) {
          setPosts([]);
          return;
        }

        const res = await fetchPosts({
          page: pageNum,
          page_size: 20,
          platform_type: TAB_TO_PLATFORM[tab],
          show_seen: true,
        });

        setPosts((prev) => (append ? [...prev, ...res.posts] : res.posts));
        setTotalPages(res.total_pages);
        setPage(pageNum);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load feed';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    },
    []
  );

  // Initial load + re-load on focus
  useFocusEffect(
    useCallback(() => {
      loadPosts(activeTab, 1);
    }, [loadPosts, activeTab])
  );

  const handleTabChange = (tab: FeedTab) => {
    setActiveTab(tab);
    setPage(1);
    loadPosts(tab, 1);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshFeed(TAB_TO_PLATFORM[activeTab]);
    } catch {
      // ignore refresh errors; re-load anyway
    }
    await loadPosts(activeTab, 1, false, true);
  }, [activeTab, loadPosts]);

  const handleLoadMore = useCallback(() => {
    if (!isFetchingMore && page < totalPages) {
      loadPosts(activeTab, page + 1, true);
    }
  }, [isFetchingMore, page, totalPages, activeTab, loadPosts]);

  const handleBookmark = useCallback(async (postId: string) => {
    try {
      await bookmarkPost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.post_id === postId ? { ...p, bookmarked: !p.bookmarked } : p))
      );
    } catch {
      // ignore
    }
  }, []);

  const handleMarkSeen = useCallback(async (postId: string) => {
    try {
      await markPostSeen(postId);
      setPosts((prev) =>
        prev.map((p) => (p.post_id === postId ? { ...p, seen: true } : p))
      );
    } catch {
      // ignore
    }
  }, []);

  const renderPost = ({ item }: { item: FeedPost }) => (
    <PostCard post={item} onBookmark={handleBookmark} onMarkSeen={handleMarkSeen} />
  );

  const renderFooter = () => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footerLoader} testID="feed-loading-more">
        <ActivityIndicator size="small" color={colors.primary[400]} />
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      {!isLoggedIn ? (
        <>
          <Ionicons name="log-in-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptySubtitle}>Log in from the Home tab to view your feed</Text>
        </>
      ) : (
        <>
          <Ionicons name="radio-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No Posts Yet</Text>
          <Text style={styles.emptySubtitle}>
            Pull to refresh, or add a source for this platform in the web app
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="feed-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSubtitle}>Ranked by your knowledge graph</Text>
        </View>
      </View>

      {/* Platform tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        testID="feed-tabs"
      >
        {(Object.keys(TAB_LABELS) as FeedTab[]).map((tab) => {
          const icons = TAB_ICONS[tab];
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              testID={`feed-tab-${tab}`}
            >
              <Ionicons
                name={(isActive ? icons.focused : icons.outline) as any}
                size={16}
                color={isActive ? colors.primary[400] : theme.textMuted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {TAB_LABELS[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner} testID="feed-error">
          <Ionicons name="alert-circle" size={18} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer} testID="feed-loading">
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading feed…</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.post_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary[400]}
              colors={[colors.primary[400]]}
            />
          }
          testID="feed-post-list"
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: theme.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  // Tab bar
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabButtonActive: {
    borderBottomColor: colors.primary[400],
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textMuted,
  },
  tabLabelActive: {
    color: colors.primary[400],
  },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    flex: 1,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  // List
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['3xl'] * 2,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Post card
  postCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  postCardSeen: {
    opacity: 0.7,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundInput,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  authorInfo: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  authorHandle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  postTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    flexShrink: 0,
  },
  scorePill: {
    backgroundColor: colors.primary[900] ?? theme.backgroundInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    flexShrink: 0,
  },
  scoreText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary[400],
  },
  postContent: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  tagsRow: {
    marginBottom: spacing.sm,
  },
  interestTag: {
    backgroundColor: colors.primary[900] ?? theme.backgroundInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
  },
  interestTagText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
  },
  hashtag: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
    marginRight: spacing.sm,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  actionButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  actionLinkText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
});
