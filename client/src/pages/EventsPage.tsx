import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent, QueuedIdea } from '@shared/types';
import { getEvents, deleteEvent, duplicateEvent, pushAllEvents, getNextIdea, generateIdeasPrompt, storeIdeas, acceptIdea, getAllTags, getEventsCsvExportUrl, getMarketStatus } from '../api/events';
import { EventCard } from '../components/EventCard';
import { GridSkeleton } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { IdeaCardModal } from '../components/IdeaCardModal';
import { AiPromptModal } from '../components/AiPromptModal';

type FilterTab = 'all' | 'draft' | 'published' | 'past';

function isPast(event: SocialiseEvent): boolean {
  return new Date(event.start_time) < new Date();
}

export function EventsPage() {
  const [events, setEvents] = useState<SocialiseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [venueFilter, setVenueFilter] = useState('');
  const [sortBy, setSortBy] = useState('start_time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [availableTags, setAvailableTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [conflictCounts, setConflictCounts] = useState<Record<string, number>>({});
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [currentIdea, setCurrentIdea] = useState<QueuedIdea | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [aiModal, setAiModal] = useState<{
    title: string; prompt: string;
    responseFormat: 'json' | 'text';
    onSubmit: (r: string) => void;
  } | null>(null);
  const nav = useNavigate();
  const { showToast } = useToast();

  const load = async (signal?: { cancelled: boolean }) => {
    try {
      setLoading(true);
      setError(null);
      const filters: Record<string, string> = {};
      if (tagFilter) filters.tag = tagFilter;
      if (sortBy) filters.sort_by = sortBy;
      if (sortOrder) filters.order = sortOrder;
      const { data } = await getEvents(Object.keys(filters).length > 0 ? filters : undefined);
      if (signal?.cancelled) return;
      setEvents(data);
    } catch (err) {
      if (signal?.cancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [tagFilter, sortBy, sortOrder]);

  useEffect(() => {
    let cancelled = false;
    getAllTags().then(data => { if (!cancelled) setAvailableTags(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/conflicts')
      .then(r => r.json())
      .then(data => {
        const counts: Record<string, number> = {};
        for (const c of (data.data ?? data ?? [])) {
          counts[c.eventId] = c.conflictCount;
        }
        if (!cancelled) setConflictCounts(counts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [events]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      await deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      showToast('Event deleted', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  };


  const handlePush = async (id: string) => {
    try {
      await pushAllEvents(id);
      const { data } = await getEvents();
      setEvents(data);
      showToast('Event pushed successfully', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to push event');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateEvent(id);
      showToast('Event duplicated', 'success');
      nav(`/events/${copy.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to duplicate', 'error');
    }
  };

  const handleOptimize = (id: string) => {
    nav(`/events/${id}?optimize=true`);
  };

  const handleMagicNew = async () => {
    // Check market data exists before allowing idea generation
    try {
      const { hasData } = await getMarketStatus();
      if (!hasData) {
        showToast('Run Market Analysis first (Market page) before generating ideas', 'error');
        return;
      }
    } catch {
      showToast('Could not check market data — run Market Analysis first', 'error');
      return;
    }

    setShowIdeaModal(true);
    setIdeaLoading(true);
    setCurrentIdea(null);
    try {
      const { idea } = await getNextIdea();
      if (idea) {
        setCurrentIdea(idea);
        setIdeaLoading(false);
        return;
      }
      // No queued ideas — open AI modal to generate (market data is included in prompt)
      const { prompt } = await generateIdeasPrompt();
      setIdeaLoading(false);
      setShowIdeaModal(false);
      setAiModal({
        title: 'Generate Event Ideas',
        prompt,
        responseFormat: 'json',
        onSubmit: async (response) => {
          setAiModal(null);
          try {
            const startIdx = response.indexOf('[');
            const endIdx = response.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
              const ideas = JSON.parse(response.slice(startIdx, endIdx + 1));
              await storeIdeas(ideas);
              const { idea: nextIdea } = await getNextIdea();
              setCurrentIdea(nextIdea);
              setShowIdeaModal(true);
            }
          } catch {
            showToast('Failed to parse response — try again', 'error');
          }
        },
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load ideas', 'error');
      setShowIdeaModal(false);
    } finally {
      setIdeaLoading(false);
    }
  };

  const handleNextIdea = async () => {
    setIdeaLoading(true);
    setCurrentIdea(null);
    try {
      const { idea } = await getNextIdea();
      if (idea) {
        setCurrentIdea(idea);
      } else {
        // Queue exhausted — regenerate
        await handleMagicNew();
        return;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load next idea', 'error');
    } finally {
      setIdeaLoading(false);
    }
  };

  const handleAcceptIdea = async (ideaId: number) => {
    try {
      const { eventId } = await acceptIdea(ideaId);
      setShowIdeaModal(false);
      setCurrentIdea(null);
      nav(`/events/${eventId}?magic=true`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to accept idea', 'error');
    }
  };

  const counts = {
    all: events.length,
    draft: events.filter((e) => e.status === 'draft').length,
    published: events.filter((e) => e.status === 'published' && !isPast(e)).length,
    past: events.filter((e) => isPast(e)).length,
  };

  // Derive unique filter options from loaded events
  const categories = [...new Set(events.map((e) => e.category).filter(Boolean))].sort();
  const venues = [...new Set(events.map((e) => e.venue).filter(Boolean))].sort();
  const allPlatforms = [...new Set(events.flatMap((e) => e.platforms.map((p) => p.platform)))].sort();

  const hasActiveFilters = !!(searchQuery || tagFilter || categoryFilter || platformFilter.length || venueFilter);

  const filtered = events.filter((e) => {
    if (activeTab === 'draft' && e.status !== 'draft') return false;
    if (activeTab === 'published' && (e.status !== 'published' || isPast(e))) return false;
    if (activeTab === 'past' && !isPast(e)) return false;
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (venueFilter && e.venue !== venueFilter) return false;
    if (platformFilter.length > 0) {
      const eventPlatforms = e.platforms.map((p) => p.platform);
      if (!platformFilter.every((pf) => eventPlatforms.includes(pf as 'meetup' | 'eventbrite' | 'headfirst'))) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!e.title.toLowerCase().includes(q) &&
          !e.description?.toLowerCase().includes(q) &&
          !e.venue?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'published', label: 'Published' },
    { key: 'past', label: 'Past' },
  ];

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Events</h1>
          <p style={styles.subtitle}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a
            href={getEventsCsvExportUrl()}
            download
            style={styles.exportBtn}
          >
            Export CSV
          </a>
          {/* Templates removed */}
          <button style={styles.createBtn} onClick={() => nav('/events/new')}>
            + New Event
          </button>
          <button style={{ ...styles.createBtn, background: '#a855f7' }} onClick={handleMagicNew}>
            ✦ Magic
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span style={{
              ...styles.tabBadge,
              ...(activeTab === tab.key ? styles.tabBadgeActive : {}),
            }}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      <div style={styles.filterBar}>
        <div style={styles.searchRow}>
          <input
            style={styles.searchInput}
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            style={styles.tagSelect}
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [field, ord] = e.target.value.split(':');
              setSortBy(field);
              setSortOrder(ord as 'asc' | 'desc');
            }}
          >
            <option value="start_time:desc">Date (newest)</option>
            <option value="start_time:asc">Date (oldest)</option>
            <option value="title:asc">Title (A-Z)</option>
            <option value="title:desc">Title (Z-A)</option>
            <option value="created_at:desc">Created (newest)</option>
            <option value="price:desc">Price (high-low)</option>
            <option value="capacity:desc">Capacity (high-low)</option>
          </select>
          {hasActiveFilters && (
            <button style={styles.clearBtn} onClick={() => { setSearchQuery(''); setTagFilter(''); setCategoryFilter(''); setPlatformFilter([]); setVenueFilter(''); }}>
              Clear all
            </button>
          )}
        </div>

        <div style={styles.filterRow}>
          {/* Platform toggles */}
          {allPlatforms.length > 0 && (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Platform:</span>
              {allPlatforms.map((p) => {
                const active = platformFilter.includes(p);
                const color = p === 'meetup' ? '#f65858' : p === 'eventbrite' ? '#f05537' : '#2563eb';
                return (
                  <button
                    key={p}
                    style={{
                      ...styles.filterChip,
                      background: active ? `${color}18` : 'transparent',
                      borderColor: active ? color : '#ddd',
                      color: active ? color : '#666',
                    }}
                    onClick={() => setPlatformFilter((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                    )}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Category filter */}
          {categories.length > 0 && (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Category:</span>
              <select
                style={styles.tagSelect}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Venue filter */}
          {venues.length > 1 && (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Venue:</span>
              <select
                style={styles.tagSelect}
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
              >
                <option value="">All</option>
                {venues.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tags filter */}
          {availableTags.length > 0 && (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Tag:</span>
              <select
                style={styles.tagSelect}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All</option>
                {availableTags.map((t) => (
                  <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.retryBtn} onClick={load}>Retry</button>
        </div>
      )}

      {loading ? (
        <GridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No events found</p>
          <p style={styles.emptyDesc}>
            {activeTab === 'all'
              ? 'Create your first event to get started.'
              : `No ${activeTab} events.`}
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onPush={handlePush}
              conflictCount={conflictCounts[event.id]}
            />
          ))}
        </div>
      )}

      {showIdeaModal && (
        <IdeaCardModal
          idea={currentIdea}
          loading={ideaLoading}
          onAccept={handleAcceptIdea}
          onNext={handleNextIdea}
          onClose={() => { setShowIdeaModal(false); setCurrentIdea(null); }}
        />
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

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  filterChip: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'all 0.15s',
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '10px 16px',
    fontSize: 14,
    outline: 'none',
    background: '#fff',
    fontFamily: 'inherit',
  },
  tagSelect: {
    border: '1px solid #e8e6e1',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    background: '#fff',
    fontFamily: 'inherit',
    color: '#080810',
    minWidth: 130,
  },
  clearBtn: {
    background: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
    color: '#555',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  },
  templateBtn: {
    padding: '12px 24px',
    borderRadius: 12,
    border: '1.5px solid #2D5F5D',
    background: '#e6f4f1',
    color: '#2D5F5D',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  templateDropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: 8,
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e8e6e1',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: 240,
    zIndex: 100,
    overflow: 'hidden',
  },
  templateItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    padding: '12px 16px',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: 14,
    color: '#080810',
    borderBottom: '1px solid #f0eeeb',
    transition: 'background 0.1s',
  },
  exportBtn: {
    padding: '10px 16px',
    borderRadius: 12,
    border: '1.5px solid #e8e6e1',
    background: '#fff',
    color: '#7a7a7a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    textDecoration: 'none',
  },
  createBtn: {
    padding: '12px 24px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'transform 0.1s, box-shadow 0.2s',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 24,
    borderBottom: '1px solid #e8e6e1',
    paddingBottom: 0,
  },
  tab: {
    padding: '10px 16px',
    border: 'none',
    background: 'none',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    color: '#7a7a7a',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#080810',
    borderBottomColor: '#E2725B',
  },
  tabBadge: {
    fontSize: 12,
    fontWeight: 700,
    background: '#f0eeeb',
    color: '#7a7a7a',
    borderRadius: 10,
    padding: '2px 8px',
    minWidth: 20,
    textAlign: 'center' as const,
  },
  tabBadgeActive: {
    background: '#E2725B',
    color: '#fff',
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
    marginBottom: 20,
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
  loading: {
    color: '#7a7a7a',
    fontSize: 14,
  },
  empty: {
    textAlign: 'center' as const,
    padding: '80px 0',
  },
  emptyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    color: '#080810',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#7a7a7a',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
};
