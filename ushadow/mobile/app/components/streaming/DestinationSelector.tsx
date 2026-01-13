/**
 * DestinationSelector Component
 *
 * Card-based selector for choosing streaming destination (UNode).
 * Shows UNode details and authentication status at a glance.
 * Tapping navigates to the UNode details page.
 */

import React from 'react';
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
import { UNode } from '../../utils/unodeStorage';

export type AuthStatus = 'unknown' | 'checking' | 'authenticated' | 'expired' | 'error';

interface DestinationSelectorProps {
  selectedUNodeId: string | null;
  unodes: UNode[];
  authStatus: AuthStatus;
  authError?: string | null;
  onReauthenticate?: () => void;
  onClearSelection?: () => void;
  disabled?: boolean;
  testID?: string;
}

export const DestinationSelector: React.FC<DestinationSelectorProps> = ({
  selectedUNodeId,
  unodes,
  authStatus,
  authError,
  onReauthenticate,
  onClearSelection,
  disabled = false,
  testID = 'destination-selector',
}) => {
  const router = useRouter();
  const selectedUNode = unodes.find(u => u.id === selectedUNodeId);
  const hasNoUnodes = unodes.length === 0;

  const handleCardPress = () => {
    if (!disabled) {
      router.push('/unode-details');
    }
  };

  const handleClearSelection = () => {
    if (!disabled && onClearSelection) {
      onClearSelection();
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
        {/* Clear button */}
        {onClearSelection && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearSelection}
            disabled={disabled}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`${testID}-clear`}
          >
            <Ionicons name="close-circle" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
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
  clearButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
});

export default DestinationSelector;
