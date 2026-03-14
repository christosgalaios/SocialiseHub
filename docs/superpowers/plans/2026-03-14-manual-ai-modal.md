# Manual AI Prompt Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile Claude bridge automation with a manual copy-paste AI modal and add tabbed right panel.

**Architecture:** Single shared `AiPromptModal` component replaces all `sendPromptToClaude` calls. Each feature opens the modal with its prompt, user copies to any AI, pastes response back. Electron right panel gets Automation/Claude tabs.

**Tech Stack:** React 19, TypeScript, Electron 40 IPC

**Spec:** `docs/superpowers/specs/2026-03-14-manual-ai-modal-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/components/AiPromptModal.tsx` | Create | Shared modal: copy prompt, paste response, validate, submit |
| `client/src/pages/EventDetailPage.tsx` | Modify | Wire optimize/magic-fill/score to use modal |
| `client/src/components/analytics/InsightsPanel.tsx` | Modify | Wire insights to use modal |
| `client/src/components/dashboard/SuggestionsSection.tsx` | Modify | Wire suggestions to use modal |
| `client/src/pages/EventGeneratorPage.tsx` | Modify | Wire ideas generation to use modal |
| `electron/main.ts` | Modify | Remove claude-send-prompt IPC, add tabbed panel |
| `electron/preload.ts` | Modify | Remove sendPromptToClaude, add switchPanelTab |
| `src/routes/optimize.ts` | Modify | Append format instructions to prompts |
| `src/routes/generator.ts` | Modify | Append format instructions to prompts |
| `src/routes/score.ts` | Modify | Append format instructions to prompts |
| `src/routes/analytics.ts` | Modify | Append format instructions to prompts |

---

## Chunk 1: AiPromptModal Component + Prompt Format Updates

### Task 1: Create AiPromptModal component

**Files:**
- Create: `client/src/components/AiPromptModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// client/src/components/AiPromptModal.tsx
import { useState } from 'react';

interface AiPromptModalProps {
  title: string;
  prompt: string;
  responseFormat: 'json' | 'text';
  onSubmit: (response: string) => void;
  onClose: () => void;
}

export function AiPromptModal({ title, prompt, responseFormat, onSubmit, onClose }: AiPromptModalProps) {
  const [response, setResponse] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    const trimmed = response.trim();
    if (!trimmed) {
      setError('Paste the AI response above');
      return;
    }
    if (responseFormat === 'json') {
      try {
        JSON.parse(trimmed);
      } catch {
        setError('Invalid JSON — make sure you copied the full response');
        return;
      }
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-primary, #1a1a2e)', color: 'var(--text-primary, #e0e0e0)',
        borderRadius: 12, padding: 24, width: '90%', maxWidth: 700, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary, #999)',
            fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-secondary, #999)' }}>
          Copy this prompt into any AI chat, then paste the response below.
        </div>

        <div style={{ position: 'relative' }}>
          <pre style={{
            background: 'var(--bg-secondary, #16213e)', borderRadius: 8, padding: 12,
            fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', margin: 0, border: '1px solid var(--border, #2a2a4a)',
          }}>{prompt}</pre>
          <button onClick={handleCopy} style={{
            position: 'absolute', top: 8, right: 8, padding: '4px 12px',
            borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
            background: copied ? '#22c55e' : 'var(--accent, #6366f1)', color: '#fff',
          }}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>

        <textarea
          value={response}
          onChange={(e) => { setResponse(e.target.value); setError(null); }}
          placeholder={responseFormat === 'json' ? 'Paste JSON response here...' : 'Paste response here...'}
          style={{
            background: 'var(--bg-secondary, #16213e)', color: 'var(--text-primary, #e0e0e0)',
            border: error ? '1px solid #ef4444' : '1px solid var(--border, #2a2a4a)',
            borderRadius: 8, padding: 12, minHeight: 150, resize: 'vertical',
            fontFamily: responseFormat === 'json' ? 'monospace' : 'inherit', fontSize: 13,
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border, #2a2a4a)',
            background: 'transparent', color: 'var(--text-primary, #e0e0e0)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--accent, #6366f1)', color: '#fff', cursor: 'pointer',
          }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AiPromptModal.tsx
git commit -m "feat: add AiPromptModal component for manual AI copy-paste flow"
```

---

### Task 2: Update prompt format instructions in backend routes

**Files:**
- Modify: `src/routes/optimize.ts` — composeOptimizePrompt (~line 210), composeMagicFillPrompt (~line 250)
- Modify: `src/routes/score.ts` — composeScorePrompt (~line 198)
- Modify: `src/routes/generator.ts` — composeClaudePrompt (~line 272), composeIdeaGenerationPrompt (~line 347)
- Modify: `src/routes/analytics.ts` — insights prompt (~line 200)

