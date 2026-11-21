import { reasonDoc, reasonDocText } from '../catalog/engine-messages';
import type { EngineMessage, ReasonDoc } from '../catalog/engine-messages';

export interface ReasonDisplay {
  doc: ReasonDoc;
  missingConfiguration: boolean;
  parameterId?: string;
  required?: { level: number; category: string };
}

const isMessage = (value: unknown): value is EngineMessage =>
  Boolean(value) && typeof value === 'object' && typeof (value as EngineMessage).code === 'string';

const docOf = (value: unknown): ReasonDoc | undefined => (isMessage(value) ? reasonDoc(value.code, value.args) : undefined);

const textDoc = (text: string): ReasonDoc => ({ inline: [{ kind: 'text', text }], lists: [] });

// The engine wraps some reasons to add context the table already shows: the machine on a
// configuration gap, the count and level on a counted evidence. The view shows that context
// as badges and the parameter panel, and keeps the inner reason as the sentence.
export const displayReason = (code?: string, args: Record<string, unknown> = {}, fallback = ''): ReasonDisplay => {
  const param = typeof args.param === 'string' ? args.param : undefined;

  switch (code) {
    case 'configuration.parameter_unset':
      return {
        doc: { inline: [{ kind: 'parameter', id: param || '' }, { kind: 'text', text: ' sin valor' }], lists: [] },
        missingConfiguration: true,
        parameterId: param,
      };
    case 'configuration.parameter_value':
    case 'configuration.parameter_gap':
    case 'configuration.gap':
      return { doc: docOf(args.detail) || textDoc(fallback), missingConfiguration: true, parameterId: param };
    case 'tally.meets_level':
    case 'tally.below_level':
      return {
        doc: docOf(args.detail) || textDoc(fallback),
        missingConfiguration: false,
        required: { level: Number(args.required), category: String(args.category ?? '') },
      };
  }

  return { doc: reasonDoc(code, args) || textDoc(fallback), missingConfiguration: false };
};

export const displayKey = (display: ReasonDisplay): string => reasonDocText(display.doc);
