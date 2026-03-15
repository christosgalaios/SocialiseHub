import { useState } from 'react';
import type { ScrapedEvent } from '@shared/types';
import { analyzeMarket } from '../api/events';
import { MarketDataTable } from '../components/MarketDataTable';

export function EventGeneratorPage() {
  const [marketData, setMarketData] = useState<ScrapedEvent[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Market Analysis</h1>
          <p style={styles.subtitle}>
            Scan connected platforms for upcoming events in Bristol. This data feeds into the Magic event generator on the Events page.
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
              Scanning...
            </>
          ) : (
            'Analyse Market'
          )}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {marketData.length > 0 && (
        <div style={styles.status}>
          {marketData.length} events found across platforms
        </div>
      )}

      <MarketDataTable events={marketData} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 24,
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
    maxWidth: 500,
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
  status: {
    fontSize: 14,
    color: '#2D5F5D',
    fontWeight: 600,
    marginBottom: 16,
  },
  actionBtn: {
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
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  actionBtnDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
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
};
