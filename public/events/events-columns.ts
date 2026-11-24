import type { ENSAgentScope } from '../../common/ens/core/scope/types';
import { buildRawFactsFilters } from '../search/raw-facts-filters';

interface ENSEventColumn {
  id: string;
  label: string;
  initialWidth?: number;
}

export const ENS_EVENT_COLUMNS: ENSEventColumn[] = [
  { id: 'timestamp', label: 'Fecha', initialWidth: 190 },
  { id: 'agent.name', label: 'Activo', initialWidth: 150 },
  { id: 'data.power_ens', label: 'Control', initialWidth: 120 },
  { id: 'data.event', label: 'Hecho', initialWidth: 130 },
  { id: 'data.control', label: 'data.control', initialWidth: 140 },
  { id: 'data.requisito', label: 'Requisitos', initialWidth: 150 },
  { id: 'data.evidence_id', label: 'Evidencia', initialWidth: 110 },
  { id: 'data.evidencias', label: 'Evidencias', initialWidth: 150 },
  { id: 'data.estado', label: 'Estado', initialWidth: 110 },
  { id: 'data.nivel', label: 'Nivel', initialWidth: 90 },
  { id: 'rule.description', label: 'Descripción' },
  { id: 'rule.level', label: 'Nivel de regla', initialWidth: 90 },
  { id: 'rule.id', label: 'Regla', initialWidth: 90 },
];

export const buildEventsFilters = (agents: ENSAgentScope[], agentId?: string): unknown[] =>
  buildRawFactsFilters(agents, agentId);

export const getField = (source: any, route: string): string => {
  const value = route.split('.').reduce((o, k) => (o == null ? undefined : o[k]), source);
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
};

export const ENS_EVENTS_MAX_WINDOW = 10000;

export const navigableEventRows = (total: number): number =>
  Number.isFinite(total) && total > 0 ? Math.min(total, ENS_EVENTS_MAX_WINDOW) : 0;

export const pageIndexFor = (page: { key: string; index: number }, key: string): number =>
  page.key === key ? page.index : 0;
