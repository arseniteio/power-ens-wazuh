import { dateTimeLabel } from '../../../common/ens/core/date-label';
import { exclusionGroupOf } from '../../../common/ens/core/scope/evaluable-groups';
import type { ENSExclusionRecord } from '../../../common/ens/exclusions';

export interface ExclusionNotice {
  reason: string;
  recordedBy?: string;
  pendingEngine: boolean;
}

export const describeExclusionNotice = (
  inGroup: boolean,
  latest: ENSExclusionRecord | null,
  verdictStatus: string | undefined
): ExclusionNotice | undefined => {
  if (!inGroup) return undefined;

  const pendingEngine = verdictStatus !== 'NO_APLICA';
  if (latest?.action !== 'EXCLUDED') {
    return { reason: 'Excluida desde Wazuh, sin motivo registrado.', pendingEngine };
  }

  return { reason: latest.reason, recordedBy: `${latest.user} · ${dateTimeLabel(latest.date)}`, pendingEngine };
};

export const describeExclusionEffect = (agentLabel: string, controlId: string, excluding: boolean): string =>
  excluding
    ? `${agentLabel} entra en el grupo ${exclusionGroupOf(controlId)} de Wazuh. En la próxima evaluación del motor, ${controlId} aparecerá como «No aplica» en este activo.`
    : `${agentLabel} sale del grupo ${exclusionGroupOf(controlId)} de Wazuh. El motor la vuelve a evaluar en ${controlId} en su próxima pasada.`;

export const ENGINE_PASS_NOTE = 'El motor evalúa cada 15 minutos.';
