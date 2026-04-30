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
  const [moodHistory, setMoodHistory] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!selectedChildId && !reportChildIds.length) {
        if (!disposed) {
          setSessionSummariesByChild({});
          setMoodHistory([]);
          setAttendanceHistory([]);
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
        const [moodResult, attendanceResult] = await Promise.all([
          selectedChildId ? getMoodHistory(selectedChildId, 60).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
          selectedChildId ? getAttendanceHistory(selectedChildId, 365).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        ]);
        if (disposed) return;
        setSessionSummariesByChild(nextSummariesByChild);
        setMoodHistory(Array.isArray(moodResult?.items) ? moodResult.items : []);
        setAttendanceHistory(Array.isArray(attendanceResult?.items) ? attendanceResult.items : []);
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

  const selectedSessionSummaries = sessionSummariesByChild[selectedChildId] || [];

  const childReports = useMemo(() => ({
    behaviorTrends: buildBehaviorTrendSeries(selectedSessionSummaries),
    moodTrends: buildMoodTrendSeries(moodHistory),
    programMastery: buildProgramMasteryTable(selectedSessionSummaries),
    reinforcerEffectiveness: buildReinforcerEffectiveness(selectedSessionSummaries),
    monthlySummary: buildMonthlySummary(selectedSessionSummaries),
    attendanceSummary: buildAttendanceSummary(attendanceHistory),
    behaviorHeatmap: buildBehaviorHeatmap(selectedSessionSummaries),
  }), [selectedSessionSummaries, moodHistory, attendanceHistory]);

  const schoolWide = useMemo(() => buildSchoolWideAnalytics({ summariesByChild: sessionSummariesByChild, children, urgentMemos }), [sessionSummariesByChild, children, urgentMemos]);

  return {
    loading,
    error,
    childReports,
    schoolWide,
    sessionSummariesByChild,
  };
}