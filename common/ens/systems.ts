import type { ENSConfigurationScope } from './configuration/types';
import { resolveAgentsByConfigurationScope } from './core/scope/engine';
import type { ENSAgentScope } from './core/scope/types';

export const DEFAULT_ENS_SYSTEM = 'default';
export const DEFAULT_ENS_SYSTEM_NAME = 'Sistema principal';
export const ENS_MANAGER_AGENT_ID = '000';

const SYSTEM_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface ENSSystemSummary {
  id: string;
  name: string;
}

export interface ENSSystemScope extends ENSSystemSummary {
  scope?: ENSConfigurationScope;
}

export const isDefaultSystem = (system: string): boolean => system === DEFAULT_ENS_SYSTEM;

export const isValidSystemId = (value: string): boolean => SYSTEM_ID.test(value) && !isDefaultSystem(value);

export const systemOf = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ENS_SYSTEM;

export const configurationDocumentId = (system: string): string => (isDefaultSystem(system) ? 'active' : `system-${system}`);

// Verdicts and history written before ENS systems existed carry no system: they are the default system's.
export const systemFilter = (system: string, field = 'system') =>
  isDefaultSystem(system)
    ? {
        bool: {
          minimum_should_match: 1,
          should: [{ term: { [field]: DEFAULT_ENS_SYSTEM } }, { bool: { must_not: [{ exists: { field } }] } }],
        },
      }
    : { term: { [field]: system } };

export const describeSystemScopeIssue = (system: string, scope?: Partial<ENSConfigurationScope>): string | undefined => {
  if (isDefaultSystem(system)) return undefined;
  if (scope?.mode !== 'group' && scope?.mode !== 'agent') {
    return 'El alcance de un sistema distinto del principal tiene que indicar grupos o activos.';
  }
  return undefined;
};

export const sharedScopeGroups = (system: string, scope: ENSConfigurationScope | undefined, others: ENSSystemScope[]): string[] => {
  if (isDefaultSystem(system) || scope?.mode !== 'group') return [];
  const mine = new Set(scope.groupIds.map(group => group.trim().toLowerCase()).filter(Boolean));
  const shared = new Set<string>();
  for (const other of others) {
    if (other.id === system || isDefaultSystem(other.id) || other.scope?.mode !== 'group') continue;
    for (const group of other.scope.groupIds) {
      const name = group.trim().toLowerCase();
      if (mine.has(name)) shared.add(name);
    }
  }
  return [...shared].sort();
};

// Mirrors the engine: the systems other than the default claim their machines first and may not
// share one; the default takes the rest of its scope; the manager is judged in every system.
export const machinesOfSystem = (system: string, inScope: ENSAgentScope[], inventory: ENSAgentScope[], systems: ENSSystemScope[]): ENSAgentScope[] => {
  const claims = new Map<string, string[]>();
  for (const other of systems) {
    if (isDefaultSystem(other.id) || !other.scope || describeSystemScopeIssue(other.id, other.scope)) continue;
    for (const agent of resolveAgentsByConfigurationScope(inventory, other.scope)) {
      claims.set(agent.id, [...(claims.get(agent.id) || []), other.id]);
    }
  }

  return inScope.filter(agent => {
    if (agent.id === ENS_MANAGER_AGENT_ID) return true;
    const claimedBy = claims.get(agent.id) || [];
    return isDefaultSystem(system) ? claimedBy.length === 0 : claimedBy.length === 1 && claimedBy[0] === system;
  });
};
