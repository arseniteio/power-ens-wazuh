import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';

type ENSReportViewState =
  | { kind: 'error'; error: unknown }
  | { kind: 'loading' }
  | { kind: 'not-measured'; title: string; text: string; reason?: ENSNotMeasuredReason }
  | { kind: 'ready' };

interface ENSReportViewInput {
  controlId: string;
  agentId?: string;
  agentLabel?: string;
  error?: unknown;
  hasData: boolean;
  hasResult: boolean;
  notMeasured: () => ENSNotMeasuredReason | undefined;
}

export const reportViewState = (input: ENSReportViewInput): ENSReportViewState => {
  if (input.error) return { kind: 'error', error: input.error };
  if (!input.hasData) return { kind: 'loading' };
  if (!input.hasResult) {
    if (!input.agentId) {
      return {
        kind: 'not-measured',
        title: `${input.controlId} no tiene resultado en ningún activo`,
        text: 'Ningún activo del alcance mide este control.',
      };
    }
    const reason = input.notMeasured();
    return {
      kind: 'not-measured',
      title: `No se mide en ${input.agentLabel || input.agentId}`,
      text: reason?.text || `Sin resultado de ${input.controlId}.`,
      reason,
    };
  }
  return { kind: 'ready' };
};

export const canExportReport = (state: ENSReportViewState): boolean => state.kind === 'ready';
