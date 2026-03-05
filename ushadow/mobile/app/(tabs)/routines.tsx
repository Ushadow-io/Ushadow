/**
 * Routines Tab — Ushadow Mobile
 *
 * Lists user routines, allows creating new ones, and viewing session timelines.
 * Uses shared components from @ushadow/mobile-core.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRoutines, RoutineCard } from '../../../../packages/mobile-core/routine';
import { useTimeline, TimelineView, DurationBar } from '../../../../packages/mobile-core/timeline';
import type { Routine, RoutineCreate, RoutineSession, GoalType } from '../../../../packages/mobile-core/routine';
import { getAuthToken, getApiUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';

function useApiConfig() {
  const getToken = useCallback(async () => getAuthToken(), []);
  const [baseUrl, setBaseUrl] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const unode = await getActiveUnode();
        const url = unode?.apiUrl || (await getApiUrl()) || '';
        setBaseUrl(url);
      })();
    }, [])
  );

  return { baseUrl, getToken };
}

// ── Goal type selector ──────────────────────────────────────────────────

const GOAL_TYPES: { value: GoalType; label: string; icon: string }[] = [
  { value: 'time', label: 'Time', icon: '\u{23F0}' },
  { value: 'location', label: 'Location', icon: '\u{1F4CD}' },
  { value: 'activity', label: 'Activity', icon: '\u{2705}' },
];

// ── Create Routine Modal ────────────────────────────────────────────────

interface CreateRoutineModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: RoutineCreate) => Promise<Routine | null>;
}

function CreateRoutineModal({ visible, onClose, onCreate }: CreateRoutineModalProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('activity');
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
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (result) {
      setName('');
      setGoal('');
      setGoalType('activity');
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
              {GOAL_TYPES.map((gt) => (
                <TouchableOpacity
                  key={gt.value}
                  style={[
                    styles.goalTypeBtn,
                    goalType === gt.value && styles.goalTypeBtnActive,
                  ]}
                  onPress={() => setGoalType(gt.value)}
                >
                  <Text style={styles.goalTypeIcon}>{gt.icon}</Text>
                  <Text
                    style={[
                      styles.goalTypeLabel,
                      goalType === gt.value && styles.goalTypeLabelActive,
                    ]}
                  >
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

// ── Session Detail View ─────────────────────────────────────────────────

interface SessionDetailProps {
  session: RoutineSession;
  routineName: string;
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
}

function SessionDetail({ session, routineName, baseUrl, getToken, onBack }: SessionDetailProps) {
  const { timeline, isLoading, error, fetchTimeline } = useTimeline({ baseUrl, getToken });

  useFocusEffect(
    useCallback(() => {
      fetchTimeline(session.session_id);
    }, [session.session_id, fetchTimeline])
  );

  const startedAt = new Date(session.started_at);
  const endedAt = session.ended_at ? new Date(session.ended_at) : null;
  const durationMins = endedAt
    ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
    : null;

  return (
    <View style={styles.sessionDetail}>
      <View style={styles.sessionDetailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary[400]} />
        </TouchableOpacity>
        <View style={styles.sessionDetailHeaderText}>
          <Text style={styles.sessionDetailTitle} numberOfLines={1}>
            {routineName}
          </Text>
          <Text style={styles.sessionDetailDate}>
            {startedAt.toLocaleDateString()} {startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {durationMins != null ? ` \u{2022} ${durationMins}m` : ''}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: session.goal_reached
                ? colors.success.bg
                : session.status === 'complete'
                ? colors.warning.bg
                : colors.info.bg,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: session.goal_reached
                  ? colors.success.default
                  : session.status === 'complete'
                  ? colors.warning.default
                  : colors.info.default,
              },
            ]}
          >
            {session.goal_reached ? 'Goal reached' : session.status}
          </Text>
        </View>
      </View>

      {/* Duration bar */}
      {timeline && timeline.events.length > 0 && (
        <View style={styles.durationBarContainer}>
          <DurationBar events={timeline.events} height={20} />
        </View>
      )}

      {/* Timeline */}
      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <TimelineView
          events={timeline?.events || []}
          isLoading={isLoading}
          emptyMessage="No timeline extracted for this session yet."
        />
      )}
    </View>
  );
}

// ── Routine Detail View ─────────────────────────────────────────────────

interface RoutineDetailProps {
  routine: Routine;
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onStartSession: (routineId: string) => void;
}

