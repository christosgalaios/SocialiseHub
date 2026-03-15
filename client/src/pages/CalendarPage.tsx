import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent } from '@shared/types';
import { getEvents } from '../api/events';
import { ListSkeleton } from '../components/Skeleton';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isPast(date: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date < now;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#d4a017',
  published: '#2D5F5D',
  cancelled: '#999',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarPage() {
  const nav = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<SocialiseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popoverDay, setPopoverDay] = useState<number | null>(null);

  const load = (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    getEvents()
      .then(r => { if (!signal?.cancelled) setEvents(r.data); })
      .catch(err => { if (!signal?.cancelled) setError(err instanceof Error ? err.message : 'Failed to load events'); })
      .finally(() => { if (!signal?.cancelled) setLoading(false); });
  };

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, []);

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };
  const goPrev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const goNext = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  // Map day number -> events
  const eventsByDay = new Map<number, SocialiseEvent[]>();
  for (const evt of events) {
    const d = new Date(evt.start_time);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!eventsByDay.has(day)) eventsByDay.set(day, []);
      eventsByDay.get(day)!.push(evt);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const getEventColor = (evt: SocialiseEvent): string => {
    const d = new Date(evt.start_time);
    if (isPast(d)) return '#bbb';
    return STATUS_COLORS[evt.status] ?? '#888';
  };

  const handleDayClick = (day: number) => {
    const dayEvents = eventsByDay.get(day);
    if (dayEvents && dayEvents.length > 0) {
      setPopoverDay(popoverDay === day ? null : day);
    } else {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
      nav(`/events/new?date=${dateStr}`);
    }
  };

  const isToday = (day: number): boolean => isSameDay(new Date(year, month, day), today);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Calendar</h1>
        <div style={styles.nav}>
          <button style={styles.navBtn} onClick={goPrev}>&larr;</button>
          <button style={styles.todayBtn} onClick={goToday}>Today</button>
          <button style={styles.navBtn} onClick={goNext}>&rarr;</button>
        </div>
        <h2 style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</h2>
      </div>

      {/* Monthly summary */}
      {!loading && !error && (
        <div style={styles.summary}>
          {eventsByDay.size > 0 ? (
            <span>{Array.from(eventsByDay.values()).reduce((sum, evts) => sum + evts.length, 0)} event{Array.from(eventsByDay.values()).reduce((sum, evts) => sum + evts.length, 0) !== 1 ? 's' : ''} this month</span>
          ) : (
            <span>No events this month — click a day to create one</span>
          )}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.retryBtn} onClick={() => load()}>Retry</button>
        </div>
      ) : (
        <div style={styles.calendar}>
          {DAY_HEADERS.map((d) => (
            <div key={d} style={styles.dayHeader}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} style={styles.emptyCell} />;
            const dayEvents = eventsByDay.get(day) ?? [];
            const todayCell = isToday(day);
            return (
              <div
                key={day}
                style={{
                  ...styles.cell,
                  ...(todayCell ? styles.todayCell : {}),
                  cursor: 'pointer',
                }}
                onClick={() => handleDayClick(day)}
              >
                <span style={{ ...styles.dayNum, ...(todayCell ? styles.todayNum : {}) }}>
                  {day}
                </span>
                <div style={styles.dots}>
                  {dayEvents.slice(0, 3).map((evt) => (
                    <div
                      key={evt.id}
                      style={{
                        ...styles.eventChip,
                        background: getEventColor(evt),
                      }}
                      title={evt.title}
                    >
                      {evt.title.length > 12 ? evt.title.slice(0, 12) + '…' : evt.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <span style={styles.moreLabel}>+{dayEvents.length - 3} more</span>
                  )}
                </div>

                {/* Popover */}
                {popoverDay === day && dayEvents.length > 0 && (
                  <div style={styles.popover} onClick={(e) => e.stopPropagation()}>
                    {dayEvents.map((evt) => (
                      <button
                        key={evt.id}
                        style={styles.popoverItem}
                        onClick={() => nav(`/events/${evt.id}`)}
                      >
                        <span style={{ ...styles.popoverDot, background: getEventColor(evt) }} />
                        <div>
                          <div style={styles.popoverTitle}>{evt.title}</div>
                          <div style={styles.popoverMeta}>
                            {new Date(evt.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {evt.venue ? ` · ${evt.venue}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
    flexWrap: 'wrap' as const,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#080810',
  },
  nav: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  navBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid #e8e6e1',
    background: '#fff',
    fontSize: 16,
    cursor: 'pointer',
    fontWeight: 700,
    color: '#555',
  },
  todayBtn: {
    padding: '8px 16px',
    borderRadius: 10,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  monthLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: '#080810',
  },
  calendar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    border: '1px solid #e8e6e1',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#fff',
  },
  dayHeader: {
    padding: '10px 0',
    textAlign: 'center' as const,
    fontSize: 12,
    fontWeight: 700,
    color: '#7a7a7a',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    background: '#fafaf6',
    borderBottom: '1px solid #e8e6e1',
  },
  emptyCell: {
    minHeight: 90,
    borderBottom: '1px solid #f0eeeb',
    borderRight: '1px solid #f0eeeb',
    background: '#fafaf6',
  },
  cell: {
    minHeight: 90,
    padding: '6px 8px',
    borderBottom: '1px solid #f0eeeb',
    borderRight: '1px solid #f0eeeb',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    transition: 'background 0.1s',
  },
  todayCell: {
    background: '#fff8f6',
  },
  dayNum: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  todayNum: {
    background: '#E2725B',
    color: '#fff',
    borderRadius: '50%',
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
  },
  dots: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  eventChip: {
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  moreLabel: {
    fontSize: 10,
    color: '#7a7a7a',
    fontWeight: 600,
  },
  popover: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    zIndex: 50,
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e8e6e1',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: 220,
    padding: 4,
  },
  popoverItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left' as const,
    cursor: 'pointer',
    borderRadius: 8,
    fontSize: 13,
    transition: 'background 0.1s',
  },
  popoverDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  popoverTitle: {
    fontWeight: 600,
    color: '#080810',
    fontSize: 13,
  },
  popoverMeta: {
    fontSize: 11,
    color: '#7a7a7a',
  },
  summary: {
    fontSize: 14,
    color: '#7a7a7a',
    marginBottom: 16,
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    padding: '14px 20px',
    color: '#dc2626',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  retryBtn: {
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
};