All JSON-returning prompts must end with:
```
Respond with ONLY the JSON. No markdown code fences, no explanation, no preamble.
```

All text-returning prompts must end with:
```
Respond with ONLY the analysis text. No preamble, no "here's my analysis" intro.
```

- [ ] **Step 1: Update optimize.ts prompts**

Find the end of `composeOptimizePrompt` return string and ensure it ends with the JSON instruction.
Find the end of `composeMagicFillPrompt` return string — it already says "Return ONLY a JSON object" but add the "no markdown code fences" line if missing.

- [ ] **Step 2: Update score.ts prompt**

Find end of `composeScorePrompt` — it already says "Return ONLY valid JSON, no markdown fences" (line 177). Verify it's clear enough; no change needed if already explicit.

- [ ] **Step 3: Update generator.ts prompts**

Find ends of `composeClaudePrompt` and `composeIdeaGenerationPrompt`. Add the JSON instruction if missing.

- [ ] **Step 4: Update analytics.ts prompt**

Find end of insights prompt composition. Add the text instruction.

- [ ] **Step 5: Build and test**

Run: `npm run build:server && npx vitest run`
Expected: All tests pass, clean build

- [ ] **Step 6: Commit**

```bash
git add src/routes/optimize.ts src/routes/score.ts src/routes/generator.ts src/routes/analytics.ts
git commit -m "fix: add explicit format instructions to all AI prompts"
```

---

## Chunk 2: Wire Frontend Features to AiPromptModal

### Task 3: Wire EventDetailPage — Score, Optimize, Magic Fill

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx`

The current flow for each feature:
1. Call backend to get prompt
2. Send prompt via `window.electronAPI.sendPromptToClaude(prompt)`
3. Parse response and apply

New flow:
1. Call backend to get prompt
2. Set state: `aiModal = { title, prompt, responseFormat, onSubmit }`
3. AiPromptModal opens, user copies prompt, pastes response
4. onSubmit receives response string, existing parse+apply logic runs

- [ ] **Step 1: Add modal state and import**

At top of EventDetailPage, add:
```tsx
import { AiPromptModal } from '../components/AiPromptModal';
```

Add state:
```tsx
const [aiModal, setAiModal] = useState<{
  title: string; prompt: string;
  responseFormat: 'json' | 'text';
  onSubmit: (response: string) => void;
} | null>(null);
```

- [ ] **Step 2: Replace Score flow**

Find the score flow where `sendPromptToClaude` is called (~line 174). Replace with:
```tsx
setAiModal({
  title: 'Score Event',
  prompt: scorePrompt,
  responseFormat: 'json',
  onSubmit: (response) => {
    setAiModal(null);
    // existing parse logic from handleApplyScore (~lines 183-213)
    // parse JSON, call saveEventScore, update state
  },
});
```

- [ ] **Step 3: Replace Optimize flow**

Find `handleAutoOptimize` (~line 371) which calls `sendPromptToClaude`. Replace with:
```tsx
setAiModal({
  title: 'Optimize Event',
  prompt: optimizePrompt,
  responseFormat: 'json',
  onSubmit: (response) => {
    setAiModal(null);
    handleApplyOptimization(response); // existing function
  },
});
```

- [ ] **Step 4: Replace Magic Fill flow**

Find magic fill (~line 329) which calls `sendPromptToClaude`. Replace with:
```tsx
setAiModal({
  title: 'Magic Fill',
  prompt: magicFillPrompt,
  responseFormat: 'json',
  onSubmit: (response) => {
    setAiModal(null);
    // existing parse + auto-fill logic (~lines 335-361)
  },
});
```

- [ ] **Step 5: Render modal at bottom of component**

Before the closing fragment tag, add:
```tsx
{aiModal && (
  <AiPromptModal
    title={aiModal.title}
    prompt={aiModal.prompt}
    responseFormat={aiModal.responseFormat}
    onSubmit={aiModal.onSubmit}
    onClose={() => setAiModal(null)}
  />
)}
```

- [ ] **Step 6: Remove old "Send to Claude" button and modal sections**

Remove or replace the existing optimize modal that has the "Send to Claude" button (~lines 803-857). The AiPromptModal now handles this.

- [ ] **Step 7: Build and test**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "refactor: wire EventDetailPage AI features to AiPromptModal"
```

---

### Task 4: Wire InsightsPanel

**Files:**
- Modify: `client/src/components/analytics/InsightsPanel.tsx`

- [ ] **Step 1: Replace sendPromptToClaude with modal**

