import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Api from '../Api';

function moodHint(score) {
  if (!Number.isFinite(score)) return 'No mood check-ins logged yet.';
  if (score <= 5) return 'Trending low';
  if (score <= 10) return 'Steady';
  return 'Trending positive';
}

function formatWhen(value) {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) return 'Unknown time';
  return new Date(ts).toLocaleString();
}

export default function MoodTrackerCard({ childId, latestEntry, editable = false, onRecorded }) {
  const [history, setHistory] = React.useState(Array.isArray(latestEntry) ? latestEntry : []);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selectedScore, setSelectedScore] = React.useState(null);
  const [note, setNote] = React.useState('');

  const load = React.useCallback(async () => {
    if (!childId) {
      setHistory([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await Api.getMoodHistory(childId, 30);
      setHistory(Array.isArray(result?.items) ? result.items : []);
    } catch (e) {
      setError(String(e?.message || e || 'Could not load mood history.'));
    } finally {
      setLoading(false);
    }
  }, [childId]);

  React.useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const latest = React.useMemo(() => {
    if (Array.isArray(history) && history.length) return history[0];
    return latestEntry && typeof latestEntry === 'object' ? latestEntry : null;
  }, [history, latestEntry]);

  const save = React.useCallback(async () => {
    if (!editable || !childId) return;
    if (!Number.isInteger(selectedScore)) {
      Alert.alert('Select a score', 'Choose a mood score between 1 and 15.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await Api.saveMoodEntry(childId, { score: selectedScore, note: note.trim() });
      setNote('');
      await load();
      if (typeof onRecorded === 'function') onRecorded(result?.item || null);
      Alert.alert('Mood logged', 'The mood check-in has been saved.');
    } catch (e) {
      setError(String(e?.message || e || 'Could not save mood entry.'));
    } finally {
      setSaving(false);
    }
  }, [childId, editable, load, note, onRecorded, selectedScore]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Mood Tracking</Text>
      <Text style={styles.subtitle}>
        {latest ? `${latest.score} / 15 • ${moodHint(Number(latest.score))}` : 'No mood check-ins logged yet.'}
      </Text>
      {latest?.recordedAt ? (
        <Text style={styles.latestMeta}>Last updated {formatWhen(latest.recordedAt)}</Text>
      ) : null}

      {editable ? (
        <>
          <View style={styles.scoreGrid}>
            {Array.from({ length: 15 }, (_, index) => index + 1).map((score) => {
              const active = selectedScore === score;
              return (
                <TouchableOpacity
                  key={score}
                  onPress={() => setSelectedScore(score)}
                  style={[styles.scoreBtn, active ? styles.scoreBtnActive : null]}
                  accessibilityLabel={`Set mood score ${score}`}
                >
                  <Text style={[styles.scoreBtnText, active ? styles.scoreBtnTextActive : null]}>{score}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            multiline
            style={styles.noteInput}
          />
          <TouchableOpacity onPress={save} style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]} disabled={saving} accessibilityLabel="Save mood entry">
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save mood check-in'}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.historyMeta}>Loading history…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!loading && Array.isArray(history) && history.length ? (
        <View style={styles.historyWrap}>
          {history.map((entry) => (
            <View key={entry.id || `${entry.childId}-${entry.recordedAt}`} style={styles.historyRow}>
              <View style={styles.historyScoreBadge}>
                <Text style={styles.historyScoreText}>{entry.score}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyMeta}>{formatWhen(entry.recordedAt)}</Text>
                {entry.note ? <Text style={styles.historyNote}>{entry.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginTop: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 6,
    color: '#334155',
    fontWeight: '600',
  },
  latestMeta: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  scoreBtn: {
    width: '18%',
    marginRight: '2%',
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  scoreBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  scoreBtnText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  scoreBtnTextActive: {
    color: '#fff',
  },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  saveBtn: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  historyWrap: {
    marginTop: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  historyScoreBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  historyScoreText: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  historyNote: {
    marginTop: 4,
    color: '#0f172a',
  },
  errorText: {
    marginTop: 10,
    color: '#b91c1c',
  },
});