import { useState } from 'react';

interface CredentialsFormProps {
  onSubmit: (email: string, password: string) => void;
  loading: boolean;
  error?: string;
}

export function CredentialsForm({ onSubmit, loading, error }: CredentialsFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.field}>
        <span style={styles.label}>Email</span>
        <input
          type="email"
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoComplete="email"
        />
      </label>

      <label style={styles.field}>
        <span style={styles.label}>Password</span>
        <input
          type="password"
          style={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete="current-password"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? 'Connecting...' : 'Connect'}
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '16px',
    background: '#FAFAF6',
    borderRadius: 12,
  },
  error: {
    padding: '10px 14px',
    borderRadius: 10,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 13,
    fontWeight: 500,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    background: '#fff',
  },
  submitBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    alignSelf: 'flex-start',
    transition: 'opacity 0.2s',
  },
};
