import { useState, useEffect, useRef, useCallback } from 'react';
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
  deleteEvent,
  publishEvent,
  getServices,
  createTemplate,
  optimizeEvent,
  magicFill,
  autoFillPhotos,
  getEventPhotos,
  getEventScore,
  scoreEvent,
  saveEventScore,
  pushEvent,
  pushAllEvents,
  pullEvent,
  undoOptimize,
} from '../api/events';
import { AiPromptModal } from '../components/AiPromptModal';
import { PlatformSelector } from '../components/PlatformSelector';
import { PlatformSyncRow } from '../components/PlatformSyncRow';
import { StatusBadge } from '../components/StatusBadge';
import { ReadinessChecklist } from '../components/ReadinessChecklist';
import { OptimizePanel } from '../components/OptimizePanel';
import { ScorePanel } from '../components/ScorePanel';
import type { ScoreBreakdown, ScoreSuggestion } from '../components/ScorePanel';
import { PLATFORM_COLORS, PLATFORM_ORDER } from '../lib/platforms';
import { EventTags } from '../components/EventTags';
import { EventChecklist } from '../components/EventChecklist';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { useToast } from '../context/ToastContext';
import { ListSkeleton } from '../components/Skeleton';
import { loadSettings } from '../lib/settings';
import { checkEventReadiness, isReadyToPublish } from '../../../src/lib/event-readiness';
import { getEventConflicts, FieldConflict } from '../api/conflicts';

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
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictPlatforms, setConflictPlatforms] = useState<string[]>([]);
  const [conflictDetails, setConflictDetails] = useState<FieldConflict[]>([]);
  const [activePreviewPlatform, setActivePreviewPlatform] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [venue, setVenue] = useState('');
  const [price, setPrice] = useState(0);
  const [capacity, setCapacity] = useState(50);
  const [category, setCategory] = useState('');
  const [actualAttendance, setActualAttendance] = useState<number | undefined>(undefined);
  const [actualRevenue, setActualRevenue] = useState<number | undefined>(undefined);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformName[]>([]);

  // Extended platform fields
  const [shortDescription, setShortDescription] = useState('');
  const [doorsOpenTime, setDoorsOpenTime] = useState('');
  const [ageRestriction, setAgeRestriction] = useState('');
  const [eventType, setEventType] = useState<'in_person' | 'online' | 'hybrid'>('in_person');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [parkingInfo, setParkingInfo] = useState('');
  const [refundPolicy, setRefundPolicy] = useState('');
  const [allowGuests, setAllowGuests] = useState(0);
  const [rsvpOpen, setRsvpOpen] = useState('');
  const [rsvpClose, setRsvpClose] = useState('');

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
  const [aiModal, setAiModal] = useState<{
    title: string; prompt: string;
    responseFormat: 'json' | 'text';
    onSubmit: (response: string) => void;
  } | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const { showToast } = useToast();
  const [pushingPlatform, setPushingPlatform] = useState<string | null>(null);
  const [pullingPlatform, setPullingPlatform] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getServices().then(data => { if (!cancelled) setServices(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getEvent(id)
      .then((ev) => {
        if (cancelled) return;
        setEvent(ev);
        setTitle(ev.title);
        setDescription(ev.description);
        setStartTime(toDatetimeLocal(ev.start_time));
        setEndTime(toDatetimeLocal(ev.end_time));
        setDurationMinutes(ev.duration_minutes);
        setVenue(ev.venue);
        setPrice(ev.price);
        setCapacity(ev.capacity);
        setCategory(ev.category ?? '');
        setActualAttendance(ev.actual_attendance);
        setActualRevenue(ev.actual_revenue);
        setSelectedPlatforms(ev.platforms.map((p) => p.platform));
        setShortDescription((ev as any).short_description ?? '');
        setDoorsOpenTime(toDatetimeLocal((ev as any).doors_open_time));
        setAgeRestriction((ev as any).age_restriction ?? '');
        setEventType((ev as any).event_type ?? 'in_person');
        setOnlineUrl((ev as any).online_url ?? '');
        setParkingInfo((ev as any).parking_info ?? '');
        setRefundPolicy((ev as any).refund_policy ?? '');
        setAllowGuests((ev as any).allow_guests ?? 0);
        setRsvpOpen(toDatetimeLocal((ev as any).rsvp_open));
        setRsvpClose(toDatetimeLocal((ev as any).rsvp_close));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    if (id) {
      getEventConflicts(id)
        .then(res => {
          if (!cancelled) {
            setConflictCount(res.conflicts.length);
            setConflictDetails(res.conflicts);
            const platforms = [...new Set(res.conflicts.flatMap(c => c.platformValues.map(p => p.platform)))];
            setConflictPlatforms(platforms);
          }
        })
        .catch(() => {}); // silent — conflict check is non-critical
    }
    return () => { cancelled = true; };
  }, [id]);

  // Unsaved changes detection — warn before navigating away
  const isDirty = useCallback(() => {
    if (isNew) {
      // For new events, dirty if any content has been entered
      return !!(title.trim() || description.trim());
    }
    if (!event) return false;
    return (
      title !== event.title ||
      description !== event.description ||
      venue !== event.venue ||
      price !== event.price ||
      capacity !== event.capacity ||
      durationMinutes !== event.duration_minutes ||
      (category || '') !== (event.category ?? '') ||
      startTime !== toDatetimeLocal(event.start_time) ||
      endTime !== toDatetimeLocal(event.end_time) ||
      shortDescription !== ((event as any).short_description ?? '') ||
      doorsOpenTime !== toDatetimeLocal((event as any).doors_open_time) ||
      ageRestriction !== ((event as any).age_restriction ?? '') ||
      eventType !== ((event as any).event_type ?? 'in_person') ||
      onlineUrl !== ((event as any).online_url ?? '') ||
      parkingInfo !== ((event as any).parking_info ?? '') ||
      refundPolicy !== ((event as any).refund_policy ?? '') ||
      allowGuests !== ((event as any).allow_guests ?? 0) ||
      rsvpOpen !== toDatetimeLocal((event as any).rsvp_open) ||
      rsvpClose !== toDatetimeLocal((event as any).rsvp_close)
    );
  }, [event, isNew, title, description, venue, price, capacity, durationMinutes, category, startTime, endTime, shortDescription, doorsOpenTime, ageRestriction, eventType, onlineUrl, parkingInfo, refundPolicy, allowGuests, rsvpOpen, rsvpClose]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
  }, [id, loading, event]);

  /** Score — check cache first, compose prompt if miss, open modal, save result on submit */
  const handleScore = async () => {
    if (!id) return;
    setScoring(true);
    setError(null);
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
      // Open modal — onSubmit receives the pasted AI response
      setAiModal({
        title: 'Score Event',
        prompt,
        responseFormat: 'json',
        onSubmit: async (response: string) => {
          setAiModal(null);
          try {
            // Parse JSON — Claude should return raw JSON per prompt instructions
            let jsonStr: string | null = null;
            const fencedMatch = response.match(/```json\s*([\s\S]*?)```/);
            if (fencedMatch) {
              jsonStr = fencedMatch[1];
            } else {
              const startIdx = response.indexOf('{');
              if (startIdx !== -1) {
                let depth = 0;
                for (let i = startIdx; i < response.length; i++) {
                  if (response[i] === '{') depth++;
                  else if (response[i] === '}') depth--;
                  if (depth === 0) { jsonStr = response.slice(startIdx, i + 1); break; }
                }
              }
            }
            if (!jsonStr) {
              setError('Could not parse score JSON from response');
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
          }
        },
      });
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
    category: category || undefined,
    platforms: selectedPlatforms,
    short_description: shortDescription || undefined,
    doors_open_time: doorsOpenTime ? new Date(doorsOpenTime).toISOString() : undefined,
    age_restriction: ageRestriction || undefined,
    event_type: eventType,
    online_url: onlineUrl || undefined,
    parking_info: parkingInfo || undefined,
    refund_policy: refundPolicy || undefined,
    allow_guests: allowGuests,
    rsvp_open: rsvpOpen ? new Date(rsvpOpen).toISOString() : undefined,
    rsvp_close: rsvpClose ? new Date(rsvpClose).toISOString() : undefined,
  } as CreateEventInput);

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
        const updated = await updateEvent(id!, {
          ...buildInput(),
          actual_attendance: actualAttendance,
          actual_revenue: actualRevenue,
        } as CreateEventInput);
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
    try {
      const result = await optimizeEvent(id);
      setAiModal({
        title: 'SEO Optimization',
        prompt: result.prompt,
        responseFormat: 'json',
        onSubmit: (response: string) => {
          setAiModal(null);
          handleApplyOptimization(response);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  const handleUndoOptimize = async () => {
    if (!id) return;
    try {
      const restored = await undoOptimize(id);
      setEvent(restored);
      setTitle(restored.title);
      setDescription(restored.description);
      showToast('Optimization undone', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Undo failed', 'error');
    }
  };

  /** Magic fill — open modal with magic-fill prompt, apply JSON response */
  const handleMagicFill = async () => {
    if (!id) return;
    try {
      const { prompt } = await magicFill(id);
      setAiModal({
        title: 'Magic Fill',
        prompt,
        responseFormat: 'json',
        onSubmit: async (response: string) => {
          setAiModal(null);
          // Extract first JSON object from response
          const startIdx = response.indexOf('{');
          const endIdx = response.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            try {
              const optimized = JSON.parse(response.slice(startIdx, endIdx + 1));
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
        },
      });
      // Auto-fill photos in background (only if no photos exist yet)
      getEventPhotos(id).then(existing => {
        if (existing.length === 0) {
          autoFillPhotos(id).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Magic fill failed');
    }
  };

  /** Apply optimized values from AI JSON response */
  const handleApplyOptimization = (optimizeResponse: string) => {
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
        setError('Could not find JSON in response — apply changes manually');
        return;
      }
      const json = JSON.parse(jsonStr);
      if (json.title) setTitle(json.title);
      if (json.description) setDescription(json.description);
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
    setCategory(ev.category ?? '');
    setActualAttendance(ev.actual_attendance);
    setActualRevenue(ev.actual_revenue);
    setSelectedPlatforms(ev.platforms.map((p) => p.platform));
    setShortDescription((ev as any).short_description ?? '');
    setDoorsOpenTime(toDatetimeLocal((ev as any).doors_open_time));
    setAgeRestriction((ev as any).age_restriction ?? '');
    setEventType((ev as any).event_type ?? 'in_person');
    setOnlineUrl((ev as any).online_url ?? '');
    setParkingInfo((ev as any).parking_info ?? '');
    setRefundPolicy((ev as any).refund_policy ?? '');
    setAllowGuests((ev as any).allow_guests ?? 0);
    setRsvpOpen(toDatetimeLocal((ev as any).rsvp_open));
    setRsvpClose(toDatetimeLocal((ev as any).rsvp_close));
  };

  const handlePushPlatform = async (platform: string) => {
    if (!id) return;
    setPushingPlatform(platform);
    try {
      await pushEvent(id, platform);
      showToast(`Pushed to ${platform}`, 'success');
      await reloadEvent();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Operation failed', 'error');
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Operation failed', 'error');
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Operation failed', 'error');
    }
  };

  const handleDelete = async () => {
    if (!id || !event) return;
    if (!confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(id);
      showToast('Event deleted', 'success');
      nav('/events');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error');
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

  if (loading) return <ListSkeleton rows={6} />;

  // Full-page error when event failed to load (not new, no event data)
  if (!isNew && !event && error) {
    return (
      <div>
        <button onClick={() => nav('/')} style={styles.back}>
          ← Back to Dashboard
        </button>
        <div style={styles.loadError}>
          <p style={styles.loadErrorTitle}>Failed to load event</p>
          <p style={styles.loadErrorMsg}>{error}</p>
          <button style={styles.retryBtn} onClick={() => {
            setError(null);
            setLoading(true);
            getEvent(id!)
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
                setCategory(ev.category ?? '');
                setActualAttendance(ev.actual_attendance);
                setActualRevenue(ev.actual_revenue);
                setSelectedPlatforms(ev.platforms.map((p) => p.platform));
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Load failed'),
              )
              .finally(() => setLoading(false));
          }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => window.history.length > 1 ? nav(-1) : nav('/')} style={styles.back}>
        ← Back
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>
          {isNew ? 'Create Event' : event?.title ?? 'Event'}
        </h1>
        {event && <StatusBadge status={event.status} />}
        {event && !isNew && (
          <button onClick={handleDelete} style={styles.deleteBtn} title="Delete event">
            Delete
          </button>
        )}
      </div>

      {/* Platform preview tabs — always show all 3 in canonical order */}
      {event && !isNew && (
        <div style={styles.previewTabs}>
          <span style={{ fontSize: 12, color: '#888', fontWeight: 600, marginRight: 8 }}>Preview:</span>
          {PLATFORM_ORDER.map((platform) => {
            const ps = event.platforms.find((p) => p.platform === platform);
            const hasUrl = !!ps?.externalUrl;
            const isPublished = !!ps?.published;
            const color = PLATFORM_COLORS[platform] ?? '#888';
            const isActive = activePreviewPlatform === platform;
            return (
              <button
                key={platform}
                disabled={!hasUrl}
                title={hasUrl ? `View ${platform} listing` : isPublished ? `Published but no URL yet` : `Not on ${platform}`}
                style={{
                  ...styles.previewTab,
                  borderColor: isActive ? color : 'transparent',
                  color: isActive ? color : hasUrl ? '#555' : '#ccc',
                  background: isActive ? `${color}11` : 'transparent',
                  cursor: hasUrl ? 'pointer' : 'default',
                  opacity: hasUrl ? 1 : 0.35,
                }}
                onClick={() => {
                  if (!hasUrl || !ps?.externalUrl) return;
                  setActivePreviewPlatform(platform);
                  const api = (window as unknown as { electronAPI?: { switchPanelTab: (t: string) => Promise<void>; openInAutomationPanel: (url: string) => Promise<void> } }).electronAPI;
                  if (api?.openInAutomationPanel) {
                    api.switchPanelTab('automation');
                    api.openInAutomationPanel(ps.externalUrl);
                  } else {
                    window.open(ps.externalUrl, '_blank');
                  }
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 6, background: hasUrl ? color : '#ccc', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {platform.charAt(0).toUpperCase()}
                </span>
                <span style={{ textTransform: 'capitalize' }}>{platform}</span>
                {!isPublished && <span style={{ fontSize: 10, color: '#bbb' }}>--</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {conflictCount > 0 && !isNew && (
        <div style={styles.conflictBanner}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: conflictDetails.length ? 8 : 0 }}>
            <span style={{ fontWeight: 600 }}>{conflictCount} field conflict{conflictCount !== 1 ? 's' : ''} across {conflictPlatforms.join(', ')}</span>
            <button onClick={() => nav(`/conflicts/${id}`)} style={styles.conflictResolveBtn}>
              Resolve
            </button>
          </div>
          {conflictDetails.map(c => (
            <div key={c.field} style={{ fontSize: 13, padding: '4px 0', borderTop: '1px solid #f59e0b33' }}>
              <strong style={{ textTransform: 'capitalize' }}>{c.field}</strong>: Hub = <em>{c.hubValue ?? '(empty)'}</em>
              {c.platformValues.map(pv => (
                <span key={pv.platform}> · {pv.platform} = <em>{pv.value ?? '(empty)'}</em></span>
              ))}
            </div>
          ))}
        </div>
      )}

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
            <span style={styles.label}>Category</span>
            <select
              style={{ ...styles.input, cursor: 'pointer' }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category...</option>
              <option value="Social">Social</option>
              <option value="Tech">Tech</option>
              <option value="Food & Drink">Food & Drink</option>
              <option value="Arts">Arts</option>
              <option value="Wellness">Wellness</option>
              <option value="Comedy">Comedy</option>
              <option value="Business">Business</option>
              <option value="Outdoor">Outdoor</option>
              <option value="Music">Music</option>
              <option value="Sports">Sports</option>
              <option value="Education">Education</option>
              <option value="Networking">Networking</option>
              <option value="Other">Other</option>
            </select>
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
              onChange={(e) => {
                setEndTime(e.target.value);
                if (startTime && e.target.value) {
                  const diff = Math.round((new Date(e.target.value).getTime() - new Date(startTime).getTime()) / 60000);
                  if (diff > 0 && diff <= 1440) setDurationMinutes(diff);
                }
              }}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Duration (minutes)</span>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => {
                const mins = Number(e.target.value);
                setDurationMinutes(mins);
                if (startTime && mins > 0) {
                  const end = new Date(new Date(startTime).getTime() + mins * 60000);
                  setEndTime(toDatetimeLocal(end.toISOString()));
                }
              }}
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

        {!isNew && (actualAttendance != null || actualRevenue != null) && (
          <div style={styles.row}>
            {actualAttendance != null && (
              <div style={styles.field}>
                <span style={styles.label}>Actual Attendance</span>
                <span style={{ fontSize: 14, color: '#080810' }}>{actualAttendance}</span>
              </div>
            )}
            {actualRevenue != null && (
              <div style={styles.field}>
                <span style={styles.label}>Actual Revenue</span>
                <span style={{ fontSize: 14, color: '#080810' }}>£{actualRevenue.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <label style={styles.field}>
          <span style={styles.label}>Description</span>
          <textarea
            style={{ ...styles.input, minHeight: 250, resize: 'vertical' as const }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your event..."
            required
          />
          <span style={{
            fontSize: 11,
            color: description.length < 100 ? '#E2725B' : description.length < 250 ? '#f0a500' : '#2D9E6B',
            textAlign: 'right',
            marginTop: 2,
          }}>
            {description.length} chars{description.length < 100 ? ' (min 100 recommended)' : description.length < 250 ? ' (250+ for best score)' : ''}
          </span>
        </label>

        {/* Short Description — right under main description */}
        <label style={styles.field}>
          <span style={styles.label}>Short Description</span>
          <textarea
            style={{ ...styles.input, minHeight: 72, resize: 'vertical' as const }}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value.slice(0, 300))}
            placeholder="Brief summary for platforms like Eventbrite (max 300 chars)"
          />
          <span style={{
            fontSize: 11,
            color: shortDescription.length > 280 ? '#E2725B' : '#999',
            textAlign: 'right',
            marginTop: 2,
          }}>
            {shortDescription.length}/300
          </span>
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

        {!isNew && (
          <PlatformSelector
            selected={selectedPlatforms}
            onChange={setSelectedPlatforms}
            services={services}
            platformStatuses={event?.platforms}
          />
        )}

        {/* Platform Details */}
        <div style={styles.sectionDivider}>
          <span style={styles.sectionLabel}>Platform Details</span>
        </div>

        {/* Timing */}
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.label}>Doors Open Time (optional)</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={doorsOpenTime}
              onChange={(e) => setDoorsOpenTime(e.target.value)}
            />
          </label>
        </div>

        {/* Access */}
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>Age Restriction</span>
            <select
              style={{ ...styles.input, cursor: 'pointer' }}
              value={ageRestriction}
              onChange={(e) => setAgeRestriction(e.target.value)}
            >
              <option value="">Not specified</option>
              <option value="All ages">All ages</option>
              <option value="14+">14+</option>
              <option value="16+">16+</option>
              <option value="18+">18+</option>
              <option value="21+">21+</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Event Format</span>
            <select
              style={{ ...styles.input, cursor: 'pointer' }}
              value={eventType}
              onChange={(e) => setEventType(e.target.value as 'in_person' | 'online' | 'hybrid')}
            >
              <option value="in_person">In Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
        </div>

        {(eventType === 'online' || eventType === 'hybrid') && (
          <label style={styles.field}>
            <span style={styles.label}>Online URL</span>
            <input
              style={styles.input}
              type="url"
              value={onlineUrl}
              onChange={(e) => setOnlineUrl(e.target.value.slice(0, 500))}
              placeholder="https://..."
            />
          </label>
        )}

        {/* Policies */}
        <label style={styles.field}>
          <span style={styles.label}>Parking Info</span>
          <textarea
            style={{ ...styles.input, minHeight: 72, resize: 'vertical' as const }}
            value={parkingInfo}
            onChange={(e) => setParkingInfo(e.target.value.slice(0, 1000))}
            placeholder="Parking instructions for attendees"
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Refund Policy</span>
          <select
            style={{ ...styles.input, cursor: 'pointer' }}
            value={refundPolicy}
            onChange={(e) => setRefundPolicy(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="No refunds">No refunds</option>
            <option value="Refund up to 1 day before">Refund up to 1 day before</option>
            <option value="Refund up to 7 days before">Refund up to 7 days before</option>
            <option value="Refund up to 30 days before">Refund up to 30 days before</option>
            <option value="Full refund anytime">Full refund anytime</option>
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Max Guests Per Attendee (0 = no guests)</span>
          <input
            style={styles.input}
            type="number"
            min="0"
            max="5"
            value={allowGuests}
            onChange={(e) => setAllowGuests(Math.min(5, Math.max(0, Number(e.target.value))))}
          />
        </label>

        {/* Registration */}
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>RSVP Opens</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={rsvpOpen}
              onChange={(e) => setRsvpOpen(e.target.value)}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>RSVP Closes</span>
            <input
              style={styles.input}
              type="datetime-local"
              value={rsvpClose}
              onChange={(e) => setRsvpClose(e.target.value)}
            />
          </label>
        </div>

        <div style={styles.formActions}>
          <button type="submit" disabled={saving} style={{
            ...styles.saveBtn,
            ...(isDirty() && !isNew ? { boxShadow: '0 0 0 2px #f0a500' } : {}),
          }}>
            {saving ? 'Saving...' : isNew ? 'Create Event' : isDirty() ? 'Save Changes *' : 'Save Changes'}
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
              {!isNew && (
                <button
                  type="button"
                  style={styles.undoBtn}
                  onClick={handleUndoOptimize}
                >
                  Undo Optimize
                </button>
              )}
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

      {/* Tags & Checklist */}
      {!isNew && id && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: '1 1 280px', minWidth: 280 }}>
            <EventTags eventId={id} />
          </div>
          <div style={{ flex: '1 1 350px', minWidth: 350 }}>
            <EventChecklist eventId={id} />
          </div>
        </div>
      )}

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

      {/* Activity timeline */}
      {!isNew && id && <ActivityTimeline eventId={id} />}

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

      {/* Existing platforms status */}
      {event && event.platforms.length > 0 && (
        <div style={styles.publishSection}>
          <h2 style={styles.sectionTitle}>Platform Status</h2>
          <div>
            {[...event.platforms].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)).map((ps) => (
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
                  if (window.electronAPI?.openInAutomationPanel && ps.externalUrl) {
                    window.electronAPI.openInAutomationPanel(ps.externalUrl);
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
    marginBottom: 12,
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  previewTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    padding: '8px 0',
  },
  previewTab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    border: '2px solid transparent',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    transition: 'all 0.15s',
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
  loadError: {
    textAlign: 'center' as const,
    padding: '60px 24px',
  },
  loadErrorTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    color: '#080810',
    marginBottom: 8,
  },
  loadErrorMsg: {
    fontSize: 14,
    color: '#E2725B',
    marginBottom: 20,
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
  sectionDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#2D5F5D',
    fontFamily: "'Outfit', sans-serif",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    background: '#e6f4f1',
    padding: '4px 12px',
    borderRadius: 8,
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
  undoBtn: {
    padding: '12px 20px',
    borderRadius: 12,
    border: '1.5px solid #e8e6e1',
    background: '#fff',
    color: '#7a7a7a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Outfit', sans-serif",
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
  conflictBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 14,
    color: '#92400e',
  },
  conflictResolveBtn: {
    padding: '6px 16px',
    background: '#f59e0b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
