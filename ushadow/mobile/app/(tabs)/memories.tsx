/**
 * Memories Tab - Ushadow Mobile
 *
 * Displays extracted memories from the Chronicle backend.
 * Supports search and shows memory content with metadata.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { searchMemories, fetchMemories, Memory } from '../services/chronicleApi';
import { isAuthenticated } from '../utils/authStorage';

export default function MemoriesScreen() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMemories = useCallback(async (query?: string, showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }
      if (query) {
        setIsSearching(true);
      }
      setError(null);

      const loggedIn = await isAuthenticated();
      setIsLoggedIn(loggedIn);

      if (!loggedIn) {
        setMemories([]);
        return;
      }

      const response = query
        ? await searchMemories(query, 100)
        : await fetchMemories(100);

      setMemories(response.memories);
      console.log(`[Memories] Loaded ${response.memories.length} memories`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load memories';
      setError(message);
      console.error('[Memories] Error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleRefresh = useCallback(() => {
    loadMemories(searchQuery || undefined, true);
  }, [loadMemories, searchQuery]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      loadMemories(searchQuery.trim());
    } else {
      loadMemories();
    }
  }, [loadMemories, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    loadMemories();
  }, [loadMemories]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRelevanceColor = (score?: number) => {
    if (!score) return theme.textMuted;
    if (score >= 0.8) return colors.success.default;
    if (score >= 0.6) return colors.primary[400];
    if (score >= 0.4) return colors.warning.default;
    return theme.textMuted;
  };

  const renderMemory = ({ item }: { item: Memory }) => (
    <View style={styles.memoryCard} testID={`memory-${item.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="bulb" size={16} color={colors.primary[400]} />
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
        {item.score !== undefined && (
          <View style={styles.scoreContainer}>
            <Text style={[styles.scoreText, { color: getRelevanceColor(item.score) }]}>
              {Math.round(item.score * 100)}%
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.memoryContent}>{item.content}</Text>

      {item.source && (
        <View style={styles.sourceContainer}>
          <Ionicons name="link-outline" size={12} color={theme.textMuted} />
          <Text style={styles.sourceText}>{item.source}</Text>
        </View>
      )}

      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <View style={styles.metadataContainer}>
          {Object.entries(item.metadata).slice(0, 3).map(([key, value]) => (
            <View key={key} style={styles.metadataTag}>
              <Text style={styles.metadataTagText}>
                {key}: {String(value).slice(0, 20)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {!isLoggedIn ? (
        <>
          <Ionicons name="log-in-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptySubtitle}>
            Log in from the Home tab to view your memories
          </Text>
        </>
      ) : searchQuery ? (
        <>
          <Ionicons name="search-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptySubtitle}>
            Try a different search query
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="bulb-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No Memories Yet</Text>
          <Text style={styles.emptySubtitle}>
            Memories are extracted from your conversations automatically
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="memories-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memories</Text>
        <Text style={styles.headerSubtitle}>
          {memories.length > 0
            ? `${memories.length} memor${memories.length !== 1 ? 'ies' : 'y'}`
            : 'AI-extracted insights'}
        </Text>
      </View>

      {/* Search Bar */}
      {isLoggedIn && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={theme.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search memories..."
              placeholderTextColor={theme.textMuted}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              testID="memories-search-input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} testID="clear-search-button">
                <Ionicons name="close-circle" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching}
            testID="search-button"
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={theme.primaryButtonText} />
            ) : (
              <Ionicons name="search" size={20} color={theme.primaryButtonText} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading memories...</Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          renderItem={renderMemory}
          keyExtractor={(item, index) => item.id || `memory-${index}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary[400]}
              colors={[colors.primary[400]]}
            />
          }
          testID="memories-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
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
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
  },
  searchButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary[400],
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  memoryCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardDate: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  scoreContainer: {
    backgroundColor: theme.backgroundInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  scoreText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  memoryContent: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    lineHeight: 22,
  },
  sourceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  sourceText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  metadataContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  metadataTag: {
    backgroundColor: theme.backgroundInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  metadataTagText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
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
});
