import type { ENSResolvedParameter, ENSValueSource } from '../../../../common/ens/profiles/resolve';
import { isEmptyValue } from '../../../../common/ens/profiles/resolve';
import { tableRowText } from '../../../../common/ens/configuration/table-rows';

const MAX = 220;

const clip = (text: string): string => (text.length > MAX ? `${text.slice(0, MAX).trimEnd()}…` : text);

export const valueText = (parameter: Pick<ENSResolvedParameter, 'value' | 'matchMode' | 'type'>): string => {
  const { value } = parameter;
  if (isEmptyValue(value)) return 'Sin valor';
  if (parameter.matchMode === 'regex') return `Expresión regular: ${clip(String(value))}`;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const items = Array.isArray(value) ? value : typeof value === 'string' && (parameter.type === 'list' || parameter.type === 'table') ? value.split('\n') : undefined;
  if (items) {
    const rows = items.map(item => String(item).trim()).filter(Boolean);
    const unit = parameter.type === 'table' ? (rows.length === 1 ? 'fila' : 'filas') : rows.length === 1 ? 'valor' : 'valores';
    return `${rows.length} ${unit}: ${clip(parameter.type === 'table' ? rows.map(tableRowText).join('; ') : rows.join(', '))}`;
  }
  return clip(String(value));
};

const quoted = (source: ENSValueSource): string => `«${source.name || source.id}»`;

export const originText = (sources: ENSValueSource[]): string => {
  if (!sources.length) return 'Sin valor en ninguna capa';
  const [first] = sources;
  switch (first.kind) {
    case 'agent':
      return 'Valor propio de esta máquina';
    case 'template':
      return `Plantilla ${quoted(first)} asignada en el control`;
    case 'type-template':
      return `Plantilla de serie ${quoted(first)} de su tipo`;
    case 'organisation':
      return 'Valor común de la organización';
    case 'profile':
      return sources.length === 1 ? `Grupo ${quoted(first)}` : `Unión de grupos ${sources.map(quoted).join(', ')}`;
    default:
      return '';
  }
};
