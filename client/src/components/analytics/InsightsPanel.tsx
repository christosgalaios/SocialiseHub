import { useState } from 'react';
import type { CSSProperties } from 'react';
import { getAnalyticsInsights } from '../../api/events';
import { AiPromptModal } from '../AiPromptModal';

export function InsightsPanel() {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiModal, setAiModal] = useState<{ title: string; prompt: string; responseFormat: 'json' | 'text'; onSubmit: (r: string) => void } | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setInsights(null);

    try {
      const result = await getAnalyticsInsights();
      const prompt = result.prompt;

      setAiModal({
        title: 'Analyze Performance',
        prompt,
        responseFormat: 'text',
        onSubmit: (response) => {
          setAiModal(null);
          setInsights(response);
        },
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const panelStyle: CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 12,
    padding: '20px 24px',
    border: '1px solid rgba(139,92,246,0.2)',
  };

  const btnStyle: CSSProperties = {
    background: '#8b5cf6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'wait' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'opacity 0.2s',
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>AI Insights</div>
          <div style={{ color: '#888', fontSize: 13 }}>
            Analyze your event performance data with AI
          </div>
        </div>
        <button style={btnStyle} onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze Performance'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {insights && (
        <div style={{
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.15)',
          borderRadius: 8,
          padding: '16px',
          color: '#e0e0e0',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {insights}
        </div>
      )}

      {!insights && !error && !loading && (
        <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Click "Analyze Performance" to generate AI-powered insights from your event data
        </div>
      )}

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
