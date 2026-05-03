const MOOD_LABELS = {
  1: 'Very Upset',
  2: 'Upset',
  3: 'Neutral',
  4: 'Happy',
  5: 'Very Happy',
};

const DEFAULT_STATUS_LABEL = 'Not recorded';

const PROGRESS_STATUS_COLORS = {
  'Significant progress': '#16a34a',
  'Moderate progress': '#2563eb',
  'Minimal progress': '#f59e0b',
  'No progress': '#94a3b8',
  'Not recorded': '#94a3b8',
};

const INDEPENDENCE_STATUS_COLORS = {
  'Significant increase': '#16a34a',
  'Moderate increase': '#2563eb',
  'Slight increase': '#f59e0b',
  'No change': '#94a3b8',
  'Not recorded': '#94a3b8',
};

const BEHAVIOR_STATUS_COLORS = {
  None: '#16a34a',
  Minimal: '#65a30d',
  Moderate: '#f59e0b',
  High: '#dc2626',
  'Not recorded': '#94a3b8',
};

module.exports = {
  MOOD_LABELS,
  DEFAULT_STATUS_LABEL,
  PROGRESS_STATUS_COLORS,
  INDEPENDENCE_STATUS_COLORS,
  BEHAVIOR_STATUS_COLORS,
};