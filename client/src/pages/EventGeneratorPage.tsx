import { useState } from 'react';
import type { ScrapedEvent } from '@shared/types';
import { analyzeMarket } from '../api/events';
import { MarketDataTable } from '../components/MarketDataTable';

// Declare electronAPI if available (Electron desktop mode)
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      openExternal: (url: string) => Promise<void>;
      copyToClipboard: (text: string) => Promise<void>;
      toggleClaudePanel: () => Promise<boolean>;
      focusClaudePanel: () => Promise<void>;
      isClaudePanelOpen: () => Promise<boolean>;
    };
  }
}

const BASE = '/api';

export function EventGeneratorPage() {
  const [marketData, setMarketData] = useState<ScrapedEvent[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claude prompt state
  const [prompt, setPrompt] = useState<string | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleGeneratePrompt = async () => {
    setError(null);
    try {
      const res = await fetch(`${BASE}/generator/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketData }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      const body = (await res.json()) as { data: { prompt: string } };
      setPrompt(body.data.prompt);
      setShowPromptModal(true);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
    }
  };

  const handleCopyAndSend = async () => {
    if (!prompt) return;
    try {
      // Copy to clipboard — use Electron API if available, otherwise native
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(prompt);
      } else {
        await navigator.clipboard.writeText(prompt);
      }
      setCopied(true);

      // Focus the in-app Claude panel if in Electron, otherwise open a new tab
      if (window.electronAPI?.focusClaudePanel) {
        await window.electronAPI.focusClaudePanel();
      } else {
        window.open('https://claude.ai/new', '_blank');
      }
    } catch {
      setError('Failed to copy to clipboard');
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
              above and your past events. You review the prompt, then send it to Claude
              (via your Max plan — no API costs). Claude responds with tailored event ideas
              that you can save as drafts.
            </p>
          </div>
        </section>
      )}

      {/* Prompt Review Modal */}
      {showPromptModal && prompt && (
        <div style={styles.overlay} onClick={() => setShowPromptModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Review Prompt for Claude</h2>
              <button
                style={styles.closeBtn}
                onClick={() => setShowPromptModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={styles.promptBox}>
              <pre style={styles.promptText}>{prompt}</pre>
            </div>

            <div style={styles.modalFooter}>
              <p style={styles.modalHint}>
                {copied
                  ? '✅ Copied! Paste into Claude and hit Enter.'
                  : 'This will copy the prompt and open the Claude panel'}
              </p>
              <div style={styles.modalActions}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => setShowPromptModal(false)}
                >
                  Cancel
                </button>
                <button
                  style={styles.sendBtn}
                  onClick={handleCopyAndSend}
                >
                  {copied ? '📋 Copied — Focus Claude' : '📋 Copy & Open Claude'}
                </button>
              </div>
            </div>
          </div>
        </div>
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

  // Modal overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  },
  modal: {
    background: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 720,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 28px',
    borderBottom: '1px solid #e8e6e1',
  },
  modalTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
  },
  promptBox: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 28px',
  },
  promptText: {
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.7,
    color: '#333',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  modalFooter: {
    padding: '16px 28px',
    borderTop: '1px solid #e8e6e1',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  modalHint: {
    fontSize: 12,
    color: '#7a7a7a',
    margin: 0,
    flex: 1,
  },
  modalActions: {
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  secondaryBtn: {
    padding: '10px 18px',
    borderRadius: 10,
    border: '1.5px solid #ddd',
    background: '#fff',
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'nowrap',
  },
};
