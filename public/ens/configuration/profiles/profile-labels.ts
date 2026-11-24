import type { ENSProfileCondition, ENSProfileLayer } from '../../../../common/ens/profiles/types';

export const LAYER_LABELS: Record<ENSProfileLayer, string> = {
  distro: 'Distribución',
  role: 'Función',
  service: 'Servicio',
  site: 'Sitio',
};

export const LAYER_HELP: Record<ENSProfileLayer, string> = {
  distro: 'línea base por distribución y versión.',
  role: 'función deducida de cada activo.',
  service: 'admite varios por activo.',
  site: 'grupo de Wazuh o nombre del activo; capa más específica.',
};

export const LAYER_COLORS: Record<ENSProfileLayer, string> = {
  distro: '#3E6FD8',
  role: '#00857A',
  service: '#7A4CC2',
  site: '#B06A00',
};

export const layerLabel = (layer: string): string => LAYER_LABELS[layer as ENSProfileLayer] || layer;

export const FIELD_LABELS: Record<string, string> = {
  distro: 'Distribución',
  family: 'Familia',
  role: 'Función',
  hostname: 'Nombre del activo',
  service: 'Servicio',
  group: 'Grupo de Wazuh',
};

export const OP_LABELS: Record<string, string> = {
  is: 'es',
  is_not: 'no es',
  matches: 'encaja con',
  in: 'es una de',
  has: 'tiene',
  has_not: 'no tiene',
};

export const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager de Wazuh',
  server: 'Servidor',
  workstation: 'Puesto de trabajo',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] || role || 'Sin deducir';

export const conditionText = (condition: ENSProfileCondition): string => {
  const field = (FIELD_LABELS[condition.field] || condition.field).toLowerCase();
  const op = OP_LABELS[condition.op] || condition.op;
  const value = condition.field === 'role' ? roleLabel(condition.value) : condition.value;
  return `${field} ${op} «${value}»`;
};

export const matchText = (match: ENSProfileCondition[]): string =>
  match.length ? match.map(conditionText).join(' y ') : 'Sin condiciones';

export const machines = (count: number): string => `${count.toLocaleString('es-ES')} ${count === 1 ? 'activo' : 'activos'}`;

export const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  'os.platform': 'plataforma del inventario',
  'os.name': 'nombre del sistema en el inventario',
  package: 'paquete instalado',
  agent: 'identificador del agente',
};

export const signalSourceText = (from: string): string => {
  const at = from.indexOf(':');
  const kind = at === -1 ? from : from.slice(0, at);
  const value = at === -1 ? '' : from.slice(at + 1);
  const label = SIGNAL_SOURCE_LABELS[kind] || kind;
  return value ? `${label} ${value}` : label;
};

export const hostLabel = (host: { agentId: string; name?: string; hostname?: string }): string =>
  host.name || host.hostname || (host.agentId === '000' ? 'Manager de Wazuh' : `Activo ${host.agentId}`);
