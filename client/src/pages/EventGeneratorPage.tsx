import { useState } from 'react';
import type { ScrapedEvent } from '@shared/types';
import { analyzeMarket, storeIdeas } from '../api/events';
import { MarketDataTable } from '../components/MarketDataTable';
import { AiPromptModal } from '../components/AiPromptModal';

const BASE = '/api';

export function EventGeneratorPage() {
  const [marketData, setMarketData] = useState<ScrapedEvent[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiModal, setAiModal] = useState<{
    title: string;
    prompt: string;
    responseFormat: 'json' | 'text';
    onSubmit: (r: string) => void;
  } | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeMarket();
      setMarketData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyse market');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadIdeas = async () => {
    // No-op placeholder — ideas are now stored via storeIdeas; the idea queue
    // can be refreshed by navigating to the Events page or via the idea modal there.
  };

  const handleGeneratePrompt = async () => {
    setError(null);
    try {
      const res = await fetch(`${BASE}/generator/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      const body = (await res.json()) as { prompt: string };

      setAiModal({
        title: 'Generate Event Ideas with Claude',
        prompt: body.prompt,
        responseFormat: 'json',
        onSubmit: async (response: string) => {
          setAiModal(null);
          try {
            // Extract JSON array from response (handles optional code fences)
            const startIdx = response.indexOf('[');
            const endIdx = response.lastIndexOf(']');
            if (startIdx === -1 || endIdx === -1) {
              throw new Error('No JSON array found in response');
            }
            const parsed = JSON.parse(response.slice(startIdx, endIdx + 1));
            await storeIdeas(parsed);
            await loadIdeas();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to store ideas');
          }
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Event Generator</h1>
          <p style={styles.subtitle}>
            Analyse the market and generate event ideas with Claude AI
          </p>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Step 1: Market Analysis */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div style={styles.stepBadge}>1</div>
          <div>
            <h2 style={styles.sectionTitle}>Market Analysis</h2>
            <p style={styles.sectionDesc}>
              Scan connected platforms for upcoming events in Bristol
            </p>
          </div>
          <button
            style={{
              ...styles.actionBtn,
              ...(analyzing ? styles.actionBtnDisabled : {}),
            }}
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <span style={styles.spinner} />
                Scanning…
              </>
            ) : (
              '🔍 Analyse Market'
            )}
          </button>
        </div>

        <MarketDataTable events={marketData} />
      </section>

      {/* Step 2: AI Generation — only show after market data is loaded */}
      {marketData.length > 0 && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.stepBadge}>2</div>
            <div>
              <h2 style={styles.sectionTitle}>Generate Ideas with Claude</h2>
              <p style={styles.sectionDesc}>
                Claude analyses the market data and suggests creative event ideas
              </p>
            </div>
            <button
              style={styles.claudeBtn}
              onClick={handleGeneratePrompt}
            >
              ✨ Generate Ideas
            </button>
          </div>

          <div style={styles.infoBox}>
            <p style={styles.infoText}>
              <strong>How it works:</strong> We compose a detailed prompt with the market data
              above and your past events. Copy the prompt into any AI chat, paste Claude's
              JSON response back here, and the ideas will be saved to your queue automatically.
            </p>
          </div>
        </section>
      )}

      {/* AI Prompt Modal */}
      {aiModal && (
        <AiPromptModal
          title={aiModal.title}
          prompt={aiModal.prompt}
          responseFormat={aiModal.responseFormat}
          onSubmit={aiModal.onSubmit}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
  },
  section: {
    marginBottom: 32,
    padding: '24px 28px',
    borderRadius: 16,
    background: '#fff',
    border: '1px solid #e8e6e1',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#080810',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 14,
    fontFamily: "'Outfit', sans-serif",
    flexShrink: 0,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#7a7a7a',
    margin: '2px 0 0',
  },
  actionBtn: {
    marginLeft: 'auto',
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    transition: 'transform 0.1s',
  },
  actionBtnDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  claudeBtn: {
    marginLeft: 'auto',
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'nowrap',
    transition: 'transform 0.1s',
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  infoBox: {
    padding: '14px 18px',
    borderRadius: 12,
    background: '#f8f6f1',
    border: '1px solid #e8e2d5',
  },
  infoText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 1.6,
    margin: 0,
  },
};
