import type { ENSAgentRef, ENSNonConformity } from './evaluation/types';

export type NonConformityKind = 'measure' | 'configuration' | 'collection' | 'documentary';

const ORDER: Record<NonConformityKind, number> = { measure: 0, configuration: 1, collection: 2, documentary: 3 };

export interface GroupedNonConformity {
  key: string;
  kind: NonConformityKind;
  evidenceId?: string;
  requirementIds: string[];
  machines: ENSAgentRef[];
  source: ENSNonConformity;
}

const kindOf = (nc: ENSNonConformity): NonConformityKind => {
  if (nc.origin === 'MEDIDA') return 'measure';
  if (nc.cause === 'CONFIGURATION') return 'configuration';
  if (nc.cause === 'CATALOG' || !nc.evidenceIds.length) return 'documentary';
  return 'collection';
};

// The engine judges per machine, so the same failure arrives once per machine; the auditor reads
// one non-conformity per evidence (or documentary requirement) with the machines it affects.
export const groupNonConformities = (items: ENSNonConformity[]): GroupedNonConformity[] => {
  const groups = new Map<string, GroupedNonConformity>();
  for (const nc of items) {
    const kind = kindOf(nc);
    const requirementIds = nc.requirementIds?.length ? nc.requirementIds : [nc.requirementId];
    const key = [kind, nc.evidenceIds.join(','), requirementIds.join(',')].join('|');
    const group = groups.get(key) || { key, kind, evidenceId: nc.evidenceIds[0], requirementIds, machines: [], source: nc };
    for (const agent of nc.agents || []) {
      if (!group.machines.some(m => m.agentId === agent.agentId)) group.machines.push(agent);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.evidenceId || '').localeCompare(b.evidenceId || ''));
};
