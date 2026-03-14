import { useState } from 'react';

interface AiPromptModalProps {
  title: string;
  prompt: string;
  responseFormat: 'json' | 'text';
  onSubmit: (response: string) => void;
  onClose: () => void;
}

export function AiPromptModal({ title, prompt, responseFormat, onSubmit, onClose }: AiPromptModalProps) {
  const [response, setResponse] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    const trimmed = response.trim();
    if (!trimmed) {
      setError('Paste the AI response above');
      return;
    }
    if (responseFormat === 'json') {
      try {
        JSON.parse(trimmed);
      } catch {
        setError('Invalid JSON — make sure you copied the full response');
        return;
      }
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-primary, #1a1a2e)', color: 'var(--text-primary, #e0e0e0)',
        borderRadius: 12, padding: 24, width: '90%', maxWidth: 700, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary, #999)',
            fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}>
          Copy this prompt into any AI chat, then paste the response below.
        </div>

        <div style={{ position: 'relative' }}>
          <pre style={{
            background: 'var(--bg-secondary, #16213e)', borderRadius: 8, padding: 12,
            fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', margin: 0, border: '1px solid var(--border, #2a2a4a)',
          }}>{prompt}</pre>
          <button onClick={handleCopy} style={{
            position: 'absolute', top: 8, right: 8, padding: '4px 12px',
            borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
            background: copied ? '#22c55e' : 'var(--accent, #6366f1)', color: '#fff',
          }}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>

        <textarea
          value={response}
          onChange={(e) => { setResponse(e.target.value); setError(null); }}
          placeholder={responseFormat === 'json' ? 'Paste JSON response here...' : 'Paste response here...'}
          style={{
            background: 'var(--bg-secondary, #16213e)', color: 'var(--text-primary, #e0e0e0)',
            border: error ? '1px solid #ef4444' : '1px solid var(--border, #2a2a4a)',
            borderRadius: 8, padding: 12, minHeight: 150, resize: 'vertical',
            fontFamily: responseFormat === 'json' ? 'monospace' : 'inherit', fontSize: 13,
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border, #2a2a4a)',
            background: 'transparent', color: 'var(--text-primary, #e0e0e0)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--accent, #6366f1)', color: '#fff', cursor: 'pointer',
          }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
