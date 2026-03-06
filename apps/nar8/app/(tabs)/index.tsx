/**
 * nar8 Routines Tab (Home)
 *
 * Lists user routines with quick-record buttons.
 * Uses shared RoutineCard component from mobile-core.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRoutines, RoutineCard } from '../../../../packages/mobile-core/routine';
import type { Routine, RoutineCreate, GoalType } from '../../../../packages/mobile-core/routine';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';

// Placeholder API config — will be wired to auth when available
function useApiConfig() {
  const [baseUrl] = useState('');
  const getToken = useCallback(async () => null as string | null, []);
  return { baseUrl, getToken };
}

const GOAL_TYPES: { value: GoalType; label: string; icon: string }[] = [
  { value: 'time', label: 'Time', icon: '\u{23F0}' },
  { value: 'location', label: 'Location', icon: '\u{1F4CD}' },
  { value: 'activity', label: 'Activity', icon: '\u{2705}' },
];

interface CreateRoutineModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: RoutineCreate) => Promise<Routine | null>;
}

function CreateRoutineModal({ visible, onClose, onCreate }: CreateRoutineModalProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('time');
  const [goalTime, setGoalTime] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !goal.trim()) {
      Alert.alert('Required', 'Name and goal are required.');
      return;
    }
    setSaving(true);
    const result = await onCreate({
      name: name.trim(),
      goal: goal.trim(),
      goal_type: goalType,
      goal_time: goalTime.trim() || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (result) {
      setName('');
      setGoal('');
      setGoalType('time');
      setGoalTime('');
      setTags('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Routine</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Morning Routine"
              placeholderTextColor={colors.text.muted}
              autoFocus
            />

            <Text style={styles.label}>Goal</Text>
            <TextInput
              style={styles.input}
              value={goal}
              onChangeText={setGoal}
              placeholder="e.g. Leave for work by 8:30"
              placeholderTextColor={colors.text.muted}
            />

            <Text style={styles.label}>Goal Type</Text>
            <View style={styles.goalTypeRow}>
              {GOAL_TYPES.map(gt => (
                <TouchableOpacity
                  key={gt.value}
                  style={[styles.goalTypeBtn, goalType === gt.value && styles.goalTypeBtnActive]}
                  onPress={() => setGoalType(gt.value)}
                >
                  <Text style={styles.goalTypeIcon}>{gt.icon}</Text>
                  <Text style={[styles.goalTypeLabel, goalType === gt.value && styles.goalTypeLabelActive]}>
                    {gt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {goalType === 'time' && (
              <>
                <Text style={styles.label}>Target Time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={goalTime}
                  onChangeText={setGoalTime}
                  placeholder="08:30"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numbers-and-punctuation"
                />
              </>
            )}

            <Text style={styles.label}>Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder="morning, weekday"
              placeholderTextColor={colors.text.muted}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.createBtn, saving && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.background} size="small" />
            ) : (
              <Text style={styles.createBtnText}>Create Routine</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function RoutinesTab() {
  const { baseUrl, getToken } = useApiConfig();
  const {
    routines,
    isLoading,
    error,
    fetchRoutines,
    createRoutine,
    startSession,
  } = useRoutines({ baseUrl, getToken });

  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      if (baseUrl) fetchRoutines();
    }, [baseUrl, fetchRoutines])
  );

  const handleStartSession = useCallback(
    async (routineId: string) => {
      const session = await startSession(routineId);
      if (session) {
        // Navigate to active tab when recording starts
        router.push('/active');
      }
    },
    [startSession, router]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>nar8</Text>
          <Text style={styles.subtitle}>Your routines, optimised</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color={theme.background} />
        </TouchableOpacity>
      </View>

      {!baseUrl ? (
        <View style={styles.emptyState}>
          <Ionicons name="person-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>Sign in to get started</Text>
          <Text style={styles.emptySubtext}>Connect to your server to manage routines</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchRoutines()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading && routines.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[400]} size="large" />
        </View>
      ) : routines.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="timer-outline" size={64} color={colors.primary[400]} style={{ opacity: 0.5 }} />
          <Text style={styles.emptyText}>No routines yet</Text>
          <Text style={styles.emptySubtext}>Create your first routine to start tracking</Text>
          <TouchableOpacity
            style={[styles.addBtn, { marginTop: spacing.lg }]}
            onPress={() => setShowCreate(true)}
          >
            <Ionicons name="add" size={24} color={theme.background} />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={routines}
          keyExtractor={r => r.routine_id}
          renderItem={({ item }) => (
            <RoutineCard
              routine={item}
              onPress={() => {/* TODO: navigate to routine detail */}}
              onRecord={r => handleStartSession(r.routine_id)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={() => fetchRoutines()}
        />
      )}

      <CreateRoutineModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createRoutine}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.primary[400],
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: 2,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 24,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyText: {
    fontSize: fontSize.lg,
    color: colors.text.secondary,
    marginTop: spacing.md,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[400],
    borderRadius: borderRadius.md,
  },
  retryText: { color: theme.background, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    backgroundColor: theme.backgroundCard,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text.primary },
  form: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, color: colors.text.secondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
    borderWidth: 1,
    borderColor: theme.border,
  },
  goalTypeRow: { flexDirection: 'row', gap: spacing.sm },
  goalTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
  },
  goalTypeBtnActive: {
    borderColor: colors.primary[400],
    backgroundColor: colors.primary[400] + '15',
  },
  goalTypeIcon: { fontSize: 16 },
  goalTypeLabel: { fontSize: fontSize.sm, color: colors.text.secondary },
  goalTypeLabelActive: { color: colors.primary[400], fontWeight: '600' },
  createBtn: {
    backgroundColor: colors.primary[400],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { color: theme.background, fontSize: fontSize.base, fontWeight: '700' },
});
