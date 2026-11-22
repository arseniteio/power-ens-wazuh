import { loadENSAgentInventory } from '../../agents/load-agent-inventory';
import { normalizeInventory } from '../../../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import { getSelectedSystem, selectSystem } from '../../../common/ens/selected-system';
import { DEFAULT_ENS_SYSTEM, machinesOfSystem } from '../../../common/ens/systems';
import type { ENSSystemScope } from '../../../common/ens/systems';
import { fetchENSSystems } from './systems-client';

let systems: ENSSystemScope[] = [];

export const getKnownENSSystems = (): ENSSystemScope[] => systems;

// A system deleted from another session falls back to the default one instead of failing the load.
export const loadENSSystems = async (): Promise<ENSSystemScope[]> => {
  systems = await fetchENSSystems();
  if (!systems.some(system => system.id === getSelectedSystem())) selectSystem(DEFAULT_ENS_SYSTEM);
  return systems;
};

export const loadSystemAgentInventory = async (): Promise<ENSAgentScope[]> => {
  const inventory = normalizeInventory(await loadENSAgentInventory());
  return machinesOfSystem(getSelectedSystem(), inventory, inventory, systems);
};
