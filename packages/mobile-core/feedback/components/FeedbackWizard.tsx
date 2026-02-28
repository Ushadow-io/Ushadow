/**
 * FeedbackWizard — Multi-step post-session feedback flow.
 *
 * Step 1: Overall rating (1-5 stars) + mood selector
 * Step 2: Blockers (multi-select common + free text)
 * Step 3: Additional notes + submit
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../core/theme/ThemeProvider';
import type { FeedbackCreate } from '../types/feedback';
import { MOOD_OPTIONS, COMMON_BLOCKERS } from '../types/feedback';

interface FeedbackWizardProps {
  onSubmit: (data: FeedbackCreate) => void;
  onSkip?: () => void;
  isSubmitting?: boolean;
}

export function FeedbackWizard({ onSubmit, onSkip, isSubmitting }: FeedbackWizardProps) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [rating, setRating] = useState(3);
  const [mood, setMood] = useState<string>('ok');
  const [onTime, setOnTime] = useState(false);
  const [selectedBlockers, setSelectedBlockers] = useState<string[]>([]);
  const [blockerDetails, setBlockerDetails] = useState('');
  const [suggestions, setSuggestions] = useState('');

  const toggleBlocker = (blocker: string) => {
    setSelectedBlockers((prev) =>
      prev.includes(blocker) ? prev.filter((b) => b !== blocker) : [...prev, blocker]
    );
  };

  const handleSubmit = () => {
    onSubmit({
      overall_rating: rating,
      on_time: onTime,
      mood,
      blockers: selectedBlockers,
      blocker_details: blockerDetails || undefined,
      suggestions: suggestions || undefined,
    });
  };

  const steps = [
    // Step 0: Rating + Mood
    (
      <View key="rating" style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>How did it go?</Text>

        {/* Star rating */}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Text style={[styles.star, star <= rating && styles.starActive]}>
                {star <= rating ? '\u{2B50}' : '\u{2606}'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mood selector */}
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>How are you feeling?</Text>
        <View style={styles.moodRow}>
          {MOOD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.moodButton,
                { borderColor: theme.colors.border },
                mood === opt.value && { borderColor: theme.colors.primary[400], backgroundColor: theme.colors.primary[400] + '15' },
              ]}
              onPress={() => setMood(opt.value)}
            >
              <Text style={styles.moodEmoji}>{opt.emoji}</Text>
              <Text style={[styles.moodLabel, { color: theme.colors.text }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* On time? */}
        <TouchableOpacity
          style={[styles.toggleRow, { borderColor: theme.colors.border }]}
          onPress={() => setOnTime(!onTime)}
        >
          <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>Did you reach your goal on time?</Text>
          <Text style={styles.toggleValue}>{onTime ? '\u{2705}' : '\u{274C}'}</Text>
        </TouchableOpacity>
      </View>
    ),

    // Step 1: Blockers
    (
      <View key="blockers" style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>What slowed you down?</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>Select all that apply</Text>

        <View style={styles.blockerGrid}>
          {COMMON_BLOCKERS.map((blocker) => (
            <TouchableOpacity
              key={blocker}
              style={[
                styles.blockerChip,
                { borderColor: theme.colors.border },
                selectedBlockers.includes(blocker) && {
                  borderColor: theme.colors.primary[400],
                  backgroundColor: theme.colors.primary[400] + '15',
                },
              ]}
              onPress={() => toggleBlocker(blocker)}
            >
              <Text
                style={[
                  styles.blockerText,
                  { color: selectedBlockers.includes(blocker) ? theme.colors.primary[400] : theme.colors.text },
                ]}
                numberOfLines={1}
              >
                {blocker}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder="Other details..."
          placeholderTextColor={theme.colors.textMuted}
          value={blockerDetails}
          onChangeText={setBlockerDetails}
          multiline
          numberOfLines={3}
        />
      </View>
    ),

    // Step 2: Suggestions + Submit
    (
      <View key="suggestions" style={styles.stepContainer}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Anything else?</Text>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Any ideas for improving your routine?
        </Text>

        <TextInput
          style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
          placeholder="Optional notes or suggestions..."
          placeholderTextColor={theme.colors.textMuted}
          value={suggestions}
          onChangeText={setSuggestions}
          multiline
          numberOfLines={4}
        />
      </View>
    ),
  ];

  const isLastStep = step === steps.length - 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Progress dots */}
      <View style={styles.progressRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              { backgroundColor: i <= step ? theme.colors.primary[400] : theme.colors.border },
            ]}
          />
        ))}
      </View>

      {steps[step]}

      {/* Navigation */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <TouchableOpacity
            style={[styles.navButton, { borderColor: theme.colors.border }]}
            onPress={() => setStep(step - 1)}
          >
            <Text style={[styles.navButtonText, { color: theme.colors.text }]}>Back</Text>
          </TouchableOpacity>
        ) : onSkip ? (
          <TouchableOpacity
            style={[styles.navButton, { borderColor: theme.colors.border }]}
            onPress={onSkip}
          >
            <Text style={[styles.navButtonText, { color: theme.colors.textMuted }]}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.primary[400] }]}
          onPress={isLastStep ? handleSubmit : () => setStep(step + 1)}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Submitting...' : isLastStep ? 'Submit' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepContainer: {
    minHeight: 300,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginTop: 20,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  star: {
    fontSize: 36,
  },
  starActive: {},
  moodRow: {
    flexDirection: 'row',
    gap: 10,
  },
  moodButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 16,
    borderTopWidth: 1,
  },
  toggleLabel: {
    fontSize: 15,
  },
  toggleValue: {
    fontSize: 20,
  },
  blockerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  blockerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  blockerText: {
    fontSize: 13,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  navButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
