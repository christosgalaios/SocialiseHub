import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialiseEvent, Template, QueuedIdea } from '@shared/types';
import { getEvents, deleteEvent, duplicateEvent, getTemplates, createEventFromTemplate, pushAllEvents, getNextIdea, generateIdeasPrompt, storeIdeas, acceptIdea, getAllTags, getEventsCsvExportUrl, batchUpdateStatus, batchUpdateCategory, batchDeleteEvents, importEventsFromJson } from '../api/events';
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
  const [sortBy, setSortBy] = useState('start_time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [availableTags, setAvailableTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [currentIdea, setCurrentIdea] = useState<QueuedIdea | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [aiModal, setAiModal] = useState<{
    title: string; prompt: string;
    responseFormat: 'json' | 'text';
    onSubmit: (r: string) => void;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string>('draft');
  const [batchCategory, setBatchCategory] = useState<string>('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: string[] } | null>(null);
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
    setSelectedIds(new Set());
  }, [activeTab, tagFilter, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    getTemplates().then(data => { if (!cancelled) setTemplates(data); }).catch(() => {});
    getAllTags().then(data => { if (!cancelled) setAvailableTags(data); }).catch(() => {});
    return () => { cancelled = true; };
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
      // No queued ideas — open AI modal to generate
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  };

  const handleBatchStatus = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await batchUpdateStatus(Array.from(selectedIds), batchStatus);
      showToast(`Updated status for ${result.updated} event${result.updated !== 1 ? 's' : ''}`, 'success');
      setSelectedIds(new Set());
      setBatchStatus('draft');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch status update failed', 'error');
    }
  };

  const handleBatchCategory = async () => {
    if (selectedIds.size === 0 || !batchCategory.trim()) return;
    try {
      const result = await batchUpdateCategory(Array.from(selectedIds), batchCategory.trim());
      showToast(`Updated category for ${result.updated} event${result.updated !== 1 ? 's' : ''}`, 'success');
      setBatchCategory('');
      setSelectedIds(new Set());
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch category update failed', 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} event${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      const result = await batchDeleteEvents(Array.from(selectedIds));
      showToast(`Deleted ${result.deleted} event${result.deleted !== 1 ? 's' : ''}`, 'success');
      setSelectedIds(new Set());
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Batch delete failed', 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText((ev.target?.result as string) ?? '');
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(importText.trim());
      } catch {
        showToast('Invalid JSON — please check the format and try again', 'error');
        setImporting(false);
        return;
      }
      if (!Array.isArray(parsed)) {
        showToast('JSON must be an array of event objects', 'error');
        setImporting(false);
        return;
      }
      const result = await importEventsFromJson(parsed as Array<{ title: string; description?: string; start_time: string; venue?: string; price?: number; capacity?: number; category?: string }>);
      const errors = result.data
        .filter((r) => !r.success)
        .map((r) => `Event ${r.index + 1}: ${r.error ?? 'Unknown error'}`);
      setImportResult({ imported: result.imported, total: result.total, errors });
      if (result.imported > 0) {
        load();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setImportText('');
    setImportResult(null);
    setImporting(false);
  };

  const counts = {
    all: events.length,
    draft: events.filter((e) => e.status === 'draft').length,
    published: events.filter((e) => e.status === 'published' && !isPast(e)).length,
    past: events.filter((e) => isPast(e)).length,
  };

  // Derive unique categories from loaded events
  const categories = [...new Set(events.map((e) => e.category).filter(Boolean))].sort();

  const filtered = events.filter((e) => {
    if (activeTab === 'draft' && e.status !== 'draft') return false;
    if (activeTab === 'published' && (e.status !== 'published' || isPast(e))) return false;
    if (activeTab === 'past' && !isPast(e)) return false;
    if (categoryFilter && e.category !== categoryFilter) return false;
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
          <button
            style={styles.exportBtn as React.CSSProperties}
            onClick={() => { setShowImportModal(true); setImportResult(null); setImportText(''); }}
          >
            Import JSON
          </button>
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

      <div style={styles.searchRow}>
        <label style={styles.selectAllLabel}>
          <input
            type="checkbox"
            checked={filtered.length > 0 && selectedIds.size === filtered.length}
            ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', width: 16, height: 16 }}
          />
          {selectedIds.size > 0 && (
            <span style={styles.selectedCount}>{selectedIds.size} selected</span>
          )}
        </label>
        <input
          style={styles.searchInput}
          type="text"
          placeholder="Search events by title, description, or venue..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {categories.length > 0 && (
          <select
            style={styles.tagSelect}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {availableTags.length > 0 && (
          <select
            style={styles.tagSelect}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {availableTags.map((t) => (
              <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
            ))}
          </select>
        )}
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
        {(searchQuery || tagFilter || categoryFilter) && (
          <button style={styles.clearBtn} onClick={() => { setSearchQuery(''); setTagFilter(''); setCategoryFilter(''); }}>Clear</button>
        )}
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
            <div key={event.id} style={{ position: 'relative' }}>
              <div
                style={{
                  ...styles.cardCheckboxWrap,
                  ...(selectedIds.has(event.id) ? styles.cardCheckboxWrapSelected : {}),
                }}
                onClick={(e) => { e.stopPropagation(); toggleSelect(event.id); }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(event.id)}
                  onChange={() => toggleSelect(event.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#E2725B' }}
                />
              </div>
              <div style={selectedIds.has(event.id) ? styles.cardSelectedOutline : undefined}>
                <EventCard
                  event={event}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onPush={handlePush}
                  onOptimize={handleOptimize}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={styles.batchToolbar}>
          <span style={styles.batchCount}>{selectedIds.size} selected</span>
          <div style={styles.batchSeparator} />
          <div style={styles.batchGroup}>
            <select
              value={batchStatus}
              onChange={(e) => setBatchStatus(e.target.value)}
              style={styles.batchSelect}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button style={styles.batchActionBtn} onClick={handleBatchStatus}>
              Set Status
            </button>
          </div>
          <div style={styles.batchSeparator} />
          <div style={styles.batchGroup}>
            <input
              type="text"
              placeholder="Category name..."
              value={batchCategory}
              onChange={(e) => setBatchCategory(e.target.value)}
              style={styles.batchInput}
              maxLength={100}
            />
            <button
              style={{ ...styles.batchActionBtn, opacity: batchCategory.trim() ? 1 : 0.5 }}
              onClick={handleBatchCategory}
              disabled={!batchCategory.trim()}
            >
              Set Category
            </button>
          </div>
          <div style={styles.batchSeparator} />
          <button style={styles.batchDeleteBtn} onClick={handleBatchDelete}>
            Delete
          </button>
          <button style={styles.batchClearBtn} onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
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

      {showImportModal && (
        <div style={styles.modalOverlay} onClick={handleCloseImportModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Import Events from JSON</h2>
            <p style={styles.modalDesc}>
              Paste a JSON array of event objects, or upload a <code>.json</code> file. Each event must have a <code>title</code> and <code>start_time</code>.
            </p>

            {!importResult ? (
              <>
                <textarea
                  style={styles.importTextarea}
                  placeholder={'[\n  {\n    "title": "My Event",\n    "start_time": "2026-06-01T19:00:00",\n    "venue": "Bristol",\n    "description": "..."\n  }\n]'}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  disabled={importing}
                  spellCheck={false}
                />
                <div style={styles.importFileRow}>
                  <label style={styles.fileLabel}>
                    <input
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={handleImportFile}
                      disabled={importing}
                    />
                    Choose file
                  </label>
                  <span style={styles.fileHint}>or paste JSON above</span>
                </div>
                <div style={styles.modalActions}>
                  <button
                    style={styles.modalCancelBtn}
                    onClick={handleCloseImportModal}
                    disabled={importing}
                  >
                    Cancel
                  </button>
                  <button
                    style={{
                      ...styles.modalImportBtn,
                      opacity: importing || !importText.trim() ? 0.6 : 1,
                      cursor: importing || !importText.trim() ? 'not-allowed' : 'pointer',
                    }}
                    onClick={handleImport}
                    disabled={importing || !importText.trim()}
                  >
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </>
            ) : (
              <div style={styles.importResults}>
                <div style={styles.importResultsSummary}>
                  <span style={{ color: '#2D5F5D', fontWeight: 700 }}>
                    {importResult.imported} imported
                  </span>
                  {importResult.errors.length > 0 && (
                    <span style={{ color: '#E2725B', fontWeight: 700 }}>
                      {importResult.errors.length} failed
                    </span>
                  )}
                  <span style={{ color: '#7a7a7a' }}>
                    of {importResult.total} total
                  </span>
                </div>
                {importResult.errors.length > 0 && (
                  <div style={styles.importErrorList}>
                    {importResult.errors.map((err, i) => (
                      <div key={i} style={styles.importErrorItem}>{err}</div>
                    ))}
                  </div>
                )}
                <div style={styles.modalActions}>
                  <button
                    style={styles.modalCancelBtn}
                    onClick={handleCloseImportModal}
                  >
                    {importResult.imported > 0 ? 'Done' : 'Close'}
                  </button>
                  {importResult.errors.length > 0 && (
                    <button
                      style={styles.modalImportBtn}
                      onClick={() => setImportResult(null)}
                    >
                      Try again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
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
    paddingBottom: 80,
  },
  selectAllLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    flexShrink: 0,
  },
  selectedCount: {
    fontSize: 13,
    fontWeight: 600,
    color: '#E2725B',
    whiteSpace: 'nowrap' as const,
  },
  cardCheckboxWrap: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    zIndex: 10,
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 6,
    padding: '4px 5px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  cardCheckboxWrapSelected: {
    background: '#fdf3f1',
    boxShadow: '0 1px 4px rgba(226,114,91,0.25)',
  },
  cardSelectedOutline: {
    borderRadius: 16,
    outline: '2px solid #E2725B',
    outlineOffset: 2,
  },
  batchToolbar: {
    position: 'fixed' as const,
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#080810',
    color: '#fff',
    borderRadius: 16,
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 1000,
    flexWrap: 'wrap' as const,
    maxWidth: 'calc(100vw - 48px)',
  },
  batchCount: {
    fontSize: 13,
    fontWeight: 700,
    color: '#E2725B',
    whiteSpace: 'nowrap' as const,
  },
  batchSeparator: {
    width: 1,
    height: 24,
    background: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  batchGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  batchSelect: {
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    padding: '6px 10px',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  batchInput: {
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    padding: '6px 10px',
    fontFamily: 'inherit',
    width: 150,
    outline: 'none',
  },
  batchActionBtn: {
    background: '#2D5F5D',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  batchDeleteBtn: {
    background: '#E2725B',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  batchClearBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
};
