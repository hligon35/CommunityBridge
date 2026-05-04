import { useEffect, useMemo, useState } from 'react';
import { getAttendanceHistory, getChildSessionSummaries, getMoodHistory } from '../../../Api';
import {
  buildAttendanceSummary,
  buildBehaviorHeatmap,
  buildBehaviorTrendSeries,
  buildMoodTrendSeries,
  buildMonthlySummary,
  buildProgramMasteryTable,
  buildReinforcerEffectiveness,
  buildSchoolWideAnalytics,
} from '../services/reportingEngine';

export function useBehaviorSystemReports({ selectedChildId, reportChildIds = [], children = [], urgentMemos = [] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionSummariesByChild, setSessionSummariesByChild] = useState({});
  const [moodHistoryByChild, setMoodHistoryByChild] = useState({});
  const [attendanceHistoryByChild, setAttendanceHistoryByChild] = useState({});

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!selectedChildId && !reportChildIds.length) {
        if (!disposed) {
          setSessionSummariesByChild({});
          setMoodHistoryByChild({});
          setAttendanceHistoryByChild({});
        }
        return;
      }
      setLoading(true);
      setError('');
      try {
        const childIds = Array.from(new Set((Array.isArray(reportChildIds) ? reportChildIds : []).filter(Boolean).map(String)));
        const summaryPairs = await Promise.all(childIds.map(async (childId) => {
          const result = await getChildSessionSummaries(childId, 24).catch(() => ({ items: [] }));
          return [childId, Array.isArray(result?.items) ? result.items : []];
        }));
        const nextSummariesByChild = Object.fromEntries(summaryPairs);
        const moodPairs = await Promise.all(childIds.map(async (childId) => {
          const result = await getMoodHistory(childId, 60).catch(() => ({ items: [] }));
          return [childId, Array.isArray(result?.items) ? result.items : []];
        }));
        const attendancePairs = await Promise.all(childIds.map(async (childId) => {
          const result = await getAttendanceHistory(childId, 365).catch(() => ({ items: [] }));
          return [childId, Array.isArray(result?.items) ? result.items : []];
        }));
        if (disposed) return;
        setSessionSummariesByChild(nextSummariesByChild);
        setMoodHistoryByChild(Object.fromEntries(moodPairs));
        setAttendanceHistoryByChild(Object.fromEntries(attendancePairs));
      } catch (e) {
        if (!disposed) setError(String(e?.message || e || 'Could not load reporting data.'));
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, [selectedChildId, JSON.stringify(reportChildIds)]);

  const selectedSessionSummaries = useMemo(() => {
    if (selectedChildId) return sessionSummariesByChild[selectedChildId] || [];
    return Object.values(sessionSummariesByChild).flat();
  }, [selectedChildId, sessionSummariesByChild]);

  const selectedMoodHistory = useMemo(() => {
    if (selectedChildId) return moodHistoryByChild[selectedChildId] || [];
    return Object.values(moodHistoryByChild).flat();
  }, [moodHistoryByChild, selectedChildId]);

  const selectedAttendanceHistory = useMemo(() => {
    if (selectedChildId) return attendanceHistoryByChild[selectedChildId] || [];
    return Object.values(attendanceHistoryByChild).flat();
  }, [attendanceHistoryByChild, selectedChildId]);

  const childReports = useMemo(() => ({
    behaviorTrends: buildBehaviorTrendSeries(selectedSessionSummaries),
    moodTrends: buildMoodTrendSeries(selectedMoodHistory),
    programMastery: buildProgramMasteryTable(selectedSessionSummaries),
    reinforcerEffectiveness: buildReinforcerEffectiveness(selectedSessionSummaries),
    monthlySummary: buildMonthlySummary(selectedSessionSummaries),
    attendanceSummary: buildAttendanceSummary(selectedAttendanceHistory),
    behaviorHeatmap: buildBehaviorHeatmap(selectedSessionSummaries),
  }), [selectedAttendanceHistory, selectedMoodHistory, selectedSessionSummaries]);

  const schoolWide = useMemo(() => buildSchoolWideAnalytics({ summariesByChild: sessionSummariesByChild, children, urgentMemos }), [sessionSummariesByChild, children, urgentMemos]);

  return {
    loading,
    error,
    childReports,
    schoolWide,
    sessionSummariesByChild,
  };
}