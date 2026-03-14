import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent, Template, QueuedIdea } from '@shared/types';
import { getEvents, deleteEvent, duplicateEvent, getTemplates, createEventFromTemplate, pushEvent, getNextIdea, generateIdeasPrompt, storeIdeas, acceptIdea } from '../api/events';
import { EventCard } from '../components/EventCard';
import { GridSkeleton } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { IdeaCardModal } from '../components/IdeaCardModal';

type FilterTab = 'all' | 'draft' | 'published' | 'past';

function isPast(event: SocialiseEvent): boolean {
  return new Date(event.start_time) < new Date();
}

export function EventsPage() {
  const [events, setEvents] = useState<SocialiseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [currentIdea, setCurrentIdea] = useState<QueuedIdea | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const nav = useNavigate();
  const { showToast } = useToast();

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEvents();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getTemplates().then(setTemplates).catch(() => {});
  }, []);

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

  const handleCreateFromTemplate = async (templateId: string) => {
    try {
      const event = await createEventFromTemplate(templateId);
      setShowTemplatePicker(false);
      showToast('Event created from template', 'success');
      nav(`/events/${event.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create from template', 'error');
    }
  };

  const handlePush = async (id: string, platform: string) => {
    try {
      await pushEvent(id, platform);
      const data = await getEvents();
      setEvents(data);
      showToast('Event pushed successfully', 'success');
    } catch (err: any) {
      setError(err.message);
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
      // No queued ideas — generate via Claude
      const { prompt } = await generateIdeasPrompt();
      const w = window as Window & { electronAPI?: { sendPromptToClaude: (p: string) => Promise<{ response?: string; error?: string }> } };
      if (w.electronAPI?.sendPromptToClaude) {
        const result = await w.electronAPI.sendPromptToClaude(prompt);
        if (result.response) {
          try {
            // Extract JSON array from response
            const startIdx = result.response.indexOf('[');
            const endIdx = result.response.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
              const ideas = JSON.parse(result.response.slice(startIdx, endIdx + 1));
              await storeIdeas(ideas);
            }
          } catch {
            // parse failed — silently continue
          }
          const { idea: nextIdea } = await getNextIdea();
          setCurrentIdea(nextIdea);
        }
      } else {
        // Fallback: copy prompt to clipboard and show paste-response UI
        await navigator.clipboard.writeText(prompt).catch(() => {});
        showToast('Prompt copied to clipboard — paste into Claude, copy the JSON response, then paste it back here', 'success');
        // Show a prompt asking user to paste Claude's response
        const response = window.prompt('Paste Claude\'s JSON response here (the array of event ideas):');
        if (response) {
          try {
            const startIdx = response.indexOf('[');
            const endIdx = response.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
              const ideas = JSON.parse(response.slice(startIdx, endIdx + 1));
              await storeIdeas(ideas);
              const { idea: nextIdea } = await getNextIdea();
              setCurrentIdea(nextIdea);
              return; // keep modal open with the idea
            }
          } catch {
            showToast('Failed to parse response — try again', 'error');
          }
        }
        setShowIdeaModal(false);
      }
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

  const filtered = events.filter((e) => {
    if (activeTab === 'draft') return e.status === 'draft';
    if (activeTab === 'published') return e.status === 'published' && !isPast(e);
    if (activeTab === 'past') return isPast(e);
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
        <div style={{ display: 'flex', gap: 10 }}>
          {templates.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                style={styles.templateBtn}
                onClick={() => setShowTemplatePicker(!showTemplatePicker)}
              >
                From Template
              </button>
              {showTemplatePicker && (
                <div style={styles.templateDropdown}>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      style={styles.templateItem}
                      onClick={() => handleCreateFromTemplate(t.id)}
                    >
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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

      {error && <div style={styles.error}>{error}</div>}

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
              onOptimize={handleOptimize}
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  error: {
    padding: '12px 16px',
    borderRadius: 12,
    background: '#fce8e6',
    color: '#E2725B',
    fontSize: 14,
    marginBottom: 20,
    fontWeight: 500,
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
