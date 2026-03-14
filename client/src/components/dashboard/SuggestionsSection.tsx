import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardSuggestion } from '../../api/dashboard';
import { getSuggestions, generateSuggestionsPrompt, storeSuggestions } from '../../api/dashboard';
import { AiPromptModal } from '../AiPromptModal';

// Inject spin keyframes once
if (typeof document !== 'undefined' && !document.getElementById('spin-keyframes')) {
  const tag = document.createElement('style');
  tag.id = 'spin-keyframes';
  tag.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(tag);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SuggestionsSection() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<DashboardSuggestion[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [aiModal, setAiModal] = useState<{ title: string; prompt: string; responseFormat: 'json' | 'text'; onSubmit: (r: string) => void } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getSuggestions();
      setSuggestions(result.suggestions);
      setGeneratedAt(result.generatedAt);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const { prompt } = await generateSuggestionsPrompt();
      setAiModal({
        title: 'Generate AI Suggestions',
        prompt,
        responseFormat: 'json',
        onSubmit: async (rawResponse: string) => {
          const jsonMatch = rawResponse.match(/```json\n?([\s\S]*?)\n?```/) ||
                            rawResponse.match(/(\[[\s\S]*\])/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]) as DashboardSuggestion[];
            await storeSuggestions(parsed);
            await load();
          }
        },
      });
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, [load]);

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>AI Suggestions</h2>
        <button
          style={{ ...styles.refreshBtn, opacity: loading ? 0.7 : 1 }}
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? (
            <span style={styles.spinner} />
          ) : (
            '✦ Refresh'
          )}
        </button>
      </div>

      {loading && (
        <div style={styles.loadingRow}>
          <span style={styles.spinner} />
          <span style={styles.loadingText}>Generating suggestions…</span>
        </div>
      )}

      {!loading && suggestions === null && (
        <div style={styles.empty}>
          No suggestions yet — click Refresh to generate
        </div>
      )}

      {!loading && suggestions !== null && suggestions.length === 0 && (
        <div style={styles.empty}>No suggestions available</div>
      )}

      {!loading && suggestions && suggestions.length > 0 && (
        <div style={styles.list}>
          {suggestions.map((s, i) => (
            <div key={i} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.suggestionTitle}>{s.title}</span>
                <span
                  style={{
                    ...styles.priorityBadge,
                    background:
                      s.priority === 'high'
                        ? '#ef4444'
                        : s.priority === 'medium'
                        ? '#f59e0b'
                        : '#9ca3af',
                  }}
                >
                  {s.priority}
                </span>
              </div>
              <p style={styles.suggestionBody}>{s.body}</p>
              {s.action === 'create_event' && (
                <button
                  style={styles.actionBtn}
                  onClick={() => {
                    const params = new URLSearchParams();
                    if ((s as DashboardSuggestion & { actionTitle?: string; actionDate?: string }).actionTitle) {
                      params.set('title', (s as DashboardSuggestion & { actionTitle?: string }).actionTitle!);
                    }
                    if ((s as DashboardSuggestion & { actionDate?: string }).actionDate) {
                      params.set('date', (s as DashboardSuggestion & { actionDate?: string }).actionDate!);
                    }
                    navigate(`/events/new?${params.toString()}`);
                  }}
                >
                  Create Event
                </button>
              )}
              {s.action === 'navigate' && (s as DashboardSuggestion & { actionUrl?: string }).actionUrl && (
                <button
                  style={styles.actionBtn}
                  onClick={() => navigate((s as DashboardSuggestion & { actionUrl?: string }).actionUrl!)}
                >
                  Go
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {generatedAt && (
        <span style={styles.timestamp}>Last updated: {timeAgo(generatedAt)}</span>
      )}

      {aiModal && (
        <AiPromptModal
          title={aiModal.title}
          prompt={aiModal.prompt}
          responseFormat={aiModal.responseFormat}
          onSubmit={(r) => { aiModal.onSubmit(r); setAiModal(null); }}
          onClose={() => setAiModal(null)}
        />
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 12,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 0',
  },
  loadingText: {
    fontSize: 13,
    color: '#7a7a7a',
  },
  spinner: {
    display: 'inline-block',
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '2px solid #e8e6e1',
    borderTopColor: '#2D5F5D',
    animation: 'spin 0.7s linear infinite',
  },
  empty: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '24px 20px',
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  suggestionTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: '#080810',
    flex: 1,
  },
  priorityBadge: {
    color: '#fff',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    textTransform: 'capitalize',
  },
  suggestionBody: {
    fontSize: 13,
    color: '#6b7280',
    margin: 0,
    lineHeight: 1.5,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    padding: '7px 14px',
    borderRadius: 10,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
    alignSelf: 'flex-end',
  },
};
