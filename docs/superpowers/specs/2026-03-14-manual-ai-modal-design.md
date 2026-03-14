# Manual AI Prompt Modal + Tabbed Right Panel

**Date:** 2026-03-14
**Status:** Draft

---

## Problem

The Claude bridge automates Claude.ai via DOM manipulation (clipboard paste, ProseMirror injection, response polling). It breaks when Claude.ai updates their UI, has timing issues that cause missed responses, and only works in Electron mode.

## Solution

Replace all automated AI bridge interactions with a manual copy-paste modal. Users copy a prompt into any AI, paste the response back. Restructure the right panel into tabs (Automation | Claude).

---

## AiPromptModal Component

**New file:** `client/src/components/AiPromptModal.tsx`

Shared modal used by all 7 AI features: SEO Optimize, Magic Fill, Event Score, Generate Ideas, Analytics Insights, Dashboard Suggestions, Photo Gen Prompt.

### Props

```typescript
interface AiPromptModalProps {
  title: string;           // e.g. "Optimize Event"
  prompt: string;          // The AI prompt to copy
  responseFormat: 'json' | 'text';  // Controls validation
  jsonExample?: string;    // Optional example showing expected shape
  onSubmit: (response: string) => void;
  onClose: () => void;
}
```

### Layout

1. Header with feature name
2. Readonly prompt area with "Copy" button (copies to clipboard, shows "Copied!" feedback)
3. Instruction text: "Paste this into any AI chat, then paste the response below"
4. Response textarea (large, monospace for JSON)
5. "Apply" button — if `responseFormat=json`, validates with `JSON.parse` before calling `onSubmit`; shows inline error if invalid
6. "Cancel" button

### Behavior

- Modal overlay with backdrop click to close
- Copy button uses `navigator.clipboard.writeText`
- JSON validation: `try JSON.parse`, show red error text below textarea if invalid
- On successful submit: calls `onSubmit(responseText)` and closes
- Works in both Electron and web-only mode — no `electronAPI` dependency

---

## Tabbed Right Panel

### electron/main.ts changes

**Current:** Right panel switches between `claudeView` and `automationView` by adding/removing child views.

**New:** Both views are always attached. A tab bar rendered in the React app switches between them.

- Both `claudeView` and `automationView` remain as `WebContentsView` instances
- Add IPC handler `panel:switch-tab` accepting `'automation' | 'claude'`
- On switch: set active view to full bounds; set inactive view to `{x: -9999, y: 0, width: 0, height: 0}`
- Tab bar rendered in `appView` (React), not in the panel views
- During automation operations: auto-switch to Automation tab
- Default tab: Claude

**Remove from `electron/main.ts`:**
- `claude-send-prompt` IPC handler (entire DOM automation block)
- `execute-in-claude-panel` IPC handler
- All ProseMirror / clipboard / response-polling code

### electron/preload.ts changes

- Remove: `sendPromptToClaude`
- Add: `switchPanelTab(tab: 'automation' | 'claude')`

---

## Frontend Integration Changes

Each feature currently calls `window.electronAPI.sendPromptToClaude(prompt)`. Replace with opening `AiPromptModal`.

### EventDetailPage.tsx

- **Optimize:** Open modal with optimize prompt; `onSubmit` runs `handleApplyOptimization` (existing balanced-brace JSON parser)
- **Magic Fill:** Open modal with magic-fill prompt; `onSubmit` runs existing form auto-fill logic
- **Score:** Open modal with score prompt; `onSubmit` runs existing score parser + `saveEventScore`

### InsightsPanel.tsx

- Open modal with insights prompt (`responseFormat='text'`); `onSubmit` sets insights state directly

### SuggestionsSection.tsx

- Open modal with suggestions prompt; `onSubmit` runs existing JSON array parser

### EventGeneratorPage.tsx

- Open modal with ideas prompt; `onSubmit` calls `storeIdeas` with parsed array

### Photo Gen Prompt

- Open modal with photo prompt (`responseFormat='text'`); instruction text says "Paste this into an image AI like Midjourney or DALL-E"
- No response needed — copy-only modal; `onSubmit` not required, just `onClose`

---

## Prompt Format Instructions

All prompt-composing functions must append explicit format instructions so the AI returns clean, parseable output without code fences or explanations.

**For JSON responses, append:**
```
Respond with ONLY the JSON object below. No markdown, no code fences, no explanation.
```

**For text responses, append:**
```
Respond with ONLY the analysis text. No preamble, no "here's my analysis" intro.
```

**Files to update:**

| File | Prompts |
|------|---------|
| `src/routes/optimize.ts` | `composeOptimizePrompt`, `composeMagicFillPrompt` |
| `src/routes/score.ts` | `composeScorePrompt` |
| `src/routes/generator.ts` | `composeClaudePrompt`, `composeIdeaGenerationPrompt` |
| `src/routes/analytics.ts` | insights prompt composition |

---

## Files Summary

| File | Action |
|------|--------|
| `client/src/components/AiPromptModal.tsx` | Create — shared modal component |
| `client/src/pages/EventDetailPage.tsx` | Edit — optimize, magic-fill, score use modal |
| `client/src/components/analytics/InsightsPanel.tsx` | Edit — use modal |
| `client/src/components/dashboard/SuggestionsSection.tsx` | Edit — use modal |
| `client/src/pages/EventGeneratorPage.tsx` | Edit — use modal |
| `electron/main.ts` | Edit — remove claude-send-prompt IPC, add panel tab switching |
| `electron/preload.ts` | Edit — remove sendPromptToClaude, add switchPanelTab |
| `src/routes/optimize.ts` | Edit — append format instructions |
| `src/routes/generator.ts` | Edit — append format instructions |
| `src/routes/score.ts` | Edit — append format instructions |
| `src/routes/analytics.ts` | Edit — append format instructions |

---

## Out of Scope

- No AI API keys or direct API calls — remains manual human-in-the-loop
- No removing the Claude webview panel — kept as a tab for manual use
- No changes to automation engine or platform scraping
- No new dependencies
