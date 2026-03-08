import type { ScrapedEvent } from '@shared/types';

const PLATFORM_COLORS: Record<string, string> = {
  meetup: '#E2725B',
  eventbrite: '#F05537',
  headfirst: '#2D5F5D',
};

export function MarketDataTable({ events }: { events: ScrapedEvent[] }) {
  if (events.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>No market data yet — click "Analyse Market" to scan platforms.</p>
      </div>
    );
  }

  // Group by category
  const categories = new Map<string, number>();
  for (const e of events) {
    const cat = e.category ?? 'Other';
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  }
  const sortedCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {/* Category summary chips */}
      <div style={styles.chips}>
        {sortedCategories.map(([cat, count]) => (
          <span key={cat} style={styles.chip}>
            {cat} <span style={styles.chipCount}>{count}</span>
          </span>
        ))}
      </div>

      {/* Events table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Event</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Venue</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Price</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Attendees</th>
              <th style={styles.th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, i) => (
              <tr key={`${event.platform}-${i}`} style={styles.row}>
                <td style={styles.td}>
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                    title={event.title}
                  >
                    {event.title.length > 40
                      ? event.title.slice(0, 40) + '…'
                      : event.title}
                  </a>
                </td>
                <td style={styles.td}>{formatDate(event.date)}</td>
                <td style={styles.td}>{event.venue}</td>
                <td style={styles.td}>
                  <span style={styles.categoryBadge}>{event.category ?? '—'}</span>
                </td>
                <td style={styles.td}>{event.price ?? '—'}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                  {event.attendees ?? '—'}
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.platformBadge,
                      borderColor: PLATFORM_COLORS[event.platform] ?? '#888',
                      color: PLATFORM_COLORS[event.platform] ?? '#888',
                    }}
                  >
                    {event.platform}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={styles.summary}>
        {events.length} events across {categories.size} categories from{' '}
        {new Set(events.map((e) => e.platform)).size} platforms
      </p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    textAlign: 'center',
    padding: '48px 0',
  },
  emptyText: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  chips: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 20,
    background: '#f0ede8',
    fontSize: 12,
    fontWeight: 600,
    color: '#444',
  },
  chipCount: {
    background: '#E2725B',
    color: '#fff',
    borderRadius: '50%',
    width: 20,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 12,
    border: '1px solid #e8e6e1',
    background: '#fff',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '12px 14px',
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#888',
    borderBottom: '1px solid #e8e6e1',
    background: '#fafaf6',
    fontFamily: "'Outfit', sans-serif",
  },
  row: {
    borderBottom: '1px solid #f0ede8',
  },
  td: {
    padding: '10px 14px',
    color: '#333',
    whiteSpace: 'nowrap',
  },
  link: {
    color: '#2D5F5D',
    textDecoration: 'none',
    fontWeight: 600,
  },
  categoryBadge: {
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 8,
    background: '#f0ede8',
    fontWeight: 600,
    color: '#555',
  },
  platformBadge: {
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 8,
    border: '1.5px solid',
    fontWeight: 700,
    textTransform: 'capitalize',
  },
  summary: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    textAlign: 'right',
  },
};
