import { updateEvent } from '../api/events';

export interface ScoreSuggestion {
  field: string;
  current_issue: string;
  suggestion: string;
  impact: number;
  suggested_value?: string | null;
}

export interface ScoreBreakdown {
  [key: string]: number;
}

export interface ScorePanelProps {
  eventId: string;
  overall: number;
  breakdown: ScoreBreakdown;
  suggestions: ScoreSuggestion[];
  onApply: (field: string, value: string) => void;
  onRescore: () => void;
}

// ── ScoreGauge ───────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const dashOffset = circumference - (progress / 100) * circumference;

  const color = score < 40 ? '#E2725B' : score < 70 ? '#f0a500' : '#2D9E6B';

  return (
    <div style={gaugeStyles.wrapper}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {/* Track */}
        <circle
          cx={70}
          cy={70}
          r={radius}
          fill="none"
          stroke="#e8e6e1"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={70}
          cy={70}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {/* Score text */}
        <text
          x={70}
          y={67}
          textAnchor="middle"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700, fill: '#080810' }}
        >
          {score}
        </text>
        <text
          x={70}
          y={86}
          textAnchor="middle"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fill: '#7a7a7a' }}
        >
          / 100
        </text>
      </svg>
      <p style={gaugeStyles.label}>Overall Score</p>
    </div>
  );
}

const gaugeStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    color: '#7a7a7a',
    margin: 0,
  },
};

// ── BreakdownBars ────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  seo: 'SEO',
  timing: 'Timing',
  pricing: 'Pricing',
  description: 'Description',
  photos: 'Photos',
};

function BreakdownBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  const categories = ['seo', 'timing', 'pricing', 'description', 'photos'] as const;

  return (
    <div style={barStyles.wrapper}>
      {categories.map((cat) => {
        const value = breakdown[cat] ?? 0;
        const barColor = value < 40 ? '#E2725B' : value < 70 ? '#f0a500' : '#2D9E6B';
        return (
          <div key={cat} style={barStyles.row}>
            <span style={barStyles.label}>{CATEGORY_LABELS[cat]}</span>
            <div style={barStyles.track}>
              <div
                style={{
                  ...barStyles.fill,
                  width: `${value}%`,
                  background: barColor,
                }}
              />
            </div>
            <span style={barStyles.value}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

const barStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    width: 80,
    flexShrink: 0,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: '#e8e6e1',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.5s ease',
  },
  value: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 700,
    color: '#080810',
    width: 28,
    textAlign: 'right',
    flexShrink: 0,
  },
};

// ── ScorePanel ───────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  seo: '#6c63ff',
  timing: '#f0a500',
  pricing: '#2D9E6B',
  description: '#E2725B',
  photos: '#3d86c6',
};

export function ScorePanel({
  eventId,
  overall,
  breakdown,
  suggestions,
  onApply,
  onRescore,
}: ScorePanelProps) {
  const handleApply = async (field: string, suggestedValue: string) => {
    try {
      await updateEvent(eventId, { [field]: suggestedValue });
      onApply(field, suggestedValue);
    } catch (err) {
      console.error('Failed to apply suggestion', err);
    }
  };

  return (
    <div style={panelStyles.container}>
      {/* Header */}
      <div style={panelStyles.header}>
        <h2 style={panelStyles.title}>📊 Event Score</h2>
        <button style={panelStyles.rescoreBtn} onClick={onRescore}>
          Re-Score
        </button>
      </div>

      {/* Gauge + Breakdown */}
      <div style={panelStyles.scoreRow}>
        <ScoreGauge score={overall} />
        <BreakdownBars breakdown={breakdown} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div style={panelStyles.suggestionsSection}>
          <h3 style={panelStyles.suggestionsTitle}>Improvement Suggestions</h3>
          <div style={panelStyles.suggestionsList}>
            {suggestions.map((s, i) => {
              const fieldColor = IMPACT_COLORS[s.field] ?? '#888';
              return (
                <div key={i} style={panelStyles.suggestionCard}>
                  <div style={panelStyles.suggestionTopRow}>
                    <span
                      style={{
                        ...panelStyles.fieldBadge,
                        background: fieldColor + '18',
                        color: fieldColor,
                        border: `1px solid ${fieldColor}40`,
                      }}
                    >
                      {CATEGORY_LABELS[s.field] ?? s.field}
                    </span>
                    <span style={panelStyles.impactBadge}>+{s.impact} pts</span>
                  </div>
                  <p style={panelStyles.issueText}>{s.current_issue}</p>
                  <p style={panelStyles.suggestionText}>{s.suggestion}</p>
                  {s.suggested_value && (
                    <div style={panelStyles.suggestionValue}>
                      <span style={panelStyles.valueLabel}>Suggested:</span>
                      <span style={panelStyles.valueText}>{s.suggested_value}</span>
                      <button
                        style={panelStyles.applyBtn}
                        onClick={() => handleApply(s.field, s.suggested_value!)}
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: 24,
    marginTop: 28,
    maxWidth: 640,
    fontFamily: "'Outfit', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  rescoreBtn: {
    padding: '8px 16px',
    borderRadius: 10,
    border: '1.5px solid #e8e6e1',
    background: '#fff',
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  scoreRow: {
    display: 'flex',
    gap: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  suggestionsSection: {
    borderTop: '1px solid #e8e6e1',
    paddingTop: 20,
  },
  suggestionsTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#080810',
    margin: '0 0 14px 0',
  },
  suggestionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  suggestionCard: {
    background: '#fafafa',
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  suggestionTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  fieldBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Outfit', sans-serif",
  },
  impactBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    background: '#e6f4ea',
    color: '#1e7e34',
    fontFamily: "'Outfit', sans-serif",
  },
  issueText: {
    fontSize: 13,
    color: '#7a7a7a',
    margin: 0,
    fontStyle: 'italic',
  },
  suggestionText: {
    fontSize: 14,
    color: '#080810',
    margin: 0,
  },
  suggestionValue: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
    padding: '8px 12px',
    background: '#f0f9ff',
    borderRadius: 8,
    border: '1px solid #bae0fd',
  },
  valueLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#3d86c6',
    flexShrink: 0,
    paddingTop: 1,
  },
  valueText: {
    fontSize: 13,
    color: '#080810',
    flex: 1,
    wordBreak: 'break-word',
  },
  applyBtn: {
    padding: '4px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#3d86c6',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: "'Outfit', sans-serif",
  },
};