function RoutineDetail({ routine, baseUrl, getToken, onBack, onStartSession }: RoutineDetailProps) {
  const { listSessions } = useRoutines({ baseUrl, getToken });
  const [sessions, setSessions] = useState<RoutineSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState<RoutineSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoadingSessions(true);
        const result = await listSessions(routine.routine_id);
        setSessions(result);
        setLoadingSessions(false);
      })();
    }, [routine.routine_id, listSessions])
  );

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        routineName={routine.name}
        baseUrl={baseUrl}
        getToken={getToken}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <View style={styles.routineDetail}>
      <View style={styles.routineDetailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary[400]} />
        </TouchableOpacity>
        <View style={styles.routineDetailHeaderText}>
          <Text style={styles.routineDetailTitle} numberOfLines={1}>{routine.name}</Text>
          <Text style={styles.routineDetailGoal} numberOfLines={1}>{routine.goal}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.startSessionBtn}
        onPress={() => onStartSession(routine.routine_id)}
      >
        <Ionicons name="mic" size={20} color={theme.background} />
        <Text style={styles.startSessionText}>Start Recording</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>
        Sessions ({sessions.length})
      </Text>

      {loadingSessions ? (
        <ActivityIndicator color={colors.primary[400]} style={{ marginTop: 24 }} />
      ) : sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>No sessions recorded yet</Text>
          <Text style={styles.emptySubtext}>Tap "Start Recording" to begin</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.session_id}
          renderItem={({ item }) => {
            const started = new Date(item.started_at);
            const ended = item.ended_at ? new Date(item.ended_at) : null;
            const mins = ended
              ? Math.round((ended.getTime() - started.getTime()) / 60000)
              : null;
            return (
              <TouchableOpacity
                style={styles.sessionItem}
                onPress={() => setSelectedSession(item)}
              >
                <View style={styles.sessionItemLeft}>
                  <Text style={styles.sessionDate}>
                    {started.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.sessionTime}>
                    {started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {mins != null ? ` \u{2022} ${mins}m` : ''}
                  </Text>
                </View>
                <View style={styles.sessionItemRight}>
                  {item.goal_reached && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success.default} />
                  )}
                  <Text style={styles.sessionStatus}>{item.status}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

// ── Main Routines Tab ───────────────────────────────────────────────────

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
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (baseUrl) {
        fetchRoutines();
      }
    }, [baseUrl, fetchRoutines])
  );

  const handleStartSession = useCallback(
    async (routineId: string) => {
      const session = await startSession(routineId);
      if (session) {
        Alert.alert('Recording Started', 'Your routine session is now recording.');
      }
    },
    [startSession]
  );

  // ── Detail view ────────────────────────────────────────────────────
  if (selectedRoutine) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <RoutineDetail
          routine={selectedRoutine}
          baseUrl={baseUrl}
          getToken={getToken}
          onBack={() => {
            setSelectedRoutine(null);
            if (baseUrl) fetchRoutines();
          }}
          onStartSession={handleStartSession}
        />
      </SafeAreaView>
    );
  }

  // ── List view ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <View style={styles.header}>
        <Text style={styles.title}>Routines</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowCreate(true)}
        >
          <Ionicons name="add" size={24} color={theme.background} />
        </TouchableOpacity>
      </View>

      {!baseUrl ? (
        <View style={styles.emptyState}>
          <Ionicons name="server-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>Not connected</Text>
          <Text style={styles.emptySubtext}>Sign in on the Home tab first</Text>
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
          <Ionicons name="timer-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>No routines yet</Text>
          <Text style={styles.emptySubtext}>Create one to start tracking</Text>
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
          keyExtractor={(r) => r.routine_id}
          renderItem={({ item }) => (
            <RoutineCard
              routine={item}
              onPress={(r) => setSelectedRoutine(r)}
              onRecord={(r) => handleStartSession(r.routine_id)}
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

// ═════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.text.primary,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
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
  retryText: {
    color: theme.background,
    fontWeight: '600',
  },

  // ── Modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
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
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
  },
  form: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: fontSize.base,
    borderWidth: 1,
    borderColor: theme.border,
  },
  goalTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
  goalTypeIcon: {
    fontSize: 16,
  },
  goalTypeLabel: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  goalTypeLabelActive: {
    color: colors.primary[400],
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: colors.primary[400],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: theme.background,
    fontSize: fontSize.base,
    fontWeight: '700',
  },

  // ── Routine Detail ────────────────────────────────────────────────
  routineDetail: {
    flex: 1,
  },
  routineDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  routineDetailHeaderText: {
    flex: 1,
  },
  routineDetailTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text.primary,
  },
  routineDetailGoal: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  startSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  startSessionText: {
    color: theme.background,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text.secondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  // ── Session Items ─────────────────────────────────────────────────
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.backgroundCard,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sessionItemLeft: {
    flex: 1,
  },
  sessionDate: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
  },
  sessionTime: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  sessionItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionStatus: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textTransform: 'capitalize',
  },

  // ── Session Detail ────────────────────────────────────────────────
  sessionDetail: {
    flex: 1,
  },
  sessionDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sessionDetailHeaderText: {
    flex: 1,
  },
  sessionDetailTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sessionDetailDate: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  durationBarContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