Import AiPromptModal. Add `aiModal` state. Replace the `sendPromptToClaude` call with:
```tsx
setAiModal({
  title: 'Analyze Performance',
  prompt,
  responseFormat: 'text',
  onSubmit: (response) => {
    setAiModal(null);
    setInsights(response);
  },
});
```

Render `{aiModal && <AiPromptModal ... />}` in the component.

Remove the clipboard fallback — the modal IS the universal flow now.

- [ ] **Step 2: Build and commit**

Run: `cd client && npx tsc --noEmit`

```bash
git add client/src/components/analytics/InsightsPanel.tsx
git commit -m "refactor: wire InsightsPanel to AiPromptModal"
```

---

### Task 5: Wire SuggestionsSection

**Files:**
- Modify: `client/src/components/dashboard/SuggestionsSection.tsx`

- [ ] **Step 1: Replace sendPromptToClaude with modal**

Same pattern: import AiPromptModal, add state, replace `sendPromptToClaude` call with `setAiModal(...)`.

The `onSubmit` callback runs the existing regex parsing logic (fenced JSON / bare array) and calls `storeSuggestions`.

- [ ] **Step 2: Build and commit**

```bash
git add client/src/components/dashboard/SuggestionsSection.tsx
git commit -m "refactor: wire SuggestionsSection to AiPromptModal"
```

---

### Task 6: Wire EventGeneratorPage

**Files:**
- Modify: `client/src/pages/EventGeneratorPage.tsx`

- [ ] **Step 1: Replace the manual copy+open flow with modal**

Currently this page shows a prompt review modal and a "Copy & Open Claude" button. Replace with AiPromptModal.

The `onSubmit` callback parses the JSON array and calls `storeIdeas(parsed)`, then refreshes the idea queue.

- [ ] **Step 2: Build and commit**

```bash
git add client/src/pages/EventGeneratorPage.tsx
git commit -m "refactor: wire EventGeneratorPage to AiPromptModal"
```

---

## Chunk 3: Tabbed Right Panel + Cleanup

### Task 7: Add tabbed right panel in Electron

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add panel tab IPC in main.ts**

Add new IPC handler:
```typescript
ipcMain.handle('panel:switch-tab', (_event, tab: 'automation' | 'claude') => {
  if (!mainWindow) return;
  const config = loadConfig();
  const panelWidth = config.claudePanelWidth ?? DEFAULT_PANEL_WIDTH;
  if (tab === 'automation') {
    showAutomationView(mainWindow, panelWidth);
  } else {
    hideAutomationView(mainWindow, config);
  }
});
```

- [ ] **Step 2: Add switchPanelTab to preload.ts**

```typescript
switchPanelTab: (tab: 'automation' | 'claude') => ipcRenderer.invoke('panel:switch-tab', tab),
```

- [ ] **Step 3: Remove claude-send-prompt IPC handler**

Delete the entire `claude-send-prompt` handler block (~lines 568-705 in main.ts).

- [ ] **Step 4: Remove execute-in-claude-panel IPC handler**

Delete this handler if it exists.

- [ ] **Step 5: Remove sendPromptToClaude from preload.ts**

Delete the `sendPromptToClaude` line from the contextBridge expose.

- [ ] **Step 6: Build electron**

Run: `npx tsc -p electron/tsconfig.json && npx tsc -p electron/tsconfig.preload.json`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "refactor: add tabbed panel switching, remove Claude bridge IPC"
```

---

### Task 8: Add panel tab UI in React sidebar

**Files:**
- Modify: `client/src/components/Sidebar.tsx` or wherever the sidebar/layout is

- [ ] **Step 1: Add tab switcher buttons**

Add two buttons at the bottom of the sidebar or in a panel header area:
- "Automation" tab — calls `window.electronAPI?.switchPanelTab('automation')`
- "Claude" tab — calls `window.electronAPI?.switchPanelTab('claude')`

Use active state styling to show which tab is selected.

- [ ] **Step 2: Build and commit**

```bash
git add client/src/components/Sidebar.tsx
git commit -m "feat: add Automation/Claude tab switcher to sidebar"
```

---

### Task 9: Final cleanup and verification

- [ ] **Step 1: Search for any remaining sendPromptToClaude references**

Run: `grep -r "sendPromptToClaude" client/ electron/ src/`
Expected: Zero matches

- [ ] **Step 2: Search for any remaining electronAPI.sendPromptToClaude**

Run: `grep -r "electronAPI.*sendPrompt\|electronAPI.*claude-send\|execute-in-claude" client/ electron/ src/`
Expected: Zero matches (except possibly type definitions)

- [ ] **Step 3: Full build**

Run: `npm run build:all`
Expected: Clean build

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit any cleanup**

```bash
git commit -m "chore: remove remaining Claude bridge references"
```

- [ ] **Step 6: Final commit and push**

```bash
git push
```
