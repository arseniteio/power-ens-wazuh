import { dateTimeLabel } from '../core/date-label';


const MOTIVE_STATUSES = ['CUMPLE', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA', 'PARCIAL'] as const;

export interface MotiveList {
  start: number;
  end: number;
  values: string[];
  more?: number;
}

export interface MotivePart {
  evidenceId?: string;
  status?: string;
  text: string;
  summary: string;
  detail: string;
  secondary?: string;
  list?: MotiveList;
  parameters: { id: string; label?: string }[];
  timestamps: string[];
}

export interface ParsedMotive {
  raw: string;
  machines?: string;
  policy?: { policyId: string; requirementId: string };
  question?: string;
  parts: MotivePart[];
  structured: boolean;
}

const knownPartsText = (parts: KnownReasonParts['parts']): string =>
  parts
    .map(p => `${p.evidenceId} ${p.status}: ${p.text}${p.secondary?.length ? `${p.text ? ' ' : ''}Además: ${p.secondary.join(' ')}` : ''}`)
    .join(' | ');

export interface KnownReasonParts {
  reason: string;
  parts: { evidenceId: string; status: string; text: string; secondary?: string[] }[];
}

const MACHINES = /^\[((?:\d+ (?:activos|máquinas): )?[^\]]+)\] /;
const BRIDGE = /^Resuelta por la política del control \(([^()]*)\), que mide esta evidencia junto a ([^\s:]+): /;
const QUESTION = 'Pregunta de auditoría: ';
const STATES = MOTIVE_STATUSES.join('|');
const HEAD = new RegExp(`^([A-Z]+-[\\w/.-]+) (${STATES}): `);
const SEPARATOR = new RegExp(` \\| (?=[A-Z]+-[\\w/.-]+ (?:${STATES}): )`, 'g');
const ALSO = 'Además: ';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/g;
const PARAMETER = /\b(P-\d{2})(?: \(([^()]+)\))?/g;
const SENTENCE_END = /[\p{Ll})»'"\d]\. (?=[\p{Lu}¿«])/u;

const firstSentence = (text: string): { summary: string; detail: string } => {
  const m = SENTENCE_END.exec(text);
  if (!m) return { summary: text, detail: '' };
  const cut = m.index + 2;
  return { summary: text.slice(0, cut), detail: text.slice(cut + 1) };
};

const MAX_VALUE_LENGTH = 160;

