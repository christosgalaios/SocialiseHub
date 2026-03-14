import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  SocialiseEvent,
  CreateEventInput,
  PlatformName,
  PublishResult,
  ServiceConnection,
} from '@shared/types';
import {
  getEvent,
  createEvent,
  updateEvent,
  publishEvent,
  getServices,
  createTemplate,
  optimizeEvent,
  magicFill,
  autoFillPhotos,
  getEventScore,
  scoreEvent,
  saveEventScore,
  pushEvent,
  pushAllEvents,
  pullEvent,
} from '../api/events';
import { PlatformSelector } from '../components/PlatformSelector';
import { PlatformSyncRow } from '../components/PlatformSyncRow';
import { StatusBadge } from '../components/StatusBadge';
import { ReadinessChecklist } from '../components/ReadinessChecklist';
import { OptimizePanel } from '../components/OptimizePanel';
import { ScorePanel } from '../components/ScorePanel';
import type { ScoreBreakdown, ScoreSuggestion } from '../components/ScorePanel';
import { PLATFORM_COLORS } from '../lib/platforms';
import { useToast } from '../context/ToastContext';
import { loadSettings } from '../lib/settings';
import { checkEventReadiness, isReadyToPublish } from '../../../src/lib/event-readiness';

function toDatetimeLocal(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    // Format as YYYY-MM-DDTHH:mm (local time)
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoStr;
  }
}

