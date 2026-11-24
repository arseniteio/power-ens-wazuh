import type { ENSControlDefinition, ENSMeasurementPlane } from '../../catalog/types';
import type { ENSControlConfiguration } from '../../configuration/types';
import { toParameterListItems, toTableRowCells } from '../../configuration/services/parameter-value-validator';
import { ENSAgentScope } from './types';


export const ENS_MANAGER_AGENT_ID = '000';

const ENS_MANAGER_FALLBACK_NAME = 'Manager de Wazuh';

const DEFAULT_MEASUREMENT_PLANES: ENSMeasurementPlane[] = ['agent'];

type ENSMeasuredControl = Pick<ENSControlDefinition, 'measurementPlanes'>;

export const getControlMeasurementPlanes = (
  control: ENSMeasuredControl
): ENSMeasurementPlane[] =>
  control.measurementPlanes && control.measurementPlanes.length > 0
    ? control.measurementPlanes
    : DEFAULT_MEASUREMENT_PLANES;

export const isManagerAgentId = (agentId?: string): boolean =>
  typeof agentId === 'string' && agentId.trim() === ENS_MANAGER_AGENT_ID;

export const getAgentMeasurementPlane = (
  agentId: string
): ENSMeasurementPlane =>
  isManagerAgentId(agentId) ? 'manager' : 'agent';

const isControlMeasuredOnPlane = (
  control: ENSMeasuredControl,
  plane: ENSMeasurementPlane
): boolean => getControlMeasurementPlanes(control).includes(plane);

const isControlMeasuredOnAgent = (
  control: ENSMeasuredControl,
  agentId: string
): boolean =>
  isControlMeasuredOnPlane(control, getAgentMeasurementPlane(agentId));


type ENSScopedControl = Pick<ENSControlDefinition, 'scopeParameter'>;

const getDeclaredScopeAgentNames = (
  control: ENSScopedControl,
  configuration: ENSControlConfiguration | undefined
): string[] | undefined => {
  if (!control.scopeParameter) {
    return undefined;
  }

  const value = configuration?.parameters.find(
    parameter => parameter.id === control.scopeParameter
  )?.value;

  if (!Array.isArray(value) && typeof value !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      toParameterListItems(value)
        .map(entry => (toTableRowCells(entry)[0] || '').toLowerCase())
        .filter(Boolean)
    )
  );
};

const isAgentNameDeclared = (
  agentName: string | undefined,
  declared: string[]
): boolean => {
  const name = String(agentName || '').trim().toLowerCase();

  return name !== '' && declared.includes(name);
};

export const isManagerOnlyControl = (
  control: ENSMeasuredControl
): boolean =>
  isControlMeasuredOnPlane(control, 'manager') &&
  !isControlMeasuredOnPlane(control, 'agent');

export const isManagerPlaneActive = (
  catalog: Array<Pick<ENSControlDefinition, 'status' | 'measurementPlanes'>>
): boolean =>
  catalog.some(
    control =>
      control.status === 'ACTIVE' &&
      isControlMeasuredOnPlane(control, 'manager')
  );

export const applyManagerPlaneToScope = (
  resolvedAgents: ENSAgentScope[],
  inventory: ENSAgentScope[],
  managerPlaneActive: boolean
): ENSAgentScope[] => {
  const agents = resolvedAgents.filter(agent => !isManagerAgentId(agent.id));

  if (!managerPlaneActive) {
    return agents;
  }

  const inventoryManager = inventory.find(agent => isManagerAgentId(agent.id));

  const manager: ENSAgentScope = {
    id: ENS_MANAGER_AGENT_ID,
    name: inventoryManager?.name || ENS_MANAGER_FALLBACK_NAME,
    groups: inventoryManager ? [...inventoryManager.groups] : [],
    isManager: true,
    ...(inventoryManager?.status ? { status: inventoryManager.status } : {}),
  };

  return [...agents, manager];
};

export type ENSNotMeasuredCause = 'PLANE' | 'DECLARED_SCOPE';

export interface ENSNotMeasuredReason {
  cause: ENSNotMeasuredCause;
  text: string;
  parameterId?: string;
  declared?: string[];
}

const machineLabel = (agentId: string, agentName?: string): string =>
  agentName ? `${agentId} · ${agentName}` : agentId;

export const describeNotMeasuredOnAgent = (
  control: Pick<ENSControlDefinition, 'id' | 'measurementPlanes' | 'scopeParameter'>,
  agentId: string,
  agentName: string | undefined,
  configuration: ENSControlConfiguration | undefined
): ENSNotMeasuredReason | undefined => {
  if (!isControlMeasuredOnAgent(control, agentId)) {
    if (isManagerOnlyControl(control) && !isManagerAgentId(agentId)) {
      return undefined;
    }

    return {
      cause: 'PLANE',
      text: isManagerAgentId(agentId)
        ? `${control.id} se mide en cada activo del alcance ENS, no en el manager de Wazuh (${ENS_MANAGER_AGENT_ID}): el manager no tiene fila para este control.`
        : `${control.id} se mide solo en el manager de Wazuh (${ENS_MANAGER_AGENT_ID}), no en ${machineLabel(agentId, agentName)}.`,
    };
  }

  if (control.scopeParameter && !configuration) {
    return {
      cause: 'DECLARED_SCOPE',
      parameterId: control.scopeParameter,
      declared: [],
      text: `${control.id} no está en la configuración activa: sin ${control.scopeParameter} no hay activos declarados en que medirlo.`,
    };
  }

  const declared = getDeclaredScopeAgentNames(control, configuration);

  if (declared === undefined || isAgentNameDeclared(agentName, declared)) {
    return undefined;
  }

  const parameterId = control.scopeParameter as string;

  return {
    cause: 'DECLARED_SCOPE',
    parameterId,
    declared,
    text: declared.length
      ? `${control.id} solo se mide en los activos que declara ${parameterId} (${declared.join(', ')}); ${machineLabel(agentId, agentName)} no está entre ellos.`
      : `${control.id} solo se mide en los activos que declara ${parameterId}, y ${parameterId} no declara ninguno: ${machineLabel(agentId, agentName)} no está entre ellos.`,
  };
};