const findList = (text: string): MotiveList | undefined => {
  const firstSeparator = text.indexOf('; ');
  if (firstSeparator < 0) return undefined;
  const before = text.slice(0, firstSeparator);
  const candidates = [before.lastIndexOf(': ') + 2, before.lastIndexOf(' en ') + 4].filter(i => i > 1);
  const start = candidates.length ? Math.max(...candidates) : 0;
  const chunks = text.slice(start).split('; ');
  const lastChunk = chunks[chunks.length - 1];
  const withMore = /^(.*?) y (\d+) más/.exec(lastChunk);
  let lastValue: string;
  let more: number | undefined;
  if (withMore && withMore[1].length <= MAX_VALUE_LENGTH && !/\. |, /.test(withMore[1])) {
    lastValue = withMore[1];
    more = Number(withMore[2]);
  } else {
    const endMatch = /\. |, | \(| y |\.$/.exec(lastChunk);
    lastValue = endMatch ? lastChunk.slice(0, endMatch.index) : lastChunk;
  }
  const values = [...chunks.slice(0, -1), lastValue];
  if (values.length < 3 && more === undefined) return undefined;
  if (values.some(v => !v.trim() || v.length > MAX_VALUE_LENGTH || /\. [\p{Lu}]/u.test(v))) return undefined;
  const body = values.join('; ') + (more !== undefined ? ` y ${more} más` : '');
  return { start, end: start + body.length, values, ...(more !== undefined ? { more } : {}) };
};

const annotate = (text: string) => ({
  parameters: Array.from(
    new Map(Array.from(text.matchAll(PARAMETER)).map(m => [m[1], { id: m[1], ...(m[2] ? { label: m[2] } : {}) }])).values()
  ).reduce<{ id: string; label?: string }[]>((acc, p) => {
    const previous = acc.find(x => x.id === p.id);
    if (!previous) acc.push(p);
    else if (!previous.label && p.label) previous.label = p.label;
    return acc;
  }, []),
  timestamps: Array.from(new Set(text.match(ISO) || [])),
});

const part = (text: string, head?: { evidenceId: string; status: string }, secondary?: string): MotivePart => {
  const { summary, detail } = firstSentence(text);
  const list = findList(text);
  const notes = annotate(`${text}${secondary ? ` ${secondary}` : ''}`);
  return {
    ...(head ? { evidenceId: head.evidenceId, status: head.status } : {}),
    text: text,
    summary,
    detail,
    ...(secondary !== undefined ? { secondary } : {}),
    ...(list ? { list } : {}),
    ...notes,
  };
};

const splitAlso = (text: string): { principal: string; secondary?: string } => {
  if (text.startsWith(ALSO)) return { principal: '', secondary: text.slice(ALSO.length) };
  const i = text.indexOf(` ${ALSO}`, 1);
  return i < 0 ? { principal: text } : { principal: text.slice(0, i), secondary: text.slice(i + 1 + ALSO.length) };
};

const splitSegment = (segment: string): MotivePart => {
  const m = HEAD.exec(segment);
  const body = m ? segment.slice(m[0].length) : segment;
  const { principal, secondary } = splitAlso(body);
  return part(principal, m ? { evidenceId: m[1], status: m[2] } : undefined, secondary);
};

export const parseMotive = (raw: string, known: KnownReasonParts[] = []): ParsedMotive => {
  let rest = raw;
  let machines: string | undefined;
  let policy: ParsedMotive['policy'];
  let question: string | undefined;

  const machinesMatch = MACHINES.exec(rest);
  if (machinesMatch) {
    machines = machinesMatch[1];
    rest = rest.slice(machinesMatch[0].length);
  }
  const bridgeMatch = BRIDGE.exec(rest);
  if (bridgeMatch) {
    policy = { policyId: bridgeMatch[1], requirementId: bridgeMatch[2] };
    rest = rest.slice(bridgeMatch[0].length);
  }
  if (rest.startsWith(QUESTION)) {
    question = rest.slice(QUESTION.length);
    return { raw, ...(machines ? { machines } : {}), ...(policy ? { policy } : {}), question, parts: [], structured: false };
  }

  const knownParts = known.find(k => k.reason === rest && k.parts.length > 0 && knownPartsText(k.parts) === k.reason);
  if (knownParts) {
    return {
      raw,
      ...(machines ? { machines } : {}),
      ...(policy ? { policy } : {}),
      structured: true,
      parts: knownParts.parts.map(p => part(p.text, { evidenceId: p.evidenceId, status: p.status }, p.secondary?.length ? p.secondary.join(' ') : undefined)),
    };
  }

  const segments = rest.split(SEPARATOR);
  return {
    raw,
    ...(machines ? { machines } : {}),
    ...(policy ? { policy } : {}),
    structured: false,
    parts: segments.map(splitSegment),
  };
};

export const partToText = (p: Pick<MotivePart, 'evidenceId' | 'status' | 'text' | 'secondary'>): string =>
  `${p.evidenceId ? `${p.evidenceId} ${p.status}: ` : ''}${p.text}${
    p.secondary !== undefined ? `${p.text ? ' ' : ''}${ALSO}${p.secondary}` : ''
  }`;

export const guiltyPart = (parts: MotivePart[], evidenceIds: string[] = []): MotivePart | undefined =>
  parts.find(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && p.status === 'NO_CUMPLE') ||
  parts.find(p => p.evidenceId && evidenceIds.includes(p.evidenceId) && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
  parts.find(p => p.status === 'NO_CUMPLE') ||
  parts.find(p => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
  parts[0];

export const isGenericExpectation = (expected?: string, actual?: string): boolean =>
  Boolean(expected) &&
  new RegExp(`^[A-Z]+-[\\w/.-]+ CUMPLE( y [A-Z]+-[\\w/.-]+ CUMPLE)*$`).test(expected as string) &&
  (!actual || new RegExp(`^(${STATES})$`).test(actual));

export const describeAction = (requiredAction: string, guilty?: MotivePart): string => {
  if (!/^Corregir para alcanzar: [A-Z]+-[\w/.-]+ CUMPLE( y [A-Z]+-[\w/.-]+ CUMPLE)*\. Valor actual: [A-Z_]+\.$/.test(requiredAction)) {
    return requiredAction;
  }
  if (!guilty?.evidenceId) return requiredAction;
  return `Corregir ${guilty.evidenceId}${guilty.secondary ? ' y lo indicado en «Además»' : ''}.`;
};

export const splitTimestamps = (text: string): { text: string; iso?: string }[] => {
  const chunks: { text: string; iso?: string }[] = [];
  let since = 0;
  for (const m of text.matchAll(ISO)) {
    if (m.index! > since) chunks.push({ text: text.slice(since, m.index) });
    chunks.push({ text: m[0], iso: m[0] });
    since = m.index! + m[0].length;
  }
  if (since < text.length) chunks.push({ text: text.slice(since) });
  return chunks;
};

export const formatTimestamp = (iso: string): string => {
  return dateTimeLabel(iso) || iso;
};
