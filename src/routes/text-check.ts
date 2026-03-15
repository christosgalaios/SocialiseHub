/**
 * Lightweight UK English text quality checker.
 * Flags common spelling, grammar, and style issues in event text.
 * Not a full spell checker — focuses on patterns that are embarrassing on published events.
 */

interface TextIssue {
  type: 'spelling' | 'grammar' | 'style';
  text: string;
  suggestion: string;
  context: string;
}

// US → UK spelling corrections
const US_TO_UK: [RegExp, string][] = [
  [/\borganize\b/gi, 'organise'],
  [/\borganized\b/gi, 'organised'],
  [/\borganizing\b/gi, 'organising'],
  [/\borganization\b/gi, 'organisation'],
  [/\brecognize\b/gi, 'recognise'],
  [/\brecognized\b/gi, 'recognised'],
  [/\bfavorite\b/gi, 'favourite'],
  [/\bfavor\b/gi, 'favour'],
  [/\bcolor\b/gi, 'colour'],
  [/\bhonor\b/gi, 'honour'],
  [/\bneighbor\b/gi, 'neighbour'],
  [/\bcenter\b/gi, 'centre'],
  [/\btheater\b/gi, 'theatre'],
  [/\bliter\b/gi, 'litre'],
  [/\bmeter\b/gi, 'metre'],
  [/\bdefense\b/gi, 'defence'],
  [/\blicense\b/gi, 'licence'],
  [/\bpractice\b(?=\s|$|[.,;!?])/gi, 'practise'], // verb form
  [/\bcatalog\b/gi, 'catalogue'],
  [/\banalyze\b/gi, 'analyse'],
  [/\banalyzed\b/gi, 'analysed'],
  [/\bcanceled\b/gi, 'cancelled'],
  [/\btraveled\b/gi, 'travelled'],
  [/\btraveling\b/gi, 'travelling'],
  [/\bfulfill\b/gi, 'fulfil'],
  [/\benroll\b/gi, 'enrol'],
  [/\bjewelry\b/gi, 'jewellery'],
  [/\bgray\b/gi, 'grey'],
  [/\bsocialization\b/gi, 'socialisation'],
  [/\bspecialization\b/gi, 'specialisation'],
  [/\bspecialize\b/gi, 'specialise'],
  [/\bspecialized\b/gi, 'specialised'],
  [/\bminimize\b/gi, 'minimise'],
  [/\bmaximize\b/gi, 'maximise'],
  [/\bcustomize\b/gi, 'customise'],
  [/\bprioritize\b/gi, 'prioritise'],
];

