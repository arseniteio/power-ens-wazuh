import type { ENSAgentRef, ENSObservationGroup } from '../../../../common/ens/core/evaluation/types';

const MAX_VISIBLE_MOTIVES = 3;

const MAX_NAMED_MACHINES = 4;

const machineDisplayName = (agent: ENSAgentRef): string =>
  agent.agentName ? `${agent.agentName} (${agent.agentId})` : agent.agentId;

const listMachines = (agents: ENSAgentRef[]): string => {
  const names = agents.map(machineDisplayName);
  const visibleItems = names.slice(0, MAX_NAMED_MACHINES);
  const rest = names.length - visibleItems.length;

  return visibleItems.join(', ') + (rest > 0 ? ` y ${rest} más` : '');
};

export const describeScope = (
  agents: ENSAgentRef[],
  totalMachines: number,
): string | undefined => {
  if (agents.length === 0) {
    return undefined;
  }

  if (agents.length === 1) {
    return machineDisplayName(agents[0]);
  }

  return `${agents.length} activos${allLabel(
    agents,
    totalMachines,
  )}: ${listMachines(agents)}`;
};

const allLabel = (
  agents: ENSAgentRef[],
  totalMachines: number,
): string =>
  totalMachines > 0 && agents.length === totalMachines ? ' (todos)' : '';

export const machinesLabel = (
  agents: ENSAgentRef[],
  totalMachines: number,
): string =>
  agents.length === 1
    ? machineDisplayName(agents[0])
    : `${agents.length} activos${allLabel(agents, totalMachines)}`;

const sortMotives = (
  groups: ENSObservationGroup[],
): ENSObservationGroup[] =>
  [...groups].sort(
    (left, right) => right.agents.length - left.agents.length,
  );

interface MotiveSummary {
  visibles: ENSObservationGroup[];

  hidden: number;
}

export const summarizeMotives = (
  groups: ENSObservationGroup[],
): MotiveSummary => {
  const sorted = sortMotives(groups);
  const visibleItems = sorted.slice(0, MAX_VISIBLE_MOTIVES);

  return {
    visibles: visibleItems,
    hidden: sorted.length - visibleItems.length,
  };
};

export const compliantRequirementLabel = (requirement: {
  attested?: boolean;
}): string => (requirement.attested ? 'acreditado documentalmente' : 'cumple');
