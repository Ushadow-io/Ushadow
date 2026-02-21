/**
 * Feeds Tab — Ushadow Mobile
 *
 * Personalized social media and video feed ranked by your knowledge graph
 * interests. Mirrors the web FeedPage with Social/Videos sub-tabs,
 * interest filter chips, and post cards.
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
  Image,
  Linking,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { isAuthenticated } from '../_utils/authStorage';
import {
  fetchFeedPosts,
  fetchFeedInterests,
  fetchFeedSources,
  refreshFeed,
  bookmarkPost,
  markPostSeen,
  getMastodonAuthUrl,
  connectMastodon,
  type FeedPost,
  type FeedInterest,
  type PostSource,
} from '../services/feedApi';

WebBrowser.maybeCompleteAuthSession();

type FeedTab = 'social' | 'videos';

const TAB_PLATFORM: Record<FeedTab, string> = {
  social: 'mastodon',
  videos: 'youtube',
};

export default function FeedsScreen() {
  const [activeTab, setActiveTab] = useState<FeedTab>('social');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [interests, setInterests] = useState<FeedInterest[]>([]);
  const [selectedInterest, setSelectedInterest] = useState<string | undefined>();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sources, setSources] = useState<PostSource[]>([]);
  const [instanceUrlInput, setInstanceUrlInput] = useState('mastodon.social');
  const [isConnecting, setIsConnecting] = useState(false);

  const platformType = TAB_PLATFORM[activeTab];

  // ─── Data Loading ────────────────────────────────────────────────────

  const loadData = useCallback(
    async (opts?: { showRefresh?: boolean; pageNum?: number }) => {
      try {
        if (opts?.showRefresh) setIsRefreshing(true);
        setError(null);

        const loggedIn = await isAuthenticated();
        setIsLoggedIn(loggedIn);
        if (!loggedIn) {
          setPosts([]);
          setInterests([]);
          return;
        }

        const currentPage = opts?.pageNum ?? page;

        const [feedData, interestData, sourcesData] = await Promise.all([
          fetchFeedPosts({
            page: currentPage,
            page_size: 20,
            interest: selectedInterest,
            platform_type: platformType,
          }),
          fetchFeedInterests(),
          fetchFeedSources(),
        ]);

        setPosts(feedData.posts);
        setTotal(feedData.total);
        setTotalPages(feedData.total_pages);
        setInterests(interestData);
        setSources(sourcesData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load feed';
        setError(message);
        console.error('[Feeds] Error:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, selectedInterest, platformType],
  );

  // Reload on focus
  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadData();
    }, [loadData]),
  );

  const handlePullRefresh = useCallback(() => {
    loadData({ showRefresh: true });
  }, [loadData]);

  const handleRefreshFeed = useCallback(async () => {
    try {
      setIsRefreshingFeed(true);
      await refreshFeed(platformType);
      setPage(1);
      await loadData({ pageNum: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsRefreshingFeed(false);
    }
  }, [platformType, loadData]);

  const handleTabChange = useCallback(
    (tab: FeedTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      setPage(1);
      setSelectedInterest(undefined);
      setPosts([]);
      setIsLoading(true);
    },
    [activeTab],
  );

  const handleInterestPress = useCallback(
    (name: string) => {
      setSelectedInterest((prev) => (prev === name ? undefined : name));
      setPage(1);
      setPosts([]);
      setIsLoading(true);
    },
    [],
  );

  const handleBookmark = useCallback(
    async (postId: string) => {
      try {
        await bookmarkPost(postId);
        setPosts((prev) =>
          prev.map((p) =>
            p.post_id === postId ? { ...p, bookmarked: !p.bookmarked } : p,
          ),
        );
      } catch (err) {
        console.error('[Feeds] Bookmark error:', err);
      }
    },
    [],
  );

  const handleMarkSeen = useCallback(
    async (postId: string) => {
      try {
        await markPostSeen(postId);
        setPosts((prev) =>
          prev.map((p) =>
            p.post_id === postId ? { ...p, seen: true } : p,
          ),
        );
      } catch (err) {
        console.error('[Feeds] Mark seen error:', err);
      }
    },
    [],
  );

  const handleOpenUrl = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  const handleConnectMastodon = useCallback(async () => {
    const rawUrl = instanceUrlInput.trim();
    if (!rawUrl) return;
    try {
      setIsConnecting(true);
      setError(null);

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'ushadow',
        path: 'feed/mastodon/callback',
        useProxy: false,
      });

      // 1. Ask backend to register the app and return the authorization URL
      const authUrl = await getMastodonAuthUrl(rawUrl, redirectUri);

      // 2. Open browser — resolves when Mastodon redirects back to the app
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success') {
        // User cancelled — not an error
        return;
      }

      // 3. Extract authorization code from the redirect URL
      const code = new URL(result.url).searchParams.get('code');
      if (!code) {
        setError('No authorization code received from Mastodon.');
        return;
      }

      // 4. Exchange code for access token (backend stores it on the source)
      await connectMastodon({
        instance_url: rawUrl,
        code,
        redirect_uri: redirectUri,
        name: `Mastodon (${rawUrl})`,
      });

      // 5. Reload — source now has token, feed refresh will pull home timeline
      setIsLoading(true);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mastodon connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [instanceUrlInput, loadData]);

  // ─── Helpers ─────────────────────────────────────────────────────────

  const timeAgo = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const stripHtml = (html: string): string =>
    html
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

  const formatCount = (n: number | null | undefined): string => {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // ─── Renderers ───────────────────────────────────────────────────────

  const renderMastodonPost = (post: FeedPost) => (
    <View style={[styles.card, post.seen && styles.cardSeen]} testID={`post-card-${post.post_id}`}>
      {/* Author row */}
      <View style={styles.authorRow}>
        {post.author_avatar ? (
          <Image source={{ uri: post.author_avatar }} style={styles.avatar} testID={`post-avatar-${post.post_id}`} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>
              {(post.author_display_name || post.author_handle).charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.authorInfo}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author_display_name || post.author_handle}
          </Text>
          <Text style={styles.authorHandle} numberOfLines={1}>
            {post.author_handle} · {timeAgo(post.published_at)}
          </Text>
        </View>
        {post.relevance_score > 0 && (
          <View style={styles.scorePill} testID={`post-score-${post.post_id}`}>
            <Text style={styles.scoreText}>{post.relevance_score.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={6}>
        {stripHtml(post.content)}
      </Text>

      {/* Matched interests */}
      {post.matched_interests.length > 0 && (
        <View style={styles.interestRow}>
          {post.matched_interests.slice(0, 3).map((name) => (
            <View key={name} style={styles.matchedChip}>
              <Text style={styles.matchedChipText}>{name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={() => handleBookmark(post.post_id)}
          style={[styles.actionBtn, post.bookmarked && styles.actionBtnActive]}
          testID={`post-bookmark-${post.post_id}`}
        >
          <Ionicons
            name={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={post.bookmarked ? colors.warning.default : theme.textMuted}
          />
        </TouchableOpacity>
        {!post.seen && (
          <TouchableOpacity
            onPress={() => handleMarkSeen(post.post_id)}
            style={styles.actionBtn}
            testID={`post-mark-seen-${post.post_id}`}
          >
            <Ionicons name="eye-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => handleOpenUrl(post.url)}
          style={styles.actionBtn}
          testID={`post-open-${post.post_id}`}
        >
          <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          <Text style={styles.actionLabel}>Original</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderYoutubePost = (post: FeedPost) => {
    const titleMatch = post.content.match(/<b>(.*?)<\/b>/);
    const title = titleMatch ? titleMatch[1] : stripHtml(post.content).slice(0, 100);

    return (
      <TouchableOpacity
        style={[styles.card, post.seen && styles.cardSeen]}
        onPress={() => handleOpenUrl(post.url)}
        activeOpacity={0.8}
        testID={`youtube-card-${post.post_id}`}
      >
        {/* Thumbnail */}
        {post.thumbnail_url ? (
          <View style={styles.thumbnailContainer}>
            <Image
              source={{ uri: post.thumbnail_url }}
              style={styles.thumbnail}
              testID={`youtube-thumb-${post.post_id}`}
            />
            {post.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{post.duration}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.thumbnailContainer, styles.thumbnailPlaceholder]}>
            <Ionicons name="play" size={32} color={theme.textMuted} />
          </View>
        )}

        {/* Video info */}
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2} testID={`youtube-title-${post.post_id}`}>
            {title}
          </Text>
          <View style={styles.videoMeta}>
            {post.channel_title && (
              <Text style={styles.channelName} numberOfLines={1}>
                {post.channel_title}
              </Text>
            )}
            <Text style={styles.videoMetaText}>
              {timeAgo(post.published_at)}
              {post.view_count != null && ` · ${formatCount(post.view_count)} views`}
              {post.like_count != null && ` · ${formatCount(post.like_count)} likes`}
            </Text>
          </View>

          {/* Matched interests */}
          {post.matched_interests.length > 0 && (
            <View style={styles.interestRow}>
              {post.matched_interests.slice(0, 3).map((name) => (
                <View key={name} style={styles.matchedChip}>
                  <Text style={styles.matchedChipText}>{name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Score + bookmark */}
          <View style={styles.actionsRow}>
            {post.relevance_score > 0 && (
              <View style={styles.scorePill}>
                <Text style={styles.scoreText}>{post.relevance_score.toFixed(1)}</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                handleBookmark(post.post_id);
              }}
              style={[styles.actionBtn, post.bookmarked && styles.actionBtnActive]}
              testID={`youtube-bookmark-${post.post_id}`}
            >
              <Ionicons
                name={post.bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={post.bookmarked ? colors.warning.default : theme.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPost = ({ item }: { item: FeedPost }) =>
    item.platform_type === 'youtube' ? renderYoutubePost(item) : renderMastodonPost(item);

  const hasMastodonSource = sources.some((s) => s.platform_type === 'mastodon' && s.enabled);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {!isLoggedIn ? (
        <>
          <Ionicons name="log-in-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptySubtitle}>
            Log in from the Home tab to view your feed
          </Text>
        </>
      ) : activeTab === 'social' && !hasMastodonSource ? (
        /* ── Connect Mastodon ── */
        <>
          <Ionicons name="at-circle-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Connect Mastodon</Text>
          <Text style={styles.emptySubtitle}>
            Sign in with your Mastodon account to see your home timeline, ranked by your interests.
          </Text>

          <View style={styles.connectForm}>
            <Text style={styles.connectLabel}>Instance</Text>
            <TextInput
              style={styles.connectInput}
              value={instanceUrlInput}
              onChangeText={setInstanceUrlInput}
              placeholder="mastodon.social"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="mastodon-instance-input"
            />
            <TouchableOpacity
              style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
              onPress={handleConnectMastodon}
              disabled={isConnecting}
              testID="mastodon-connect-btn"
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color={theme.primaryButtonText} />
              ) : (
                <>
                  <Ionicons name="logo-mastodon" size={18} color={theme.primaryButtonText} />
                  <Text style={styles.connectButtonText}>Connect with Mastodon</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Ionicons
            name={activeTab === 'videos' ? 'videocam-outline' : 'chatbubbles-outline'}
            size={48}
            color={theme.textMuted}
          />
          <Text style={styles.emptyTitle}>No Posts Yet</Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === 'videos'
              ? 'Add a YouTube source and refresh to see videos ranked by your interests'
              : 'Refresh to fetch posts from your Mastodon home timeline'}
          </Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefreshFeed}
            disabled={isRefreshingFeed}
            testID="feed-refresh-empty"
          >
            {isRefreshingFeed ? (
              <ActivityIndicator size="small" color={theme.primaryButtonText} />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color={theme.primaryButtonText} />
                <Text style={styles.refreshButtonText}>Refresh Feed</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  // ─── Main Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} testID="feeds-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Feed</Text>
            <Text style={styles.headerSubtitle}>
              {total > 0 ? `${total} posts` : 'Ranked by your interests'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerRefreshBtn, isRefreshingFeed && styles.headerRefreshBtnDisabled]}
            onPress={handleRefreshFeed}
            disabled={isRefreshingFeed}
            testID="feed-refresh-btn"
          >
            {isRefreshingFeed ? (
              <ActivityIndicator size="small" color={theme.primaryButtonText} />
            ) : (
              <Ionicons name="refresh" size={20} color={theme.primaryButtonText} />
            )}
          </TouchableOpacity>
        </View>

        {/* Sub-tabs: Social | Videos */}
        <View style={styles.tabBar} testID="feed-tab-bar">
          <TouchableOpacity
            style={[styles.tab, activeTab === 'social' && styles.tabActive]}
            onPress={() => handleTabChange('social')}
            testID="feed-tab-social"
          >
            <Ionicons
              name="chatbubbles-outline"
              size={16}
              color={activeTab === 'social' ? colors.primary[400] : theme.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'social' && styles.tabTextActive]}>
              Social
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'videos' && styles.tabActive]}
            onPress={() => handleTabChange('videos')}
            testID="feed-tab-videos"
          >
            <Ionicons
              name="play-outline"
              size={16}
              color={activeTab === 'videos' ? colors.primary[400] : theme.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'videos' && styles.tabTextActive]}>
              Videos
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Interest filter chips */}
      {isLoggedIn && interests.length > 0 && (
        <View style={styles.chipWrap} testID="feed-interest-chips">
          <TouchableOpacity
            style={[styles.chip, !selectedInterest && styles.chipActive]}
            onPress={() => handleInterestPress('')}
            testID="feed-interest-all"
          >
            <Text style={[styles.chipText, !selectedInterest && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {interests.slice(0, 15).map((interest) => (
            <TouchableOpacity
              key={interest.name}
              style={[styles.chip, selectedInterest === interest.name && styles.chipActive]}
              onPress={() => handleInterestPress(interest.name)}
              testID={`feed-interest-${interest.node_id}`}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedInterest === interest.name && styles.chipTextActive,
                ]}
                numberOfLines={1}
              >
                {interest.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBanner} testID="feed-error">
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading feed...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.post_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullRefresh}
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

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
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
  headerRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRefreshBtnDisabled: { opacity: 0.6 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary[400] },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textMuted,
  },
  tabTextActive: { color: colors.primary[400] },

  // Interest chips
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundCard,
  },
  chipActive: { backgroundColor: colors.primary[400] },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  chipTextActive: { color: theme.primaryButtonText },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
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
    paddingBottom: spacing['3xl'],
  },

  // Post card (shared)
  card: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardSeen: { opacity: 0.65 },

  // Mastodon author
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.backgroundInput,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textMuted,
  },
  authorInfo: { flex: 1, marginLeft: spacing.sm },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  authorHandle: { fontSize: fontSize.xs, color: theme.textMuted },

  // Content
  postContent: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },

  // Relevance score
  scorePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  scoreText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary[400],
  },

  // Matched interests
  interestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  matchedChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
  },
  matchedChipText: {
    fontSize: fontSize.xs,
    color: colors.accent[400],
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  actionLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },

  // YouTube thumbnail
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.backgroundInput,
    marginBottom: spacing.sm,
  },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  durationText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.white,
  },

  // YouTube info
  videoInfo: { gap: spacing.xs },
  videoTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
    lineHeight: 20,
  },
  videoMeta: { gap: 2 },
  channelName: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  videoMetaText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
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
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[400],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  refreshButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },

  // Mastodon connect form
  connectForm: {
    width: '100%',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  connectLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  connectInput: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[400],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  connectButtonDisabled: { opacity: 0.6 },
  connectButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
});
