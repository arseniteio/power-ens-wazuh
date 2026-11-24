import { ENGINE_CATALOG } from './engine-catalog';
import { MATURITY_LEVELS } from '../maturity/compliance-level';

export interface ENSExplanation {
  title: string;
  text: string;
}

// P-ATT is not a catalog parameter: every control reads it the same way.
const ATTESTATION: ENSExplanation = {
  title: 'P-ATT · Atestaciones documentales',
  text: 'Documentos que acreditan los requisitos sin evidencia técnica. Cada fila: requisito | referencia | enlace | fecha | responsable.',
};

export const explainParameter = (controlId: string | undefined, parameterId: string): ENSExplanation | undefined => {
  if (parameterId === 'P-ATT') return ATTESTATION;
  if (!controlId) return undefined;
  const parameter = ENGINE_CATALOG.find(entry => entry.control === controlId)?.parameters?.[parameterId];
  if (!parameter) return undefined;
  return { title: `${parameterId} · ${parameter.label || parameter.name}`, text: parameter.description || '' };
};

export const explainLevel = (level: number): ENSExplanation | undefined => {
  const entry = MATURITY_LEVELS.find(candidate => candidate.level === level);
  return entry && { title: `L${entry.level} · ${entry.name} · desde ${entry.percent} %`, text: entry.meaning };
};

export type ExplainedToken = { kind: 'text'; text: string } | { kind: 'parameter'; id: string } | { kind: 'level'; level: number; text: string };

const TOKEN = /\b(P-ATT|P-[0-9]{2}[A-Z]?)\b|\bL([0-5])\b/g;

export const explainedTokens = (text: string): ExplainedToken[] => {
  const out: ExplainedToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push(match[1] ? { kind: 'parameter', id: match[1] } : { kind: 'level', level: Number(match[2]), text: match[0] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
};