export function EventDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;

  const [event, setEvent] = useState<SocialiseEvent | null>(null);
  const [services, setServices] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [venue, setVenue] = useState('');
  const [price, setPrice] = useState(0);
  const [capacity, setCapacity] = useState(50);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformName[]>([]);

  // Pre-fill date from query param (calendar day click)
  const prefillDate = searchParams.get('date');
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (isNew && !defaultsApplied) {
      const settings = loadSettings();
      if (settings.defaultDuration) setDurationMinutes(settings.defaultDuration);
      if (settings.defaultPrice !== undefined) setPrice(settings.defaultPrice);
      if (settings.defaultVenue) setVenue(settings.defaultVenue);
      if (settings.defaultPlatforms.length) setSelectedPlatforms(settings.defaultPlatforms);
      if (prefillDate) setStartTime(`${prefillDate}T19:00`);
      setDefaultsApplied(true);
    }
  }, [isNew, prefillDate, defaultsApplied]);
  const [scoreData, setScoreData] = useState<{
    overall: number;
    breakdown: ScoreBreakdown;
    suggestions: ScoreSuggestion[];
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizePrompt, setOptimizePrompt] = useState<string | null>(null);
  const [optimizeResponse, setOptimizeResponse] = useState<string | null>(null);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeCopied, setOptimizeCopied] = useState(false);
  const [autoSending, setAutoSending] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const { showToast } = useToast();
  const [pushingPlatform, setPushingPlatform] = useState<string | null>(null);
  const [pullingPlatform, setPullingPlatform] = useState<string | null>(null);

  useEffect(() => {
    // Always load services for platform selector
    getServices().then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEvent(id)
      .then((ev) => {
        setEvent(ev);
        setTitle(ev.title);
        setDescription(ev.description);
        setStartTime(toDatetimeLocal(ev.start_time));
        setEndTime(toDatetimeLocal(ev.end_time));
        setDurationMinutes(ev.duration_minutes);
        setVenue(ev.venue);
        setPrice(ev.price);
        setCapacity(ev.capacity);
        setSelectedPlatforms(ev.platforms.map((p) => p.platform));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Load failed'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-trigger optimize if ?optimize=true or magic fill if ?magic=true
  const autoOptimizeTriggered = useRef(false);
  useEffect(() => {
    if (id && !loading && event && !autoOptimizeTriggered.current) {
      if (searchParams.get('optimize') === 'true') {
        autoOptimizeTriggered.current = true;
        handleOptimize();
      } else if (searchParams.get('magic') === 'true' && !isNew) {
        autoOptimizeTriggered.current = true;
        handleMagicFill();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading, event]);

  /** Score — check cache first, compose prompt if miss, send to Claude, save result */
  const handleScore = async () => {
    if (!id) return;
    setScoring(true);
    setError(null);
    const w = window as Window & { electronAPI?: { sendPromptToClaude: (p: string) => Promise<{ response?: string; error?: string }> } };
    try {
      // Check cache first
      const cached = await getEventScore(id);
      if (cached.score) {
        setScoreData({
          overall: cached.score.overall,
          breakdown: cached.score.breakdown,
          suggestions: cached.score.suggestions,
        });
        return;
      }
      // Compose prompt
      const { prompt } = await scoreEvent(id);
      // Send to Claude
      if (!w.electronAPI?.sendPromptToClaude) {
        setError('Claude bridge not available — run in Electron');
        return;
      }
      const result = await w.electronAPI.sendPromptToClaude(prompt);
      if (result.error) {
        setError(`Claude: ${result.error}`);
        return;
      }
      if (!result.response) {
        setError('No response from Claude');
        return;
      }
      // Parse JSON — Claude should return raw JSON per prompt instructions
      let jsonStr: string | null = null;
      const fencedMatch = result.response.match(/```json\s*([\s\S]*?)```/);
      if (fencedMatch) {
        jsonStr = fencedMatch[1];
      } else {
        const startIdx = result.response.indexOf('{');
        if (startIdx !== -1) {
          let depth = 0;
          for (let i = startIdx; i < result.response.length; i++) {
            if (result.response[i] === '{') depth++;
            else if (result.response[i] === '}') depth--;
            if (depth === 0) { jsonStr = result.response.slice(startIdx, i + 1); break; }
          }
        }
      }
      if (!jsonStr) {
        setError('Could not parse score JSON from Claude response');
        return;
      }
      const parsed = JSON.parse(jsonStr) as {
        overall: number;
        breakdown: ScoreBreakdown;
        suggestions: ScoreSuggestion[];
      };
      // Save to backend
      await saveEventScore(id, {
        overall: parsed.overall,
        breakdown: parsed.breakdown,
        suggestions: parsed.suggestions,
      });
      setScoreData(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setScoring(false);
    }
  };

  /** Apply a score suggestion — update local form state and clear score so user re-scores */
  const handleApplySuggestion = (field: string, value: string) => {
    if (field === 'title') setTitle(value);
    else if (field === 'description') setDescription(value);
    else if (field === 'venue') setVenue(value);
    // Clear score so user sees fresh state after change
    setScoreData(null);
    showToast(`Applied ${field} suggestion`, 'success');
  };

  const buildInput = (): CreateEventInput => ({
    title,
    description,
    start_time: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
    end_time: endTime ? new Date(endTime).toISOString() : undefined,
    duration_minutes: durationMinutes,
    venue,
    price,
    capacity,
    platforms: selectedPlatforms,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await createEvent(buildInput());
        showToast('Event created', 'success');
        nav(`/events/${created.id}`);
      } else {
        const updated = await updateEvent(id!, buildInput());
        setEvent(updated);
        showToast('Changes saved', 'success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id || selectedPlatforms.length === 0) return;
    setPublishing(true);
    setError(null);
    setPublishResults(null);
    try {
      const results = await publishEvent(id, selectedPlatforms);
      setPublishResults(results);
      const updated = await getEvent(id);
      setEvent(updated);
      const succeeded = results.filter(r => r.success).length;
      showToast(`Published to ${succeeded} platform${succeeded !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await createTemplate({
        name: templateName.trim(),
        title,
        description,
        venue,
        durationMinutes,
        price,
        capacity,
        platforms: selectedPlatforms,
      });
      setShowTemplateModal(false);
      setTemplateName('');
      showToast('Template saved', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const handleOptimize = async () => {
    if (!id) return;
    setOptimizing(true);
    setError(null);
    setOptimizeResponse(null);
    try {
      const result = await optimizeEvent(id);
      setOptimizePrompt(result.prompt);
      setShowOptimizeModal(true);
      setOptimizeCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  /** Magic fill — send magic-fill prompt to Claude and apply JSON response */
  const handleMagicFill = async () => {
    if (!id) return;
    const w = window as Window & { electronAPI?: { sendPromptToClaude: (p: string) => Promise<{ response?: string; error?: string }> } };
    try {
      const { prompt } = await magicFill(id);
      if (w.electronAPI?.sendPromptToClaude) {
        const result = await w.electronAPI.sendPromptToClaude(prompt);
        if (result.error) {
          setError(`Claude: ${result.error}`);
          return;
        }
        if (result.response) {
          // Extract first JSON object from response
          const startIdx = result.response.indexOf('{');
          const endIdx = result.response.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            try {
              const optimized = JSON.parse(result.response.slice(startIdx, endIdx + 1));
              if (optimized.title) setTitle(optimized.title);
              if (optimized.description) setDescription(optimized.description);
              if (optimized.venue) setVenue(optimized.venue);
              if (optimized.price !== undefined) setPrice(Number(optimized.price));
              if (optimized.capacity !== undefined) setCapacity(Number(optimized.capacity));
              if (optimized.duration_minutes !== undefined) setDurationMinutes(Number(optimized.duration_minutes));
              // Save the applied fields
              await updateEvent(id, {
                title: optimized.title ?? title,
                description: optimized.description ?? description,
                venue: optimized.venue ?? venue,
                price: optimized.price !== undefined ? Number(optimized.price) : price,
                capacity: optimized.capacity !== undefined ? Number(optimized.capacity) : capacity,
                duration_minutes: optimized.duration_minutes !== undefined ? Number(optimized.duration_minutes) : durationMinutes,
              });
              showToast('Magic fill applied', 'success');
            } catch {
              setError('Could not parse magic fill JSON');
            }
          }
        }
      }
      // Auto-fill photos in background
      autoFillPhotos(id).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Magic fill failed');
    }
  };

  /** Auto-send prompt to Claude panel and wait for response */
  const handleAutoOptimize = async () => {
    if (!optimizePrompt) return;
    const w = window as Window & { electronAPI?: { sendPromptToClaude: (p: string) => Promise<{ response?: string; error?: string }> } };
    if (!w.electronAPI?.sendPromptToClaude) {
      // Fallback to manual copy
      handleCopyOptimize();
      return;
    }
    setAutoSending(true);
    setError(null);
    try {
      const result = await w.electronAPI.sendPromptToClaude(optimizePrompt);
      if (result.error) {
        setError(`Claude: ${result.error}`);
      } else if (result.response) {
        setOptimizeResponse(result.response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-optimize failed');
    } finally {
      setAutoSending(false);
    }
  };

  /** Manual: copy prompt to clipboard and open Claude */
  const handleCopyOptimize = async () => {
    if (!optimizePrompt) return;
    try {
      const w = window as Window & { electronAPI?: { copyToClipboard: (t: string) => Promise<void>; focusClaudePanel: () => Promise<void> } };
      if (w.electronAPI?.copyToClipboard) {
        await w.electronAPI.copyToClipboard(optimizePrompt);
      } else {
        await navigator.clipboard.writeText(optimizePrompt);
      }
      setOptimizeCopied(true);
      if (w.electronAPI?.focusClaudePanel) {
        await w.electronAPI.focusClaudePanel();
      } else {
        window.open('https://claude.ai/new', '_blank');
      }
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  /** Apply optimized values from Claude's JSON response */
  const handleApplyOptimization = () => {
    if (!optimizeResponse) return;
    try {
      // Try fenced code block first (most reliable)
      const fencedMatch = optimizeResponse.match(/```json\s*([\s\S]*?)```/);
      let jsonStr: string | null = null;

      if (fencedMatch) {
        jsonStr = fencedMatch[1];
      } else {
        // Fallback: find first { that contains "title" and match to its closing }
        // Use a balanced brace counter instead of greedy regex
        const startIdx = optimizeResponse.indexOf('{');
        if (startIdx !== -1) {
          let depth = 0;
          for (let i = startIdx; i < optimizeResponse.length; i++) {
            if (optimizeResponse[i] === '{') depth++;
            else if (optimizeResponse[i] === '}') depth--;
            if (depth === 0) {
              const candidate = optimizeResponse.slice(startIdx, i + 1);
              if (candidate.includes('"title"')) jsonStr = candidate;
              break;
            }
          }
        }
      }

      if (!jsonStr) {
        setError('Could not find JSON in Claude response — apply changes manually');
        return;
      }
      const json = JSON.parse(jsonStr);
      if (json.title) setTitle(json.title);
      if (json.description) setDescription(json.description);
      setShowOptimizeModal(false);
    } catch {
      setError('Could not parse optimization JSON — apply changes manually');
    }
  };

  /** Reload event data and update all form state from fetched event */
  const reloadEvent = async () => {
    if (!id) return;
    const ev = await getEvent(id);
    setEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description);
    setStartTime(toDatetimeLocal(ev.start_time));
    setEndTime(toDatetimeLocal(ev.end_time));
    setDurationMinutes(ev.duration_minutes);
    setVenue(ev.venue);
    setPrice(ev.price);
    setCapacity(ev.capacity);
    setSelectedPlatforms(ev.platforms.map((p) => p.platform));
  };

  const handlePushPlatform = async (platform: string) => {
    if (!id) return;
    setPushingPlatform(platform);
    try {
      await pushEvent(id, platform);
      showToast(`Pushed to ${platform}`, 'success');
      await reloadEvent();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setPushingPlatform(null);
    }
  };

  const handlePullPlatform = async (platform: string) => {
    if (!id) return;
    setPullingPlatform(platform);
    try {
      await pullEvent(id, platform);
      showToast(`Reverted to ${platform} version`, 'success');
      await reloadEvent();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setPullingPlatform(null);
    }
  };

  const handlePushAll = async () => {
    if (!id) return;
    try {
      await pushAllEvents(id);
      showToast('Pushed to all platforms', 'success');
      await reloadEvent();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Build a SocialiseEvent-like object from current form state for readiness checking
  const currentFormEvent = {
    id: id ?? '',
    title,
    description,
    start_time: startTime ? new Date(startTime).toISOString() : '',
    duration_minutes: durationMinutes,
    venue,
    price,
    capacity,
    status: event?.status ?? 'draft' as const,
    platforms: event?.platforms ?? [],
    createdAt: event?.createdAt ?? '',
    updatedAt: event?.updatedAt ?? '',
  };
  const readinessChecks = checkEventReadiness(currentFormEvent);
  const canPublish = isReadyToPublish(readinessChecks);

  if (loading) return <p style={{ color: '#7a7a7a' }}>Loading...</p>;

  return (
    <div>
      <button onClick={() => nav('/')} style={styles.back}>
        ← Back to Dashboard
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>
          {isNew ? 'Create Event' : event?.title ?? 'Event'}
        </h1>
        {event && <StatusBadge status={event.status} />}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.twoCol}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>Title</span>
            <input
              style={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Venue</span>
            <input
              style={styles.input}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue name"
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Start Time</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>End Time (optional)</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Duration (minutes)</span>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              required
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Price (£)</span>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Capacity</span>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <label style={styles.field}>
          <span style={styles.label}>Description</span>
          <textarea
            style={{ ...styles.input, minHeight: 100, resize: 'vertical' as const }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your event..."
            required
          />
        </label>

        {/* Photos */}
        <div style={styles.field}>
          <label style={styles.label}>Photos</label>
          {id && !isNew ? (
            <OptimizePanel eventId={id} eventTitle={title} />
          ) : (
            <p style={{ color: '#999', fontSize: 13 }}>Save the event first to add photos</p>
          )}
        </div>

        <PlatformSelector
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
          services={services}
        />

        <div style={styles.formActions}>
          <button type="submit" disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving...' : isNew ? 'Create Event' : 'Save Changes'}
          </button>

          {!isNew && (
            <>
              <button
                type="button"
                style={styles.templateBtn}
                onClick={() => { setTemplateName(title); setShowTemplateModal(true); }}
              >
                Save as Template
              </button>
              <button
                type="button"
                disabled={optimizing}
                style={{
                  ...styles.optimizeBtn,
                  opacity: optimizing ? 0.7 : 1,
                }}
                onClick={handleOptimize}
              >
                {optimizing ? 'Analyzing...' : 'SEO Optimize'}
              </button>
              <button
                type="button"
                disabled={scoring}
                style={{
                  ...styles.scoreBtn,
                  opacity: scoring ? 0.7 : 1,
                }}
                onClick={handleScore}
              >
                {scoring ? 'Scoring...' : '📊 Score'}
              </button>
              {event?.sync_status === 'modified' && (
                <button
                  type="button"
                  style={styles.pushAllBtn}
                  onClick={handlePushAll}
                >
                  Push All →
                </button>
              )}
              <div style={{ position: 'relative', display: 'inline-block' }} title={!canPublish ? 'Complete all required fields before publishing' : ''}>
                <button
                  type="button"
                  disabled={publishing || selectedPlatforms.length === 0 || !canPublish}
                  style={{
                    ...styles.publishBtn,
                    opacity: publishing || selectedPlatforms.length === 0 || !canPublish ? 0.7 : 1,
                    cursor: !canPublish ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handlePublish}
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </>
          )}
        </div>
      </form>

      {!isNew && (
        <div style={styles.sidebar}>
          <ReadinessChecklist checks={readinessChecks} ready={canPublish} />
        </div>
      )}
      </div>

      {/* Score panel */}
      {scoreData && id && (
        <ScorePanel
          eventId={id}
          overall={scoreData.overall}
          breakdown={scoreData.breakdown}
          suggestions={scoreData.suggestions}
          onApply={handleApplySuggestion}
          onRescore={() => setScoreData(null)}
        />
      )}

      {/* Publish results panel */}
      {publishResults && publishResults.length > 0 && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Publish Results</h2>
          <div style={styles.resultsList}>
            {publishResults.map((r) => (
              <div key={r.platform} style={styles.resultRow}>
                <span
                  style={{
                    ...styles.platformDot,
                    background: PLATFORM_COLORS[r.platform] ?? '#888',
                  }}
                />
                <span style={styles.platformLabel}>
                  {r.platform.charAt(0).toUpperCase() + r.platform.slice(1)}
                </span>
                {r.success ? (
                  <span style={styles.successBadge}>Published</span>
                ) : (
                  <span style={styles.errorBadge}>{r.error ?? 'Failed'}</span>
                )}
                {r.externalId && (
                  <span style={styles.externalId}>ID: {r.externalId}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showTemplateModal && (
        <div style={styles.overlay} onClick={() => setShowTemplateModal(false)}>
          <div style={{ ...styles.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Save as Template</h2>
              <button style={styles.closeBtn} onClick={() => setShowTemplateModal(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 28px' }}>
              <label style={styles.field}>
                <span style={styles.label}>Template Name</span>
                <input
                  style={styles.input}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Weekly Social, Monthly Networking"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); }}
                />
              </label>
            </div>
            <div style={styles.modalFooter}>
              <div />
              <div style={styles.modalActions}>
                <button style={styles.secondaryBtn} onClick={() => setShowTemplateModal(false)}>Cancel</button>
                <button style={styles.sendBtn} onClick={handleSaveTemplate}>Save Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEO Optimize Modal */}
      {showOptimizeModal && optimizePrompt && (
        <div style={styles.overlay} onClick={() => setShowOptimizeModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {optimizeResponse ? 'Optimization Results' : 'SEO Optimization Prompt'}
              </h2>
              <button style={styles.closeBtn} onClick={() => setShowOptimizeModal(false)}>
                ✕
              </button>
            </div>
            <div style={styles.promptBox}>
              {optimizeResponse ? (
                <pre style={styles.promptText}>{optimizeResponse}</pre>
              ) : (
                <pre style={styles.promptText}>{optimizePrompt}</pre>
              )}
            </div>
            <div style={styles.modalFooter}>
              <p style={styles.modalHint}>
                {autoSending
                  ? 'Sending to Claude and waiting for response...'
                  : optimizeResponse
                    ? 'Review suggestions above, then apply to update your event'
                    : optimizeCopied
                      ? 'Copied! Paste into Claude and hit Enter.'
                      : 'Send to Claude automatically or copy the prompt manually'}
              </p>
              <div style={styles.modalActions}>
                <button style={styles.secondaryBtn} onClick={() => setShowOptimizeModal(false)}>
                  Cancel
                </button>
                {optimizeResponse ? (
                  <button style={styles.sendBtn} onClick={handleApplyOptimization}>
                    Apply Changes
                  </button>
                ) : (
                  <>
                    <button
                      style={styles.sendBtn}
                      onClick={handleAutoOptimize}
                      disabled={autoSending}
                    >
                      {autoSending ? 'Waiting for Claude...' : 'Send to Claude'}
                    </button>
                    <button style={styles.secondaryBtn} onClick={handleCopyOptimize}>
                      {optimizeCopied ? 'Copied' : 'Copy Manual'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing platforms status */}
      {event && event.platforms.length > 0 && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Platform Status</h2>
          <div>
            {event.platforms.map((ps) => (
              <PlatformSyncRow
                key={ps.platform}
                platform={ps.platform}
                published={ps.published}
                externalUrl={ps.externalUrl}
                syncStatus={ps.syncStatus}
                publishedAt={ps.publishedAt}
                onPush={() => handlePushPlatform(ps.platform)}
                onPull={() => handlePullPlatform(ps.platform)}
                onView={() => {
                  const w = window as any;
                  if (w.electronAPI?.openInAutomationPanel && ps.externalUrl) {
                    w.electronAPI.openInAutomationPanel(ps.externalUrl);
                  } else if (ps.externalUrl) {
                    window.open(ps.externalUrl, '_blank');
                  }
                }}
                pushing={pushingPlatform === ps.platform}
                pulling={pullingPlatform === ps.platform}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  back: {
    background: 'none',
    border: 'none',
    color: '#E2725B',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 20,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 26,
    fontWeight: 700,
    color: '#080810',
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
  twoCol: {
    display: 'flex',
    gap: 32,
    alignItems: 'flex-start',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 640,
    flex: 1,
  },
  sidebar: {
    width: 260,
    flexShrink: 0,
    position: 'sticky' as const,
    top: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    fontFamily: "'Outfit', sans-serif",
  },
  input: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #ddd',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    background: '#fff',
  },
  formActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  saveBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'background 0.2s, transform 0.1s',
  },
  templateBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: '1.5px solid #2D5F5D',
    background: '#e6f4f1',
    color: '#2D5F5D',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  optimizeBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: '1.5px solid #d4a017',
    background: '#fffbeb',
    color: '#92700c',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  scoreBtn: {
    padding: '12px 20px',
    borderRadius: 12,
    border: '1.5px solid #3d86c6',
    background: '#e8f2fb',
    color: '#1a5d9e',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  publishBtn: {
    padding: '12px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  pushAllBtn: {
    padding: '12px 20px',
    borderRadius: 12,
    border: 'none',
    background: '#E2725B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    transition: 'opacity 0.2s',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  },
  modal: {
    background: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 720,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 28px',
    borderBottom: '1px solid #e8e6e1',
  },
  modalTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: '#080810',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
  },
  promptBox: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 28px',
  },
  promptText: {
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.7,
    color: '#333',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  modalFooter: {
    padding: '16px 28px',
    borderTop: '1px solid #e8e6e1',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  modalHint: {
    fontSize: 12,
    color: '#7a7a7a',
    margin: 0,
    flex: 1,
  },
  modalActions: {
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  secondaryBtn: {
    padding: '10px 18px',
    borderRadius: 10,
    border: '1.5px solid #ddd',
    background: '#fff',
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: '#2D5F5D',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'nowrap',
  },
  publishSection: {
    marginTop: 40,
    paddingTop: 32,
    borderTop: '1px solid #e8e6e1',
    maxWidth: 640,
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
    color: '#080810',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e8e6e1',
    borderRadius: 10,
  },
  platformDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  platformLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#080810',
    flex: 1,
  },
  successBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: '#e6f4ea',
    color: '#1e7e34',
  },
  errorBadge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: '#fce8e6',
    color: '#c0392b',
  },
  viewPlatformBtn: {
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    background: '#2D5F5D',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    marginLeft: 'auto',
    fontFamily: "'Outfit', sans-serif",
    whiteSpace: 'nowrap',
  },
  externalId: {
    fontSize: 12,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  imagePreview: {
    marginTop: 8,
    maxWidth: '100%',
    maxHeight: 200,
    borderRadius: 12,
    objectFit: 'cover' as const,
    border: '1px solid #e8e6e1',
  },
};
