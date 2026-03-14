import type { CSSProperties } from 'react';

export interface TimingDataPoint {
  day_of_week: number;
  hour: number;
  event_count: number;
  avg_attendance: number;
}

interface Props {
  data: TimingDataPoint[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'rgba(59,130,246,0.05)';
  const intensity = Math.min(value / max, 1);
  return `rgba(59,130,246,${(0.1 + intensity * 0.85).toFixed(2)})`;
}

export function TimingHeatmap({ data }: Props) {
  // Build a lookup map: day_of_week × hour -> avg_attendance
  const lookup = new Map<string, number>();
  let max = 0;
  for (const d of data) {
    const key = `${d.day_of_week}-${d.hour}`;
    lookup.set(key, d.avg_attendance);
    if (d.avg_attendance > max) max = d.avg_attendance;
  }

  if (data.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
        No timing data available yet
      </div>
    );
  }

  const cellStyle: CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 4,
    cursor: 'default',
    transition: 'opacity 0.2s',
  };

  const hourLabels = [0, 6, 9, 12, 15, 18, 21];

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 4, marginLeft: 40 }}>
        {HOURS.map((h) => (
          <div
            key={h}
            style={{
              width: 28,
              textAlign: 'center',
              fontSize: 10,
              color: hourLabels.includes(h) ? '#888' : 'transparent',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {DAYS.map((day, dayIdx) => (
        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
          <div style={{ width: 36, fontSize: 12, color: '#888', textAlign: 'right', paddingRight: 4, flexShrink: 0 }}>
            {day}
          </div>
          {HOURS.map((hour) => {
            const value = lookup.get(`${dayIdx}-${hour}`) ?? 0;
            return (
              <div
                key={hour}
                style={{
                  ...cellStyle,
                  background: getColor(value, max),
                }}
                title={value > 0 ? `${day} ${hour}:00 — avg ${Math.round(value)} attendees` : `${day} ${hour}:00 — no data`}
              />
            );
          })}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: '#666', fontSize: 11 }}>
        <span>Low</span>
        {[0.05, 0.2, 0.4, 0.65, 0.9].map((opacity) => (
          <div
            key={opacity}
            style={{ width: 16, height: 16, borderRadius: 3, background: `rgba(59,130,246,${opacity})` }}
          />
        ))}
        <span>High</span>
      </div>
    </div>
  );
}
