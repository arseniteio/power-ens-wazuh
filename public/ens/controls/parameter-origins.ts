import {
  resolveControlConfigurationWithOrigins,
} from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSResolvedValueOrigin } from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSConfigurationVersion, ENSMatchMode } from '../../../common/ens/configuration/types';

interface ENSParameterForMachine {
  id: string;
  label?: string;
  value: string;
  empty: boolean;
  origin: string;
  source?: ENSResolvedValueOrigin['source'];
  matchMode?: ENSMatchMode;
}

const MAX = 140;

const summarizeParameterValue = (value: unknown): { text: string; empty: boolean } => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return { text: 'sin valor', empty: true };
  }
  if (Array.isArray(value)) {
    const rows = value.map(v => String(v));
    const text = rows.join('; ');
    const header = `${rows.length} fila${rows.length === 1 ? '' : 's'}: `;
    return { text: header + (text.length > MAX ? `${text.slice(0, MAX).trimEnd()}…` : text), empty: false };
  }
  const text = String(value);
  return { text: text.length > MAX ? `${text.slice(0, MAX).trimEnd()}…` : text, empty: false };
};

export const describeValueOrigin = (origin: ENSResolvedValueOrigin | undefined, empty: boolean): string => {
  if (!origin) return 'el control no está en la configuración activa';
  if (origin.source === 'agent') return 'valor personalizado de este activo';
  if (origin.source === 'template') {
    const name = origin.templateName || origin.templateId;
    return origin.via === 'type' ? `de la plantilla de serie «${name}» de su tipo` : `de la plantilla «${name}» asignada en el control`;
  }
  if (origin.source === 'union') return `unión del valor por defecto y de los activos ${(origin.contributors || []).join(', ')}`;
  if (empty) return 'sin valor: ni personalizado, ni plantilla, ni valor por defecto';
  return 'valor por defecto';
};

export const describeParameterForMachine = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>,
  controlId: string,
  agentId: string | undefined,
  parameterId: string
): ENSParameterForMachine | undefined => {
  const resolved = resolveControlConfigurationWithOrigins(configuration, controlId, agentId);
  const parameter = resolved?.configuration.parameters.find(p => p.id === parameterId);
  if (!resolved || !parameter) return undefined;
  const { text, empty } = summarizeParameterValue(parameter.value);
  const origin = resolved.origins[parameterId];
  const withOwnValue =
    agentId === undefined && origin?.source !== 'union'
      ? Object.keys(configuration.agents || {}).filter(id => {
          const source = resolveControlConfigurationWithOrigins(configuration, controlId, id)?.origins[parameterId]?.source;
          return source === 'agent' || source === 'template';
        })
      : [];
  return {
    id: parameterId,
    label: parameter.label || parameter.name,
    value: parameter.matchMode === 'regex' && !empty ? `Expresión regular: ${text}` : text,
    empty,
    origin: withOwnValue.length
      ? `varía por activo: ${withOwnValue.join(', ')} con valor personalizado o plantilla; aquí, el valor por defecto`
      : describeValueOrigin(origin, empty),
    source: origin?.source,
    ...(parameter.matchMode === 'regex' ? { matchMode: 'regex' as const } : {}),
  };
};
