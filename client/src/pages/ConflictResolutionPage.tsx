import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getEventConflicts,
  resolveConflicts,
  pushToPlatform,
} from '../api/conflicts';
import type { ConflictResponse, FieldConflict } from '../api/conflicts';
import type { PlatformName } from '../../../src/shared/types';

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  start_time: 'Start Time',
  venue: 'Venue',
  price: 'Price',
  capacity: 'Capacity',
};

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPlatformName(platform: PlatformName | string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type PageState = 'loading' | 'error' | 'idle' | 'syncing' | 'verifying' | 'done';

interface SyncProgress {
  platform: string;
  status: 'pending' | 'syncing' | 'done' | 'error';
  error?: string;
}

export function ConflictResolutionPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<ConflictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string | number>>({});
  const [syncProgress, setSyncProgress] = useState<SyncProgress[]>([]);
  const [syncErrors, setSyncErrors] = useState<Array<{ platform: string; error: string }>>([]);
  const [finalConflicts, setFinalConflicts] = useState<FieldConflict[]>([]);

  const loadConflicts = useCallback(() => {
    if (!id) return;
    setPageState('loading');
    setError(null);
    getEventConflicts(id)
      .then((result) => {
        setData(result);
        setEditedFields({});
        setPageState('idle');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load conflicts');
        setPageState('error');
      });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setPageState('loading');
    setError(null);
    getEventConflicts(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setEditedFields({});
          setPageState('idle');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load conflicts');
          setPageState('error');
        }
      });
    return () => { cancelled = true; };
  }, [id]);

  const getDisplayValue = (field: string, hubValue: string | number | null): string => {
    if (field in editedFields) return String(editedFields[field]);
    return hubValue !== null && hubValue !== undefined ? String(hubValue) : '';
  };

  const handleEdit = (field: string, value: string) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleUseThis = (field: string, value: string | number | null) => {
    setEditedFields((prev) => ({ ...prev, [field]: value !== null && value !== undefined ? value : '' }));
  };

  const handleSync = async () => {
    if (!id || !data) return;

    setPageState('syncing');
    setSyncErrors([]);

    // Step 1: resolve hub fields
    let resolveResult;
    try {
      resolveResult = await resolveConflicts(id, editedFields);
      if (resolveResult.errors?.length) {
        setSyncErrors(resolveResult.errors);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save field changes');
      setPageState('idle');
      return;
    }

    // Step 2: push to each platform
    if (resolveResult.needsSync) {
      const platforms = data.platforms.map((p) => p.platform as string);
      const progress: SyncProgress[] = platforms.map((p) => ({ platform: p, status: 'pending' }));
      setSyncProgress(progress);

      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i];
        setSyncProgress((prev) =>
          prev.map((p) => (p.platform === platform ? { ...p, status: 'syncing' } : p))
        );
        try {
          await pushToPlatform(id, platform);
          setSyncProgress((prev) =>
            prev.map((p) => (p.platform === platform ? { ...p, status: 'done' } : p))
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Push failed';
          setSyncProgress((prev) =>
            prev.map((p) => (p.platform === platform ? { ...p, status: 'error', error: msg } : p))
          );
          setSyncErrors((prev) => [...prev, { platform, error: msg }]);
        }
      }
    }

    // Step 3: re-fetch to verify
    setPageState('verifying');
    try {
      const refreshed = await getEventConflicts(id);
      setData(refreshed);
      setEditedFields({});
      setFinalConflicts(refreshed.conflicts);
      setPageState('done');
    } catch {
      setPageState('done');
    }
  };

  const pendingFields = Object.keys(editedFields);
  const conflictCount = data?.conflicts.length ?? 0;
  const platformCount = data?.platforms.length ?? 0;

  // Separate conflicts and synced fields (fields that are the same across all platforms)
  const syncedFields: string[] = [];
  if (data) {
    // Gather all field names present in conflict list
    const conflictFieldNames = new Set(data.conflicts.map((c) => c.field));
    // We don't have an explicit "synced fields" list from the API, so we'll just show a note
    // if there are no conflicts at all
    if (conflictFieldNames.size === 0) {
      syncedFields.push('All fields are in sync');
    }
  }

  if (pageState === 'loading') {
    return (
      <div style={styles.page}>
        <div style={styles.skeleton} />
        <div style={{ ...styles.skeleton, width: '60%', marginTop: 12 }} />
        <div style={{ ...styles.skeleton, width: '80%', marginTop: 24 }} />
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => nav(`/events/${id}`)}>
          ← Back to Event
        </button>
        <div style={styles.errorBox}>
          <div style={styles.errorTitle}>Failed to load conflicts</div>
          <div style={styles.errorMsg}>{error}</div>
          <button style={styles.retryBtn} onClick={loadConflicts}>Retry</button>
        </div>
      </div>
    );
  }

  if (pageState === 'done') {
    return (
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => nav(`/events/${id}`)}>
          ← Back to Event
        </button>
        <h1 style={styles.pageTitle}>{data?.eventTitle ?? 'Event'}</h1>

        {syncErrors.length > 0 && (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>Some platforms failed to sync</div>
            {syncErrors.map((e) => (
              <div key={e.platform} style={styles.errorMsg}>
                {formatPlatformName(e.platform)}: {e.error}
              </div>
            ))}
          </div>
        )}

        {finalConflicts.length === 0 ? (
          <div style={styles.successBox}>
            <div style={styles.successIcon}>✓</div>
            <div style={styles.successTitle}>All fields synced</div>
            <div style={styles.successMsg}>
              Your hub data has been pushed to all connected platforms.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ ...styles.statusBar, background: '#fef2f2', color: '#dc2626' }}>
              {finalConflicts.length} conflict{finalConflicts.length !== 1 ? 's' : ''} remaining after sync
            </div>
            <button style={styles.retryBtn} onClick={loadConflicts}>Review Remaining Conflicts</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <button style={styles.backBtn} onClick={() => nav(`/events/${id}`)}>
        ← Back to Event
      </button>
      <h1 style={styles.pageTitle}>{data?.eventTitle ?? 'Event'}</h1>

      {/* Status bar */}
      {conflictCount > 0 ? (
        <div style={{ ...styles.statusBar, background: '#fef2f2', color: '#dc2626' }}>
          {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} across {platformCount} platform{platformCount !== 1 ? 's' : ''}
        </div>
      ) : (
        <div style={{ ...styles.statusBar, background: '#f0fdf4', color: '#16a34a' }}>
          All fields synced across {platformCount} platform{platformCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Platform badges */}
      {data && data.platforms.length > 0 && (
        <div style={styles.platformRow}>
          {data.platforms.map((p) => (
            <div key={p.platform} style={styles.platformBadge}>
              <span style={styles.platformDot} />
              <span style={styles.platformName}>{formatPlatformName(p.platform)}</span>
              <span style={styles.platformSync}>
                Last synced {formatDate(p.lastSyncedAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Syncing progress */}
      {(pageState === 'syncing' || pageState === 'verifying') && syncProgress.length > 0 && (
        <div style={styles.progressBox}>
          <div style={styles.progressTitle}>
            {pageState === 'verifying' ? 'Verifying sync...' : 'Pushing to platforms...'}
          </div>
          {syncProgress.map((p) => (
            <div key={p.platform} style={styles.progressRow}>
              <span style={styles.progressPlatform}>{formatPlatformName(p.platform)}</span>
              <span style={{
                ...styles.progressStatus,
                color: p.status === 'done' ? '#16a34a'
                  : p.status === 'error' ? '#dc2626'
                  : p.status === 'syncing' ? '#f59e0b'
                  : '#6b7280',
              }}>
                {p.status === 'pending' && 'Waiting...'}
                {p.status === 'syncing' && 'Syncing...'}
                {p.status === 'done' && '✓ Done'}
                {p.status === 'error' && `✗ ${p.error ?? 'Error'}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Conflict cards */}
      {data && data.conflicts.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Field Conflicts</h2>
          <div style={styles.conflictList}>
            {data.conflicts.map((conflict) => {
              const isEdited = conflict.field in editedFields;
              const borderColor = isEdited ? '#f59e0b' : '#dc2626';
              const displayValue = getDisplayValue(conflict.field, conflict.hubValue);

              return (
                <div
                  key={conflict.field}
                  style={{
                    ...styles.conflictCard,
                    borderLeft: `4px solid ${borderColor}`,
                  }}
                >
                  <div style={styles.conflictHeader}>
                    <span style={styles.fieldLabel}>{getFieldLabel(conflict.field)}</span>
                    {isEdited && (
                      <span style={styles.pendingBadge}>pending</span>
                    )}
                  </div>

                  {/* Show which platforms match hub value */}
                  {data.platforms && (() => {
                    const conflictingPlatforms = new Set(conflict.platformValues.map(pv => pv.platform));
                    const matchingPlatforms = data.platforms
                      .filter(p => !conflictingPlatforms.has(p.platform))
                      .map(p => p.platform);
                    return matchingPlatforms.length > 0 ? (
                      <div style={styles.matchInfo}>
                        Matches: {matchingPlatforms.map(p => formatPlatformName(p)).join(', ')}
                      </div>
                    ) : null;
                  })()}

                  {/* Editable hub value */}
                  <div style={styles.hubInputWrap}>
                    <label style={styles.inputLabel}>Hub value</label>
                    {conflict.field === 'description' ? (
                      <textarea
                        style={styles.textarea}
                        value={displayValue}
                        onChange={(e) => handleEdit(conflict.field, e.target.value)}
                        rows={4}
                        disabled={pageState === 'syncing' || pageState === 'verifying'}
                      />
                    ) : (
                      <input
                        style={styles.input}
                        type="text"
                        value={displayValue}
                        onChange={(e) => handleEdit(conflict.field, e.target.value)}
                        disabled={pageState === 'syncing' || pageState === 'verifying'}
                      />
                    )}
                  </div>

                  {/* Platform values */}
                  <div style={styles.platformValues}>
                    {conflict.platformValues.map((pv) => (
                      <div key={pv.platform} style={styles.platformValueRow}>
                        <span style={styles.pvPlatform}>{formatPlatformName(pv.platform)}</span>
                        <span style={styles.pvValue}>
                          {pv.value !== null && pv.value !== undefined ? String(pv.value) : '(empty)'}
                        </span>
                        {pv.value != null && String(pv.value).trim() !== '' ? (
                          <button
                            style={styles.useThisBtn}
                            onClick={() => handleUseThis(conflict.field, pv.value)}
                            disabled={pageState === 'syncing' || pageState === 'verifying'}
                          >
                            Use this
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#dc2626', fontStyle: 'italic' }}>missing</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Synced fields */}
      {data && data.conflicts.length === 0 && (
        <div style={styles.syncedBox}>
          <span style={styles.syncedIcon}>✓</span>
          <span style={styles.syncedText}>All tracked fields are in sync across all platforms.</span>
        </div>
      )}

      {/* Pending edits info */}
      {pendingFields.length > 0 && (
        <div style={styles.pendingInfo}>
          {pendingFields.length} field{pendingFields.length !== 1 ? 's' : ''} edited — click Sync to save and push
        </div>
      )}

      {/* Action footer */}
      {data && (
        <div style={styles.footer}>
          <button
            style={{
              ...styles.syncBtn,
              opacity: pageState === 'syncing' || pageState === 'verifying' ? 0.7 : 1,
              cursor: pageState === 'syncing' || pageState === 'verifying' ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSync}
            disabled={pageState === 'syncing' || pageState === 'verifying'}
          >
            {pageState === 'syncing' && 'Syncing...'}
            {pageState === 'verifying' && 'Verifying...'}
            {(pageState === 'idle') && 'Sync to All Platforms'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 760,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#E2725B',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 20,
  },
  pageTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 26,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 16,
  },
  statusBar: {
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 20,
  },
  platformRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  platformBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 10,
    background: '#fff',
    border: '1px solid #e5e7eb',
    fontSize: 13,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#E2725B',
    flexShrink: 0,
  },
  platformName: {
    fontWeight: 700,
    color: '#080810',
    fontFamily: "'Outfit', sans-serif",
  },
  platformSync: {
    color: '#6b7280',
    fontSize: 12,
  },
  progressBox: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 20,
  },
  progressTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    color: '#080810',
    marginBottom: 12,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderTop: '1px solid #f3f4f6',
  },
  progressPlatform: {
    fontWeight: 600,
    fontSize: 13,
    color: '#374151',
  },
  progressStatus: {
    fontSize: 13,
    fontWeight: 600,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 12,
  },
  conflictList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  conflictCard: {
    background: '#fff',
    borderRadius: 12,
    padding: '16px 20px',
    border: '1px solid #e5e7eb',
  },
  matchInfo: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: 600,
    marginBottom: 6,
  },
  conflictHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  fieldLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    color: '#080810',
  },
  pendingBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#92400e',
    background: '#fef3c7',
    padding: '2px 8px',
    borderRadius: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  hubInputWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    outline: 'none',
    background: '#fafafa',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    outline: 'none',
    background: '#fafafa',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  platformValues: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  platformValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 8,
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    flexWrap: 'wrap',
  },
  pvPlatform: {
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    minWidth: 80,
    flexShrink: 0,
  },
  pvValue: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
    wordBreak: 'break-word',
  },
  useThisBtn: {
    padding: '4px 12px',
    borderRadius: 8,
    border: '1.5px solid #E2725B',
    background: '#fff',
    color: '#E2725B',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: "'Outfit', sans-serif",
  },
  syncedBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 20px',
    borderRadius: 12,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    marginBottom: 24,
  },
  syncedIcon: {
    fontSize: 18,
    color: '#16a34a',
    fontWeight: 700,
  },
  syncedText: {
    fontSize: 14,
    color: '#166534',
    fontWeight: 500,
  },
  pendingInfo: {
    fontSize: 13,
    color: '#92400e',
    background: '#fef3c7',
    padding: '8px 14px',
    borderRadius: 8,
    marginBottom: 16,
    fontWeight: 500,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  syncBtn: {
    padding: '14px 36px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'background 0.2s, transform 0.1s',
  },
  errorBox: {
    padding: '16px 20px',
    borderRadius: 12,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    marginBottom: 24,
  },
  errorTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    color: '#dc2626',
    marginBottom: 6,
  },
  errorMsg: {
    fontSize: 13,
    color: '#b91c1c',
    marginBottom: 8,
  },
  retryBtn: {
    padding: '10px 24px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    marginTop: 4,
  },
  successBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 24px',
    borderRadius: 16,
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    textAlign: 'center',
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 40,
    color: '#16a34a',
    marginBottom: 12,
    fontWeight: 700,
  },
  successTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    color: '#166534',
    marginBottom: 8,
  },
  successMsg: {
    fontSize: 14,
    color: '#16a34a',
  },
  skeleton: {
    height: 24,
    borderRadius: 8,
    background: '#e5e7eb',
    width: '100%',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};
