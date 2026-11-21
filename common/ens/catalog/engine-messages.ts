import es from './messages/es.json';

const TEXTS: Record<string, string> = es as Record<string, string>;

export interface EngineMessage {
  code: string;
  args?: Record<string, unknown>;
}

// {name} renders the argument; {name#singular|plural} renders a count and the noun phrase that
// agrees with it. Same syntax as catalog/message.go in the engine.
const PLACEHOLDER = /\{([a-z_]+)(?:#([^|{}]*)\|([^{}]*))?\}/g;

const isMessage = (value: unknown): value is EngineMessage =>
  Boolean(value) && typeof value === 'object' && typeof (value as EngineMessage).code === 'string';

const argText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (isMessage(value)) return renderEngineMessage(value.code, value.args) ?? '';
  if (Array.isArray(value)) {
    return value.every(isMessage)
      ? value.map(item => renderEngineMessage(item.code, item.args) ?? '').join('; ')
      : value.map(String).join(', ');
  }
  return String(value);
};

const withNoun = (value: string, singular?: string, plural?: string): string =>
  singular === undefined ? value : `${value} ${value === '1' ? singular : plural}`;

export const renderEngineMessage = (code?: string, args?: Record<string, unknown>): string | undefined => {
  if (!code || TEXTS[code] === undefined) return undefined;
  return TEXTS[code]
    .replace(PLACEHOLDER, (_, name: string, singular?: string, plural?: string) => withNoun(argText(args?.[name]), singular, plural))
    .trim();
};

// A reason as structure instead of flat text: the sentence with its values marked, and every
// list argument kept whole so the view can show it as a list instead of a run-on line.
export type ReasonInline =
  | { kind: 'text'; text: string }
  | { kind: 'value'; text: string }
  | { kind: 'parameter'; id: string };

export interface ReasonList {
  items: ReasonDoc[];
}

export interface ReasonDoc {
  inline: ReasonInline[];
  lists: ReasonList[];
}

// Up to this many plain values read well inside the sentence; more go to a list below it.
const INLINE_VALUES = 3;

const PARAMETER = /\bP-[0-9A-Z]+\b/g;

const textWithParameters = (text: string, kind: 'text' | 'value'): ReasonInline[] => {
  const out: ReasonInline[] = [];
  let last = 0;
  for (const match of text.matchAll(PARAMETER)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind, text: text.slice(last, at) });
    out.push({ kind: 'parameter', id: match[0] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind, text: text.slice(last) });
  return out;
};

const plainDoc = (text: string): ReasonDoc => ({ inline: textWithParameters(text, 'value'), lists: [] });

const argDoc = (value: unknown): { inline: ReasonInline[]; lists: ReasonList[] } => {
  if (value === undefined || value === null || value === '') return { inline: [], lists: [] };
  if (isMessage(value)) return reasonDoc(value.code, value.args) ?? { inline: [], lists: [] };
  if (Array.isArray(value)) {
    const items = value.map(item => (isMessage(item) ? reasonDoc(item.code, item.args) ?? plainDoc(String(item.code)) : plainDoc(String(item))));
    const simple = items.every(item => item.lists.length === 0);
    if (simple && items.length <= INLINE_VALUES && value.every(item => !isMessage(item))) {
      return { inline: textWithParameters(value.map(String).join(', '), 'value'), lists: [] };
    }
    if (items.length === 1) return items[0];
    return { inline: [], lists: [{ items }] };
  }
  return { inline: textWithParameters(String(value), 'value'), lists: [] };
};

const trimEnd = (inline: ReasonInline[]): ReasonInline[] => {
  const out = [...inline];
  while (out.length) {
    const last = out[out.length - 1];
    if (last.kind !== 'text') break;
    const text = last.text.replace(/[\s:;,]+$/, '');
    if (text) {
      out[out.length - 1] = { kind: 'text', text };
      break;
    }
    out.pop();
  }
  return out;
};

export const reasonDoc = (code?: string, args?: Record<string, unknown>): ReasonDoc | undefined => {
  if (!code || TEXTS[code] === undefined) return undefined;
  const template = TEXTS[code];
  const inline: ReasonInline[] = [];
  const lists: ReasonList[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > last) inline.push(...textWithParameters(template.slice(last, at), 'text'));
    const [, name, singular, plural] = match;
    if (singular !== undefined) {
      inline.push({ kind: 'value', text: argText(args?.[name]) });
      inline.push({ kind: 'text', text: ` ${argText(args?.[name]) === '1' ? singular : plural}` });
    } else {
      const part = argDoc(args?.[name]);
      inline.push(...part.inline);
      lists.push(...part.lists);
    }
    last = at + match[0].length;
  }
  if (last < template.length) inline.push(...textWithParameters(template.slice(last), 'text'));
  return { inline: lists.length ? trimEnd(inline) : inline, lists };
};

export const reasonDocText = (doc: ReasonDoc): string =>
  [
    doc.inline.map(part => (part.kind === 'parameter' ? part.id : part.text)).join(''),
    ...doc.lists.flatMap(list => list.items.map(reasonDocText)),
  ]
    .filter(Boolean)
    .join('; ');
