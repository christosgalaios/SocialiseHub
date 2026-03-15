import { useEffect, useState } from 'react';
import type { PortfolioCategory, PortfolioData } from '../../api/dashboard';
import { getPortfolio } from '../../api/dashboard';
import { ListSkeleton } from '../Skeleton';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  return `£${price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function PortfolioSection() {
  const [data, setData] = useState<PortfolioData['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    let cancelled = false;

    getPortfolio()
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load portfolio');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return load();
  }, []);

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Portfolio</h2>
      </div>

      {loading && <ListSkeleton rows={5} />}

      {error && !loading && (
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
          <button style={styles.retryButton} onClick={load}>
            Retry
          </button>
        </div>
      )}

      {data && !loading && !error && (
        <>
          <div style={styles.summaryBar}>
            <span style={styles.summaryText}>
              <strong>{data.summary.totalEvents}</strong> event{data.summary.totalEvents !== 1 ? 's' : ''} across{' '}
              <strong>{data.summary.totalCategories}</strong> categor{data.summary.totalCategories !== 1 ? 'ies' : 'y'}
              {' '}
              <span style={styles.summaryDivider}>|</span>
              {' '}
              <strong>{data.summary.upcomingEvents}</strong> upcoming
            </span>
          </div>

          {data.summary.calendarGaps.length > 0 && (
            <div style={styles.gapWarning}>
              <span style={styles.gapIcon}>⚠</span>
              <span>
                <strong>No events scheduled for weeks starting:</strong>{' '}
                {data.summary.calendarGaps.map(formatDate).join(', ')}
              </span>
            </div>
          )}

          {data.categories.length === 0 ? (
            <div style={styles.emptyState}>No category data available.</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, ...styles.thLeft }}>Category</th>
                    <th style={styles.th}>Events</th>
                    <th style={styles.th}>Upcoming</th>
                    <th style={styles.th}>Draft</th>
                    <th style={styles.th}>Published</th>
                    <th style={styles.th}>Avg Price</th>
                    <th style={styles.th}>Venues</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((cat: PortfolioCategory, i: number) => (
                    <tr
                      key={cat.category}
                      style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}
                    >
                      <td style={{ ...styles.td, ...styles.tdCategory }}>
                        {cat.category || <span style={styles.uncategorised}>Uncategorised</span>}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>
                        <span style={styles.countChip}>{cat.count}</span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>
                        {cat.upcoming > 0 ? (
                          <span style={{ ...styles.countChip, ...styles.chipUpcoming }}>{cat.upcoming}</span>
                        ) : (
                          <span style={styles.zero}>—</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>
                        {cat.draft > 0 ? (
                          <span style={{ ...styles.countChip, ...styles.chipDraft }}>{cat.draft}</span>
                        ) : (
                          <span style={styles.zero}>—</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>
                        {cat.published > 0 ? (
                          <span style={{ ...styles.countChip, ...styles.chipPublished }}>{cat.published}</span>
                        ) : (
                          <span style={styles.zero}>—</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum, color: '#2D5F5D', fontWeight: 600 }}>
                        {formatPrice(cat.avgPrice)}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>
                        {cat.venueCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
    gap: 10,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  summaryBar: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '10px 18px',
    display: 'flex',
    alignItems: 'center',
  },
  summaryText: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 14,
    color: '#080810',
  },
  summaryDivider: {
    color: '#e8e6e1',
    fontWeight: 400,
    margin: '0 2px',
  },
  gapWarning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 18px',
    borderRadius: 12,
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    fontSize: 13,
    lineHeight: 1.5,
  },
  gapIcon: {
    fontSize: 15,
    lineHeight: 1.5,
    flexShrink: 0,
  },
  tableWrapper: {
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
  },
  th: {
    padding: '10px 14px',
    fontWeight: 600,
    fontSize: 11,
    color: '#7a7a7a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    textAlign: 'center' as const,
    background: '#f7f6f3',
    borderBottom: '1px solid #e8e6e1',
    whiteSpace: 'nowrap' as const,
  },
  thLeft: {
    textAlign: 'left' as const,
  },
  td: {
    padding: '10px 14px',
    borderBottom: '1px solid #f0eeeb',
    verticalAlign: 'middle' as const,
  },
  tdCategory: {
    fontWeight: 600,
    color: '#080810',
    fontSize: 13,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdNum: {
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#080810',
  },
  rowEven: {
    background: '#fff',
  },
  rowOdd: {
    background: '#fafaf9',
  },
  countChip: {
    display: 'inline-block',
    background: '#f0eeeb',
    color: '#080810',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 10px',
    lineHeight: 1.5,
    minWidth: 28,
    textAlign: 'center' as const,
  },
  chipUpcoming: {
    background: '#dbeafe',
    color: '#1d4ed8',
  },
  chipDraft: {
    background: '#fef3c7',
    color: '#b45309',
  },
  chipPublished: {
    background: '#dcfce7',
    color: '#15803d',
  },
  zero: {
    color: '#d1d5db',
    fontSize: 14,
  },
  uncategorised: {
    color: '#9ca3af',
    fontStyle: 'italic',
    fontWeight: 400,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 18px',
    borderRadius: 12,
    background: '#fef2f2',
    border: '1px solid #fecaca',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
    flex: 1,
  },
  retryButton: {
    background: 'none',
    border: '1px solid #E2725B',
    borderRadius: 8,
    color: '#E2725B',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 14px',
    fontFamily: 'inherit',
  },
  emptyState: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center' as const,
    padding: '24px 0',
    fontStyle: 'italic',
  },
};
