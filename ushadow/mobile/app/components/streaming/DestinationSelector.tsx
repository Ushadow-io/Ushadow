/**
 * DestinationSelector Component
 *
 * Card-based selector for choosing streaming destination (UNode).
 * Shows UNode details, authentication status, and available audio destinations.
 * Tapping navigates to the UNode details page.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';
import { UNode } from '../../_utils/unodeStorage';
import { AudioDestination } from '../../services/audioProviderApi';

export type AuthStatus = 'unknown' | 'checking' | 'authenticated' | 'expired' | 'error';

interface DestinationSelectorProps {
  selectedUNodeId: string | null;
  unodes: UNode[];
  authStatus: AuthStatus;
  authError?: string | null;
  onReauthenticate?: () => void;
  disabled?: boolean;
  testID?: string;
  // Audio destinations
  availableDestinations?: AudioDestination[];
  selectedDestinationIds?: string[];
  onDestinationSelectionChange?: (ids: string[]) => void;
  isLoadingDestinations?: boolean;
}

export const DestinationSelector: React.FC<DestinationSelectorProps> = ({
  selectedUNodeId,
  unodes,
  authStatus,
  authError,
  onReauthenticate,
  disabled = false,
  testID = 'destination-selector',
  availableDestinations = [],
  selectedDestinationIds = [],
  onDestinationSelectionChange,
  isLoadingDestinations = false,
}) => {
  const router = useRouter();
  const selectedUNode = unodes.find(u => u.id === selectedUNodeId);
  const hasNoUnodes = unodes.length === 0;

  // Auto-select all destinations initially if none selected
  useEffect(() => {
    if (availableDestinations.length > 0 && selectedDestinationIds.length === 0 && onDestinationSelectionChange) {
      onDestinationSelectionChange(availableDestinations.map(d => d.instance_id));
    }
  }, [availableDestinations.length, selectedDestinationIds.length]);

  const handleCardPress = () => {
    if (!disabled) {
      router.push('/unode-details');
    }
  };

  const formatLastConnected = (dateStr?: string): string => {
    if (!dateStr) return 'Never connected';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getAuthStatusIcon = (): { name: string; color: string } => {
    switch (authStatus) {
      case 'authenticated':
        return { name: 'checkmark-circle', color: colors.success.default };
      case 'expired':
      case 'error':
        return { name: 'alert-circle', color: colors.error.default };
      case 'checking':
        return { name: 'sync', color: colors.warning.default };
      default:
        return { name: 'help-circle-outline', color: theme.textMuted };
    }
  };

  const getAuthStatusText = (): string => {
    switch (authStatus) {
      case 'authenticated':
        return 'Authenticated';
      case 'expired':
        return 'Session expired';
      case 'error':
        return authError || 'Auth error';
      case 'checking':
        return 'Verifying...';
      default:
        return 'Not verified';
    }
  };

  // Audio destination helpers
  const handleToggleDestination = (destinationId: string) => {
    if (!onDestinationSelectionChange) return;

    const isCurrentlySelected = selectedDestinationIds.includes(destinationId);
    const isLastSelected = isCurrentlySelected && selectedDestinationIds.length === 1;

    console.log('[DestinationSelector] Toggle destination:', {
      destinationId,
      isCurrentlySelected,
      isLastSelected,
      currentCount: selectedDestinationIds.length,
    });

    if (isCurrentlySelected) {
      // Prevent deselecting if it's the last one
      if (!isLastSelected) {
        onDestinationSelectionChange(selectedDestinationIds.filter(id => id !== destinationId));
      } else {
        console.log('[DestinationSelector] Cannot deselect last destination');
      }
    } else {
      onDestinationSelectionChange([...selectedDestinationIds, destinationId]);
    }
  };

  const renderDestinationIcon = (type: string): string => {
    if (type.toLowerCase().includes('chronicle')) return 'book-outline';
    if (type.toLowerCase().includes('mycelia')) return 'git-network-outline';
    return 'radio-outline';
  };

  const selectedDestCount = selectedDestinationIds.length;
  const totalDestCount = availableDestinations.length;
  const showDestinations = authStatus === 'authenticated' && selectedUNode;

  // Render selected UNode card content
  const renderSelectedCard = () => {
    if (!selectedUNode) {
      return (
        <View style={styles.cardContent}>
          <View style={[styles.cardIconContainer, styles.cardIconEmpty]}>
            <Ionicons name="server-outline" size={24} color={theme.textMuted} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitleEmpty}>Select Destination</Text>
            <Text style={styles.cardSubtitle}>Choose a UNode to stream to</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </View>
      );
    }

    const authIcon = getAuthStatusIcon();

    return (
      <>
        <View style={styles.cardContent}>
          <View style={styles.cardIconContainer}>
            <Ionicons name="server" size={24} color={colors.primary[400]} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>{selectedUNode.name}</Text>
            <View style={styles.cardStatusRow}>
              {/* Auth status */}
              <View style={styles.authBadge}>
                {authStatus === 'checking' ? (
                  <ActivityIndicator size="small" color={colors.warning.default} />
                ) : (
                  <Ionicons name={authIcon.name as any} size={14} color={authIcon.color} />
                )}
                <Text style={[styles.authText, { color: authIcon.color }]}>
                  {getAuthStatusText()}
                </Text>
              </View>

              {/* Last connected */}
              <Text style={styles.lastConnected}>
                {formatLastConnected(selectedUNode.lastConnectedAt)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </View>

        {/* Audio Destinations Pills - inside card */}
        {showDestinations && (
          <View style={styles.cardDestinationsSection}>
            {isLoadingDestinations ? (
              <View style={styles.destinationsLoading}>
                <ActivityIndicator size="small" color={theme.textMuted} />
                <Text style={styles.destinationsLoadingText}>Discovering...</Text>
              </View>
            ) : totalDestCount === 0 ? (
              <View style={styles.destinationsEmpty}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.warning.default} />
                <Text style={styles.destinationsEmptyText}>No services</Text>
              </View>
            ) : (
              <View style={styles.destinationsPills}>
                {availableDestinations.map((destination) => {
                  const isSelected = selectedDestinationIds.includes(destination.instance_id);
                  const isLastSelected = isSelected && selectedDestCount === 1;

                  return (
                    <TouchableOpacity
                      key={destination.instance_id}
                      style={[
                        styles.destinationPill,
                        isSelected && styles.destinationPillSelected,
                        (disabled || isLastSelected) && styles.destinationPillDisabled,
                      ]}
                      onPress={() => handleToggleDestination(destination.instance_id)}
                      disabled={disabled || isLastSelected}
                      activeOpacity={0.7}
                      testID={`${testID}-destination-${destination.instance_id}`}
                    >
                      <Ionicons
                        name={renderDestinationIcon(destination.type) as any}
                        size={14}
                        color={isSelected ? colors.primary[400] : theme.textMuted}
                      />
                      <Text style={[
                        styles.destinationPillText,
                        isSelected && styles.destinationPillTextSelected,
                      ]}>
                        {destination.instance_name}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.primary[400]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.label}>Destination</Text>

      {/* Selected UNode Card */}
      <TouchableOpacity
        style={[
          styles.card,
          disabled && styles.cardDisabled,
          !selectedUNode && styles.cardEmpty,
        ]}
        onPress={handleCardPress}
        disabled={disabled}
        activeOpacity={0.7}
        testID={`${testID}-card`}
      >
        {renderSelectedCard()}
      </TouchableOpacity>

      {/* Auth error banner */}
      {selectedUNode && (authStatus === 'expired' || authStatus === 'error') && (
        <TouchableOpacity
          style={styles.authErrorBanner}
          onPress={onReauthenticate}
          testID={`${testID}-reauth`}
        >
          <Ionicons name="warning" size={16} color={colors.error.default} />
          <Text style={styles.authErrorText}>
            {authStatus === 'expired' ? 'Session expired. ' : 'Authentication failed. '}
            <Text style={styles.authErrorLink}>Sign in again</Text>
          </Text>
        </TouchableOpacity>
      )}

      {/* Empty state hint */}
      {hasNoUnodes && !disabled && (
        <TouchableOpacity
          style={styles.emptyHint}
          onPress={handleCardPress}
          testID={`${testID}-empty-add`}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
          <Text style={styles.emptyHintText}>
            Tap to add a UNode
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardEmpty: {
    borderStyle: 'dashed',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardIconEmpty: {
    backgroundColor: theme.backgroundInput,
  },
  cardDetails: {
    flex: 1,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  cardTitleEmpty: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: theme.textMuted,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  authText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  lastConnected: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  authErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.error.bg,
    borderRadius: borderRadius.md,
  },
  authErrorText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    flex: 1,
  },
  authErrorLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  emptyHintText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  // Audio destinations styles - inside card
  cardDestinationsSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderWeak,
  },
  destinationsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  destinationsLoadingText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  destinationsEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  destinationsEmptyText: {
    fontSize: fontSize.xs,
    color: colors.warning.default,
  },
  destinationsPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  destinationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: theme.border,
  },
  destinationPillSelected: {
    backgroundColor: `${colors.primary[400]}15`,
    borderColor: colors.primary[400],
  },
  destinationPillDisabled: {
    opacity: 0.5,
  },
  destinationPillText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  destinationPillTextSelected: {
    color: colors.primary[400],
    fontWeight: '600',
  },
});

export default DestinationSelector;
