import { normalizeAgentId } from '../agent-configuration';
import { getENSCatalogControl } from './catalog';

export type ENSExclusionAction = 'EXCLUDED' | 'INCLUDED';

export interface ENSExclusionChange {
  agentId: string;
  controlId: string;
  action: ENSExclusionAction;
  reason: string;
}

export interface ENSExclusionRecord extends ENSExclusionChange {
  user: string;
  date: string;
}

export interface ENSExclusionStatus {
  latest: ENSExclusionRecord | null;
  canChange: boolean;
}

export const MANAGER_AGENT_ID = '000';
export const EXCLUSION_REASON_MAX_LENGTH = 1000;

const ACTIONS: ENSExclusionAction[] = ['EXCLUDED', 'INCLUDED'];

export const parseExclusionTarget = (agentId: unknown, controlId: unknown): { agentId: string; controlId: string } | string => {
  const agent = normalizeAgentId(agentId);
  if (!/^\d{3,}$/.test(agent)) return 'Hace falta el identificador numérico del activo.';
  if (agent === MANAGER_AGENT_ID) return 'El manager de Wazuh no admite grupos, así que no se puede excluir.';

  const control = typeof controlId === 'string' ? controlId.trim() : '';
  if (!getENSCatalogControl(control)) return `El control ${control || '(vacío)'} no está en el catálogo.`;

  return { agentId: agent, controlId: control };
};

export const parseExclusionChange = (body: any): ENSExclusionChange | string => {
  const target = parseExclusionTarget(body?.agentId, body?.controlId);
  if (typeof target === 'string') return target;

  if (!ACTIONS.includes(body?.action)) return 'La acción debe ser EXCLUDED o INCLUDED.';

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return 'Hace falta un motivo.';
  if (reason.length > EXCLUSION_REASON_MAX_LENGTH) return `El motivo no puede pasar de ${EXCLUSION_REASON_MAX_LENGTH} caracteres.`;

  return { ...target, action: body.action, reason };
};
