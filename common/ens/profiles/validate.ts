import { ENGINE_CATALOG } from '../catalog/engine-catalog';
import { isValidGlob } from './glob';
import {
  ENSProfile,
  ENS_PROFILE_GROUP_PREFIX,
  ENS_PROFILE_ID_PATTERN,
  ENS_PROFILE_LAYERS,
  ENS_PROFILE_LIST_FIELDS,
  ENS_PROFILE_LIST_OPS,
  ENS_PROFILE_SCALAR_FIELDS,
  ENS_PROFILE_SCALAR_OPS,
} from './types';
import { listOf } from './match';

interface CatalogColumn {
  label?: string;
  variadic?: boolean;
}

export interface CatalogParameter {
  type: string;
  class: string;
  label?: string;
  name?: string;
  options?: string[];
  columns?: CatalogColumn[];
  pattern?: boolean;
}

const CATALOG: Record<string, Record<string, CatalogParameter>> = Object.fromEntries(
  ENGINE_CATALOG.map(entry => [entry.control, entry.parameters])
);

export const lookupCatalogParameter = (controlId: string, parameterId: string): CatalogParameter | undefined =>
  CATALOG[controlId]?.[parameterId];

export const catalogHasControl = (controlId: string): boolean => Boolean(CATALOG[controlId]);

const sorted = (record: object | undefined): string[] => Object.keys(record || {}).sort();

const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

export const checkProfileValue = (parameter: CatalogParameter, value: unknown, mode?: string): string | undefined => {
  if (mode === 'regex') {
    return typeof value === 'string' && value.trim() ? undefined : 'una expresión regular debe ser un único texto no vacío';
  }

  switch (parameter.type) {
    case 'list':
    case 'table': {
      let items: unknown[];
      if (Array.isArray(value)) items = value;
      else if (typeof value === 'string') items = value.split('\n');
      else return 'debe ser una lista';
      const columns = parameter.columns || [];
      for (const item of items) {
        if (typeof item !== 'string') return `el elemento ${JSON.stringify(item)} no es texto`;
        const lastVariadic = columns.length > 0 && columns[columns.length - 1].variadic;
        if (parameter.type === 'table' && columns.length > 0 && item.split('|').length > columns.length && !lastVariadic) {
          return `la fila «${item}» tiene más de ${columns.length} columnas`;
        }
      }
      return undefined;
    }
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return isNumber(value) ? undefined : 'debe ser un número';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'debe ser verdadero o falso';
    case 'select': {
      const options = parameter.options || [];
      return typeof value === 'string' && (options.length === 0 || options.includes(value))
        ? undefined
        : `debe ser una de estas opciones: ${options.join(', ')}`;
    }
    case 'string':
      return typeof value === 'string' ? undefined : 'debe ser texto';
    default:
      return undefined;
  }
};

const validateMatch = (profile: ENSProfile, add: (message: string) => void): void => {
  const conditions = Array.isArray(profile.match) ? profile.match : [];
  if (conditions.length === 0) {
    add('no tiene condiciones, así que no se aplicaría a ningún activo');
  }
  conditions.forEach((condition, index) => {
    const where = `condición ${index + 1}`;
    const value = typeof condition?.value === 'string' ? condition.value : '';
    if ((ENS_PROFILE_SCALAR_FIELDS as string[]).includes(condition?.field)) {
      if (!(ENS_PROFILE_SCALAR_OPS as string[]).includes(condition.op)) {
        add(`${where}: ${condition.field} admite ${ENS_PROFILE_SCALAR_OPS.join(', ')}`);
      } else if (condition.op === 'matches' && !isValidGlob(value)) {
        add(`${where}: el patrón «${value}» no es válido`);
      } else if (condition.op === 'in' && !listOf(value).length) {
        add(`${where}: «una de» necesita una lista separada por comas`);
      }
    } else if ((ENS_PROFILE_LIST_FIELDS as string[]).includes(condition?.field)) {
      if (!(ENS_PROFILE_LIST_OPS as string[]).includes(condition.op)) {
        add(`${where}: ${condition.field} admite ${ENS_PROFILE_LIST_OPS.join(', ')}`);
      }
      if (condition.field === 'group' && value.trim().toLowerCase().startsWith(ENS_PROFILE_GROUP_PREFIX)) {
        add(`${where}: los grupos ${ENS_PROFILE_GROUP_PREFIX}* los crea el motor a partir de los perfiles, así que un perfil no puede depender de ellos`);
      }
    } else {
      add(`${where}: el campo «${condition?.field}» no existe`);
    }
    if (!value.trim()) {
      add(`${where}: el valor está vacío`);
    }
  });
};

const validateValues = (profile: ENSProfile, add: (message: string) => void): void => {
  for (const controlId of sorted(profile.values)) {
    if (!catalogHasControl(controlId)) {
      add(`el control ${controlId} no existe`);
      continue;
    }
    const values = profile.values[controlId] || {};
    for (const parameterId of sorted(values)) {
      const parameter = lookupCatalogParameter(controlId, parameterId);
      if (!parameter) {
        add(`${parameterId} no existe en ${controlId}`);
      } else if (parameter.class === 'organisation') {
        add(`${controlId} ${parameterId} se fija una vez para toda la organización, no por perfil`);
      } else {
        const problem = checkProfileValue(parameter, values[parameterId], profile.match_modes?.[controlId]?.[parameterId]);
        if (problem) add(`${controlId} ${parameterId}: ${problem}`);
      }
    }
  }

  for (const [controlId, modes] of Object.entries(profile.match_modes || {})) {
    for (const [parameterId, mode] of Object.entries(modes || {})) {
      if (mode !== 'exact' && mode !== 'regex') {
        add(`${controlId} ${parameterId}: el modo de comparación debe ser exact o regex`);
      }
    }
  }

  for (const [controlId, parameterIds] of Object.entries(profile.replace || {})) {
    for (const parameterId of parameterIds || []) {
      if (!Object.prototype.hasOwnProperty.call(profile.values?.[controlId] || {}, parameterId)) {
        add(`replace ${controlId} ${parameterId} no tiene valor en este perfil`);
      }
    }
  }
};

export const validateProfile = (profile: ENSProfile): string[] => {
  const errors: string[] = [];
  const add = (message: string) => errors.push(message);

  if (typeof profile.id !== 'string' || !ENS_PROFILE_ID_PATTERN.test(profile.id)) {
    add(`el identificador «${profile.id ?? ''}» solo admite minúsculas, cifras y guiones, y empieza por letra o cifra`);
  }
  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    add('el nombre está vacío');
  }
  if (!(ENS_PROFILE_LAYERS as string[]).includes(profile.layer)) {
    add(`la capa «${profile.layer ?? ''}» no es ninguna de ${ENS_PROFILE_LAYERS.join(', ')}`);
  }
  validateMatch(profile, add);
  validateValues(profile, add);
  return errors;
};
