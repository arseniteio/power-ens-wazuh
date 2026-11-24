import type {
  ENSAgentProfile,
  ENSConfigurationLifecycleStatus,
  ENSConfigurationScopeMode,
  ENSConfigurationVersion,
} from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPE_LABELS, knownSystemType } from '../../../../common/agent-configuration';
import type { ENSSystemDetection } from '../../../../common/ens/configuration/agents/system-detection';

interface ENSAgentTypeLabel {
  text: string;
  color: 'hollow' | 'accent' | 'warning';
  stored: boolean;
  pending: boolean;
}

export const agentTypeLabel = (
  profile: ENSAgentProfile | undefined,
  detection: ENSSystemDetection,
  loading = false
): ENSAgentTypeLabel => {
  const manual = knownSystemType(profile?.typeOverride);
  if (manual) return { text: `${ENS_SYSTEM_TYPE_LABELS[manual]} (corregido a mano)`, color: 'accent', stored: true, pending: false };
  if (detection.type) return { text: ENS_SYSTEM_TYPE_LABELS[detection.type], color: 'hollow', stored: true, pending: false };
  const stored = knownSystemType(profile?.detectedType);
  if (stored) return { text: ENS_SYSTEM_TYPE_LABELS[stored], color: 'hollow', stored: true, pending: false };
  return { text: loading ? 'Detectando…' : 'Sin detectar', color: 'warning', stored: false, pending: false };
};

const MODES: Record<ENSConfigurationScopeMode, string> = {
  global: 'Todos los activos del inventario',
  agent: 'Los activos de la lista',
  group: 'Los activos de los grupos',
};

export const scopeModeLabel = (mode: ENSConfigurationScopeMode): string => MODES[mode] || mode;

const LIFECYCLE: Record<ENSConfigurationLifecycleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIGURED: 'Configurada',
  INCOMPLETE: 'Incompleta',
  INVALID: 'Inválida',
  ACTIVE: 'Activa',
  ARCHIVED: 'Archivada',
};

export const lifecycleLabel = (status: ENSConfigurationLifecycleStatus): string => LIFECYCLE[status] || status;

export const parameterLabel = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  key: string,
  withControl = true
): string => {
  const [controlId, parameterId] = key.split(' ');
  const label = configuration.controls.find(control => control.controlId === controlId)?.parameters.find(parameter => parameter.id === parameterId)?.label;
  const name = label ? `«${label}»` : parameterId;
  return withControl ? `${controlId} ${name}` : name;
};

export const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