// Common misspellings
const COMMON_MISSPELLINGS: [RegExp, string][] = [
  [/\baccommodation\b/gi, 'accommodation'], // often misspelled with single m
  [/\baccamodation\b/gi, 'accommodation'],
  [/\baccomodation\b/gi, 'accommodation'],
  [/\bseperately?\b/gi, 'separately'],
  [/\boccured\b/gi, 'occurred'],
  [/\boccurance\b/gi, 'occurrence'],
  [/\brecieve\b/gi, 'receive'],
  [/\bdefinately\b/gi, 'definitely'],
  [/\bdefinate\b/gi, 'definite'],
  [/\bneccessary\b/gi, 'necessary'],
  [/\bneccesary\b/gi, 'necessary'],
  [/\buntill?\b/gi, 'until'],
  [/\bteh\b/gi, 'the'],
  [/\bwiht\b/gi, 'with'],
  [/\bthat's\b/g, "that's"], // curly → straight (not an error, skip)
  [/\bshedule\b/gi, 'schedule'],
  [/\bschedual\b/gi, 'schedule'],
  [/\bfeatruing\b/gi, 'featuring'],
  [/\bnetwoking\b/gi, 'networking'],
  [/\bsocailising\b/gi, 'socialising'],
  [/\bsocailizing\b/gi, 'socialising'],
  [/\bbussiness\b/gi, 'business'],
  [/\bbuisness\b/gi, 'business'],
  [/\brestaurant\b/gi, 'restaurant'], // often misspelled
  [/\brestarant\b/gi, 'restaurant'],
  [/\benviroment\b/gi, 'environment'],
  [/\benvirnoment\b/gi, 'environment'],
  [/\bexperiance\b/gi, 'experience'],
  [/\bregisteration\b/gi, 'registration'],
];

// Grammar patterns
const GRAMMAR_PATTERNS: [RegExp, string, string][] = [
  [/\byour\s+(welcome|invited|going)\b/gi, "you're $1", 'your → you\'re'],
  [/\bits\s+(a|an|the|going|been|not)\b/gi, "it's $1", 'its → it\'s'],
  [/\bthere\s+(is|are|will|was|were|has|have)\b.*\btheir\b/gi, '', ''], // skip complex
  [/\balot\b/gi, 'a lot', 'alot → a lot'],
  [/\bcould of\b/gi, 'could have', 'could of → could have'],
  [/\bwould of\b/gi, 'would have', 'would of → would have'],
  [/\bshould of\b/gi, 'should have', 'should of → should have'],
];

// Style issues
const STYLE_PATTERNS: [RegExp, string][] = [
  [/!!+/g, 'Multiple exclamation marks'],
  [/\?\?+/g, 'Multiple question marks'],
  [/\bFREE FREE\b/gi, 'Repeated word'],
  [/(.)\1{3,}/g, 'Repeated characters'],
];

export function checkText(text: string): TextIssue[] {
  if (!text || text.trim().length === 0) return [];

  const issues: TextIssue[] = [];

  // Check US → UK spellings
  for (const [pattern, replacement] of US_TO_UK) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      if (match[0].toLowerCase() !== replacement.toLowerCase()) {
        const start = Math.max(0, (match.index ?? 0) - 20);
        const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 20);
        issues.push({
          type: 'spelling',
          text: match[0],
          suggestion: replacement,
          context: text.slice(start, end).trim(),
        });
      }
    }
  }

  // Check common misspellings
  for (const [pattern, replacement] of COMMON_MISSPELLINGS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      if (match[0].toLowerCase() !== replacement.toLowerCase()) {
        const start = Math.max(0, (match.index ?? 0) - 20);
        const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 20);
        issues.push({
          type: 'spelling',
          text: match[0],
          suggestion: replacement,
          context: text.slice(start, end).trim(),
        });
      }
    }
  }

  // Check grammar patterns
  for (const [pattern, , label] of GRAMMAR_PATTERNS) {
    if (!label) continue;
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const start = Math.max(0, (match.index ?? 0) - 20);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 20);
      issues.push({
        type: 'grammar',
        text: match[0],
        suggestion: label,
        context: text.slice(start, end).trim(),
      });
    }
  }

  // Check style issues
  for (const [pattern, label] of STYLE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      issues.push({
        type: 'style',
        text: match[0],
        suggestion: label,
        context: '',
      });
    }
  }

  return issues;
}

/**
 * Check an event's title and description for text quality issues.
 * Returns a summary string if issues found, or null if clean.
 */
export function checkEventText(title: string, description: string | null): string | null {
  const titleIssues = checkText(title);
  const descIssues = checkText(description ?? '');
  const total = titleIssues.length + descIssues.length;
  if (total === 0) return null;

  const parts: string[] = [];
  if (titleIssues.length > 0) {
    parts.push(`title: ${titleIssues.map(i => `"${i.text}" → ${i.suggestion}`).join(', ')}`);
  }
  if (descIssues.length > 0) {
    const shown = descIssues.slice(0, 3);
    const summary = shown.map(i => `"${i.text}" → ${i.suggestion}`).join(', ');
    parts.push(`description: ${summary}${descIssues.length > 3 ? ` (+${descIssues.length - 3} more)` : ''}`);
  }
  return parts.join('; ');
}
