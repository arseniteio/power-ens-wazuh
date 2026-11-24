import type { ENSConfigurationVersion, ENSLevel, ENSSystemType } from '../types';
import { normalizeAgentId } from '../../../agent-configuration';
import { compareENSControlIdsByAnnex, getENSCatalogControl } from '../../catalog';
import { getCollectedControls } from '../templates';
import { isAgentLevelParameter } from './parameter-classes';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

interface ENSAgentControl {
  controlId: string;
  controlName: string;
  level: ENSLevel;
  measured: boolean;
  reason?: string;
}

export const getAgentControls = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  agentId: string,
  type: ENSSystemType | undefined,
  getLevel: (controlId: string) => ENSLevel
): ENSAgentControl[] => {
  const manager = normalizeAgentId(agentId) === ENS_MANAGER_AGENT_ID;
  const plane = manager ? 'manager' : 'agent';
  const only = getCollectedControls(type);

  return [...configuration.controls]
    .sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId))
    .filter(control => control.parameters.some(parameter => isAgentLevelParameter(control.controlId, parameter.id)))
    .map(control => {
      const planes = getENSCatalogControl(control.controlId)?.measurementPlanes;
      const onPlane = (planes && planes.length ? planes : ['agent']).includes(plane);
      const collected = !only || only.includes(control.controlId);
      return {
        controlId: control.controlId,
        controlName: control.controlName,
        level: getLevel(control.controlId),
        measured: onPlane && collected,
        reason: !onPlane
          ? manager
            ? 'se evalúa en los activos, no en el manager'
            : 'se evalúa en el manager, con las filas de todos'
          : !collected
          ? 'sin recolector para su sistema'
          : undefined,
      };
    });
};
