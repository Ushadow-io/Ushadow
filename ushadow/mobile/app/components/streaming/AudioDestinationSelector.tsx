/**
 * AudioDestinationSelector Component
 *
 * Allows users to select which audio destinations (Chronicle, Mycelia, etc.)
 * to stream to from discovered services.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';
import { AudioDestination } from '../../services/audioProviderApi';

interface AudioDestinationSelectorProps {
  destinations: AudioDestination[];
  selectedDestinationIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export const AudioDestinationSelector: React.FC<AudioDestinationSelectorProps> = ({
  destinations,
  selectedDestinationIds,
  onSelectionChange,
  isLoading = false,
  disabled = false,
  testID = 'audio-destination-selector',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-select all destinations initially if none selected
  useEffect(() => {
    if (destinations.length > 0 && selectedDestinationIds.length === 0) {
      onSelectionChange(destinations.map(d => d.instance_id));
    }
  }, [destinations, selectedDestinationIds.length]);

  const handleToggleDestination = (destinationId: string) => {
    if (selectedDestinationIds.includes(destinationId)) {
      // Prevent deselecting if it's the last one
      if (selectedDestinationIds.length > 1) {
        onSelectionChange(selectedDestinationIds.filter(id => id !== destinationId));
      }
    } else {
      onSelectionChange([...selectedDestinationIds, destinationId]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(destinations.map(d => d.instance_id));
  };

  const handleSelectNone = () => {
    // Keep at least one selected
    if (destinations.length > 0) {
      onSelectionChange([destinations[0].instance_id]);
    }
  };

  const selectedCount = selectedDestinationIds.length;
  const totalCount = destinations.length;

  const renderDestinationIcon = (type: string): string => {
    if (type.toLowerCase().includes('chronicle')) return 'book-outline';
    if (type.toLowerCase().includes('mycelia')) return 'git-network-outline';
    return 'radio-outline';
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>Stream Destinations</Text>
        {!isLoading && totalCount > 0 && (
          <Text style={styles.badge}>
            {selectedCount} of {totalCount}
          </Text>
        )}
      </View>

      {/* Collapsed Summary */}
      <TouchableOpacity
        style={[
          styles.summaryCard,
          disabled && styles.summaryCardDisabled,
          isExpanded && styles.summaryCardExpanded,
        ]}
        onPress={() => !disabled && setIsExpanded(!isExpanded)}
        disabled={disabled || isLoading}
        testID={`${testID}-toggle`}
      >
        <View style={styles.summaryContent}>
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={theme.textMuted} />
              <Text style={styles.summaryText}>Discovering destinations...</Text>
            </>
          ) : totalCount === 0 ? (
            <>
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning.default} />
              <Text style={styles.summaryTextEmpty}>No destinations found</Text>
            </>
          ) : selectedCount === totalCount ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color={colors.success.default} />
              <Text style={styles.summaryText}>All destinations ({totalCount})</Text>
            </>
          ) : (
            <>
              <Ionicons name="radio-button-on-outline" size={20} color={colors.primary[400]} />
              <Text style={styles.summaryText}>
                {selectedCount} destination{selectedCount !== 1 ? 's' : ''}
              </Text>
            </>
          )}
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.textMuted}
        />
      </TouchableOpacity>

      {/* Expanded Destination List */}
      {isExpanded && !isLoading && totalCount > 0 && (
        <View style={styles.expandedView} testID={`${testID}-expanded`}>
          {/* Quick Actions */}
          {totalCount > 1 && (
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={handleSelectAll}
                disabled={selectedCount === totalCount}
                testID={`${testID}-select-all`}
              >
                <Text style={styles.quickActionText}>Select All</Text>
              </TouchableOpacity>
              <View style={styles.quickActionDivider} />
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={handleSelectNone}
                disabled={selectedCount === 1}
                testID={`${testID}-select-none`}
              >
                <Text style={styles.quickActionText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Destination Checkboxes */}
          <ScrollView style={styles.destinationList} nestedScrollEnabled>
            {destinations.map((destination) => {
              const isSelected = selectedDestinationIds.includes(destination.instance_id);
              const isLastSelected = isSelected && selectedCount === 1;

              return (
                <TouchableOpacity
                  key={destination.instance_id}
                  style={[
                    styles.destinationItem,
                    isSelected && styles.destinationItemSelected,
                  ]}
                  onPress={() => handleToggleDestination(destination.instance_id)}
                  disabled={disabled || isLastSelected}
                  activeOpacity={0.7}
                  testID={`${testID}-item-${destination.instance_id}`}
                >
                  <View style={styles.destinationCheckbox}>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={isSelected ? colors.primary[400] : theme.borderStrong}
                    />
                  </View>

                  <View style={styles.destinationIcon}>
                    <Ionicons
                      name={renderDestinationIcon(destination.type) as any}
                      size={20}
                      color={isSelected ? colors.primary[400] : theme.textMuted}
                    />
                  </View>

                  <View style={styles.destinationInfo}>
                    <Text style={[
                      styles.destinationName,
                      isSelected && styles.destinationNameSelected,
                    ]}>
                      {destination.instance_name}
                    </Text>
                    <Text style={styles.destinationType}>{destination.type}</Text>
                  </View>

                  {destination.status === 'running' && (
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>Running</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Info Footer */}
          <View style={styles.infoFooter}>
            <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
            <Text style={styles.infoText}>
              {selectedCount === totalCount
                ? 'Audio will be sent to all destinations simultaneously'
                : `Audio will be sent to ${selectedCount} destination${selectedCount !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    backgroundColor: theme.backgroundInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  summaryCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  summaryCardDisabled: {
    opacity: 0.5,
  },
  summaryCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  summaryText: {
    fontSize: fontSize.base,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  summaryTextEmpty: {
    fontSize: fontSize.base,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  expandedView: {
    backgroundColor: theme.backgroundCard,
    borderWidth: 1,
    borderColor: theme.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    paddingBottom: spacing.md,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  quickActionText: {
    fontSize: fontSize.sm,
    color: colors.primary[400],
    fontWeight: '500',
  },
  quickActionDivider: {
    width: 1,
    backgroundColor: theme.border,
    marginHorizontal: spacing.sm,
  },
  destinationList: {
    maxHeight: 240,
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderWeak,
  },
  destinationItemSelected: {
    backgroundColor: `${colors.primary[400]}08`,
  },
  destinationCheckbox: {
    marginRight: spacing.sm,
  },
  destinationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationName: {
    fontSize: fontSize.base,
    color: theme.textPrimary,
    fontWeight: '500',
    marginBottom: 2,
  },
  destinationNameSelected: {
    color: colors.primary[400],
  },
  destinationType: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.success.bg,
    borderRadius: borderRadius.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success.default,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.success.default,
    fontWeight: '500',
  },
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: theme.textMuted,
    lineHeight: 16,
  },
});

export default AudioDestinationSelector;
