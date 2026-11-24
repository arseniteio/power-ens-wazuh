import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSCustomTemplate,
  ENSLevel,
  ENSMatchMode,
  ENSSystemType,
} from '../types';
import {
  ENS_CUSTOM_TEMPLATE_KEYS,
  ENS_NO_TEMPLATE,
  ENS_SYSTEM_TYPE_LABELS,
  normalizeAgentId,
} from '../../../agent-configuration';
import { isEmptyParameterValue } from '../services/parameter-value-validator';
import { ENSConfigurationRegistry, getENSControlConfiguration } from '../registry';
import {
  findControlTemplate,
  getControlTemplates,
  getCustomTemplates,
  hasTemplateParameters,
  isReservedTemplateId,
} from '../templates';
import {
  getAgentSystemType,
  getEffectiveTemplate,
  getInheritedSetting,
  resolveControlConfigurationWithOrigins,
  toTemplateModel,
} from './configuration-resolver';
import { getParameterClass, isAgentLevelParameter } from './parameter-classes';
import { getAgentControls } from './agent-controls';
import { describeAgentLevelValueIssue } from './agent-configuration-validator';
import type { ENSDetectableAgent } from './system-detection';
import { cloneDocument, mergeAliases, profileIdentity } from './profile-identity';

const clone = cloneDocument;

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const sameMode = (left: ENSMatchMode | undefined, right: ENSMatchMode | undefined): boolean =>
  (left === 'regex') === (right === 'regex');

const setMode = (modes: Record<string, ENSMatchMode>, parameterId: string, mode: ENSMatchMode | undefined) => {
  if (mode === 'regex') modes[parameterId] = 'regex';
  else delete modes[parameterId];
};

type ENSControlEntry = {
  templateId?: string;
  parameters?: Record<string, ENSAgentParameterValue>;
  matchModes?: Record<string, ENSMatchMode>;
};

const withProfile = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  update: (profile: ENSAgentProfile) => ENSAgentProfile,
  agent?: ENSDetectableAgent
): ENSConfigurationVersion => {
  const id = normalizeAgentId(agentId);
  const next = clone(toTemplateModel(configuration));
  const agents = next.agents || {};
  const current = agents[id] || {};
  const known = profileIdentity(agent);
  const updated = update({ ...current, ...(known.name ? { name: known.name } : {}), aliases: mergeAliases(current.aliases, known.aliases) });
  if (!updated.aliases?.length) delete updated.aliases;
  if (updated.controls && !Object.keys(updated.controls).length) delete updated.controls;
  agents[id] = updated;
  next.agents = agents;
  return next;
};

const withControlEntry = (
  profile: ENSAgentProfile,
  controlId: string,
  update: (entry: ENSControlEntry) => ENSControlEntry
): ENSAgentProfile => {
  const controls = { ...(profile.controls || {}) };
  const entry = update({ ...(controls[controlId] || {}) });
  if (entry.parameters && !Object.keys(entry.parameters).length) delete entry.parameters;
  if (entry.matchModes && !Object.keys(entry.matchModes).length) delete entry.matchModes;
  if (entry.templateId === undefined) delete entry.templateId;
  if (Object.keys(entry).length) controls[controlId] = entry;
  else delete controls[controlId];
  return { ...profile, controls };
};

export const setAgentParameterValue = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controlId: string,
  parameterId: string,
  value: ENSAgentParameterValue | undefined,
  agent?: ENSDetectableAgent,
  matchMode?: ENSMatchMode
): ENSConfigurationVersion => {
  if (!isAgentLevelParameter(controlId, parameterId)) {
    throw new Error(`${controlId} ${parameterId} es un ajuste común del control: no admite valor por activo.`);
  }

  const inherited = getInheritedSetting(configuration, agentId, controlId, parameterId);
  const remove =
    value === undefined || isEmptyParameterValue(value) || (sameValue(value, inherited.value) && sameMode(matchMode, inherited.matchMode));

  return withProfile(
    configuration,
    agentId,
    current =>
      withControlEntry(current, controlId, entry => {
        const parameters = { ...(entry.parameters || {}) };
        const matchModes = { ...(entry.matchModes || {}) };
        if (remove) {
          delete parameters[parameterId];
          delete matchModes[parameterId];
        } else {
          parameters[parameterId] = value as ENSAgentParameterValue;
          setMode(matchModes, parameterId, matchMode);
        }
        return { ...entry, parameters, matchModes };
      }),
    agent
  );
};

export const clearAgentControlOverrides = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controlId: string
): ENSConfigurationVersion =>
  withProfile(configuration, agentId, current => withControlEntry(current, controlId, entry => ({ ...entry, parameters: {}, matchModes: {} })));

export const setControlTemplateAssignment = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  agentIds: string[],
  templateId: string | undefined,
  agents: Record<string, ENSDetectableAgent | undefined> = {}
): ENSConfigurationVersion => {
  if (templateId !== undefined && templateId !== ENS_NO_TEMPLATE && !findControlTemplate(toTemplateModel(configuration), controlId, templateId)) {
    throw new Error(`La plantilla «${templateId}» no existe en ${controlId}.`);
  }

  return agentIds.reduce(
    (current, agentId) =>
      withProfile(
        current,
        agentId,
        profile => withControlEntry(profile, controlId, entry => ({ ...entry, templateId })),
        agents[normalizeAgentId(agentId)]
      ),
    configuration
  );
};


export interface ENSAgentChangePreview {
  agentId: string;
  changes: string[];
  leftEmpty: string[];
}

export const previewConfigurationChange = (
  before: ENSConfigurationVersion,
  after: ENSConfigurationVersion,
  agentIds: string[],
  controlIds?: string[]
): ENSAgentChangePreview[] =>
  agentIds.map(agentId => {
    const result: ENSAgentChangePreview = { agentId: normalizeAgentId(agentId), changes: [], leftEmpty: [] };
    after.controls
      .filter(control => !controlIds || controlIds.includes(control.controlId))
      .forEach(control => {
        const left = resolveControlConfigurationWithOrigins(before, control.controlId, agentId);
        const right = resolveControlConfigurationWithOrigins(after, control.controlId, agentId);
        control.parameters.forEach(parameter => {
          if (!isAgentLevelParameter(control.controlId, parameter.id)) return;
          const before = left?.configuration.parameters.find(item => item.id === parameter.id);
          const after = right?.configuration.parameters.find(item => item.id === parameter.id);
          const was = before?.value;
          const is = after?.value;
          if (sameValue(was, is) && sameMode(before?.matchMode, after?.matchMode)) return;
          result.changes.push(`${control.controlId} ${parameter.id}`);
          if (parameter.required && !isEmptyParameterValue(was) && isEmptyParameterValue(is)) {
            result.leftEmpty.push(`${control.controlId} ${parameter.id}`);
          }
        });
      });
    return result;
  });

export const describeTemplateChoice = (
  configuration: Pick<ENSConfigurationVersion, 'templates'>,
  controlId: string,
  templateId: string | undefined
): string => {
  if (templateId === undefined) return 'la de serie de su tipo';
  if (templateId === ENS_NO_TEMPLATE) return 'sin plantilla (valores comunes)';
  return `«${findControlTemplate(configuration, controlId, templateId)?.name || templateId}»`;
};

export interface ENSAssignmentPreview extends ENSAgentChangePreview {
  from: string;
  to: string;
  ownWins: string[];
  mismatch?: string;
}

export const previewControlAssignment = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  agentIds: string[],
  templateId: string | undefined
): { configuration: ENSConfigurationVersion; previews: ENSAssignmentPreview[] } => {
  const next = setControlTemplateAssignment(configuration, controlId, agentIds, templateId);
  const target = findControlTemplate(next, controlId, templateId);
  const changes = previewConfigurationChange(configuration, next, agentIds, [controlId]);

  return {
    configuration: next,
    previews: changes.map(change => {
      const profile = toTemplateModel(configuration).agents?.[change.agentId];
      const current = getEffectiveTemplate(configuration, change.agentId, controlId);
      const after = getEffectiveTemplate(next, change.agentId, controlId);
      const type = getAgentSystemType(profile);
      const describe = (effective: typeof current) =>
        effective.template
          ? `«${effective.template.name}»${effective.via === 'type' ? ' (de serie, por su tipo)' : ''}`
          : 'sin plantilla (valores comunes)';
      return {
        ...change,
        from: describe(current),
        to: describe(after),
        ownWins: Object.keys(profile?.controls?.[controlId]?.parameters || {})
          .filter(parameterId => target && Object.prototype.hasOwnProperty.call(target.values, parameterId))
          .map(parameterId => `${controlId} ${parameterId}`),
        ...(target?.systemType && type && target.systemType !== type
          ? { mismatch: `«${target.name}» es para ${ENS_SYSTEM_TYPE_LABELS[target.systemType]} y el activo es ${ENS_SYSTEM_TYPE_LABELS[type]}` }
          : {}),
      };
    }),
  };
};


const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'plantilla';

const newTemplateId = (configuration: Pick<ENSConfigurationVersion, 'templates'>, name: string): string => {
  const taken = new Set(getCustomTemplates(configuration).map(template => template.id));
  const base = `custom-${slug(name)}`;
  let id = base;
  for (let n = 2; taken.has(id) || isReservedTemplateId(id); n += 1) id = `${base}-${n}`;
  return id;
};

export interface ENSTemplateInput {
  controlId: string;
  name: string;
  description?: string;
  systemType?: ENSSystemType;
  values: Record<string, ENSAgentParameterValue>;
  matchModes?: Record<string, ENSMatchMode>;
}

const controlFor = (configuration: ENSConfigurationVersion, controlId: string): ENSControlConfiguration | undefined =>
  configuration.controls.find(control => control.controlId === controlId) || getENSControlConfiguration(controlId);

const cleanTemplate = (configuration: ENSConfigurationVersion, input: ENSTemplateInput, id: string): ENSCustomTemplate => {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('La plantilla necesita un nombre.');
  if (!hasTemplateParameters(input.controlId)) throw new Error(`${input.controlId} solo tiene ajustes comunes: no admite plantillas.`);
  const control = controlFor(configuration, input.controlId);
  if (!control) throw new Error(`${input.controlId} no es un control de esta versión.`);
  const duplicated = getControlTemplates(configuration, input.controlId).some(
    template => template.id !== id && template.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicated) throw new Error(`Ya hay una plantilla «${name}» en ${input.controlId}.`);

  const values: Record<string, ENSAgentParameterValue> = {};
  const matchModes: Record<string, ENSMatchMode> = {};
  Object.entries(input.values || {}).forEach(([parameterId, value]) => {
    if (value === undefined || isEmptyParameterValue(value)) return;
    const matchMode = input.matchModes?.[parameterId];
    const issue = describeAgentLevelValueIssue(control, parameterId, value, matchMode);
    if (issue) throw new Error(`${issue.message.replace(/\.$/, '')}.`);
    values[parameterId] = value;
    setMode(matchModes, parameterId, matchMode);
  });

  return {
    id,
    controlId: input.controlId,
    name,
    ...(input.description && input.description.trim() ? { description: input.description.trim() } : {}),
    ...(input.systemType ? { systemType: input.systemType } : {}),
    values,
    ...(Object.keys(matchModes).length ? { matchModes } : {}),
  };
};

export const createControlTemplate = (
  configuration: ENSConfigurationVersion,
  input: ENSTemplateInput
): { configuration: ENSConfigurationVersion; template: ENSCustomTemplate } => {
  const next = clone(toTemplateModel(configuration));
  const template = cleanTemplate(next, input, newTemplateId(next, input.name));
  next.templates = [...(next.templates || []), template];
  return { configuration: next, template };
};

export const duplicateControlTemplate = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  sourceId: string,
  name?: string
): { configuration: ENSConfigurationVersion; template: ENSCustomTemplate } => {
  const model = toTemplateModel(configuration);
  const source = findControlTemplate(model, controlId, sourceId);
  if (!source) throw new Error(`La plantilla «${sourceId}» no existe en ${controlId}.`);
  const taken = new Set(getControlTemplates(model, controlId).map(template => template.name.trim().toLowerCase()));
  let candidate = name?.trim() || `${source.name} (copia)`;
  for (let n = 2; !name && taken.has(candidate.toLowerCase()); n += 1) candidate = `${source.name} (copia ${n})`;
  return createControlTemplate(model, {
    controlId,
    name: candidate,
    description: source.description,
    systemType: source.systemType,
    values: clone(source.values),
    matchModes: clone(source.matchModes || {}),
  });
};

export const updateControlTemplate = (
  configuration: ENSConfigurationVersion,
  templateId: string,
  patch: Partial<Omit<ENSTemplateInput, 'controlId'>>
): ENSConfigurationVersion => {
  const next = clone(toTemplateModel(configuration));
  const index = (next.templates || []).findIndex(template => template.id === templateId);
  if (index < 0) {
    throw new Error(isReservedTemplateId(templateId) ? 'Las plantillas de serie no se editan: se duplican.' : `La plantilla «${templateId}» no existe.`);
  }
  const current = next.templates![index];
  const merged: ENSTemplateInput = {
    controlId: current.controlId,
    name: patch.name ?? current.name,
    description: 'description' in patch ? patch.description : current.description,
    systemType: 'systemType' in patch ? patch.systemType : current.systemType,
    values: patch.values ?? current.values,
    matchModes: 'matchModes' in patch ? patch.matchModes : current.matchModes,
  };
  const unknown = Object.fromEntries(Object.entries(current).filter(([key]) => !ENS_CUSTOM_TEMPLATE_KEYS.includes(key)));
  next.templates![index] = { ...unknown, ...cleanTemplate(next, merged, templateId) };
  return next;
};

export const getTemplateUsage = (
  configuration: Pick<ENSConfigurationVersion, 'agents' | 'templates' | 'controls'>,
  controlId: string,
  templateId: string
): string[] =>
  Object.entries(toTemplateModel(configuration).agents || {})
    .filter(([, profile]) => profile?.controls?.[controlId]?.templateId === templateId)
    .map(([agentId]) => agentId)
    .sort();

export const deleteControlTemplate = (
  configuration: ENSConfigurationVersion,
  templateId: string,
  reassign?: { templateId?: string }
): ENSConfigurationVersion => {
  const model = toTemplateModel(configuration);
  const template = getCustomTemplates(model).find(item => item.id === templateId);
  if (!template) {
    throw new Error(isReservedTemplateId(templateId) ? 'Las plantillas de serie no se borran.' : `La plantilla «${templateId}» no existe.`);
  }
  if (reassign?.templateId === templateId) throw new Error('No se puede reasignar a la plantilla que se borra.');
  const users = getTemplateUsage(model, template.controlId, templateId);
  if (users.length && !reassign) {
    throw new Error(`«${template.name}» está asignada a ${users.length} activo(s) (${users.join(', ')}): hay que reasignarlos antes de borrarla.`);
  }
  const reassigned = users.length
    ? setControlTemplateAssignment(model, template.controlId, users, reassign!.templateId)
    : clone(model);
  reassigned.templates = (reassigned.templates || []).filter(item => item.id !== templateId || item.controlId !== template.controlId);
  return reassigned;
};


export const setAgentTypeOverride = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  type: ENSSystemType | typeof ENS_NO_TEMPLATE | undefined,
  agent?: ENSDetectableAgent
): ENSConfigurationVersion =>
  withProfile(
    configuration,
    agentId,
    current => {
      const next = { ...current };
      if (type) next.typeOverride = type;
      else delete next.typeOverride;
      return next;
    },
    agent
  );

export const setAgentAliases = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  aliases: string[],
  agent?: ENSDetectableAgent
): ENSConfigurationVersion =>
  withProfile(
    configuration,
    agentId,
    current => {
      const clean = mergeAliases(aliases);
      const next = { ...current };
      if (clean) next.aliases = clean;
      else delete next.aliases;
      return next;
    },
    agent
  );


export const getMissingCatalogControls = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  registry: ENSControlConfiguration[] = ENSConfigurationRegistry
): ENSControlConfiguration[] =>
  registry.filter(control => !configuration.controls.some(item => item.controlId === control.controlId));

export const addMissingControls = (
  configuration: ENSConfigurationVersion,
  controlIds: string[],
  registry: ENSControlConfiguration[] = ENSConfigurationRegistry
): { configuration: ENSConfigurationVersion; added: string[] } => {
  const missing = getMissingCatalogControls(configuration, registry).filter(control =>
    controlIds.includes(control.controlId)
  );

  if (!missing.length) {
    return { configuration, added: [] };
  }

  const next = clone(configuration);
  missing.forEach(control => {
    const block = clone(control);
    block.parameters = block.parameters.map(parameter => {
      const { value: _omitted, status: _status, ...rest } = parameter;
      return rest;
    });
    next.controls.push(block);
  });

  return { configuration: next, added: missing.map(control => control.controlId) };
};


interface ENSAgentCompleteness {
  withValue: number;
  total: number;
  ownValues: number;
  missingRequired: string[];
}

export const getAgentCompleteness = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controls: { controlId: string; level: ENSLevel }[]
): ENSAgentCompleteness => {
  const result: ENSAgentCompleteness = { withValue: 0, total: 0, ownValues: 0, missingRequired: [] };

  controls.forEach(({ controlId, level }) => {
    const resolved = resolveControlConfigurationWithOrigins(configuration, controlId, agentId);
    resolved?.configuration.parameters.forEach(parameter => {
      const parameterClass = getParameterClass(controlId, parameter.id);
      if (parameterClass !== 'system' && parameterClass !== 'platform') return;
      if (!parameter.levels.includes(level)) return;
      result.total += 1;
      if (resolved.origins[parameter.id]?.source === 'agent') result.ownValues += 1;
      if (!isEmptyParameterValue(parameter.value)) result.withValue += 1;
      else if (parameter.required) result.missingRequired.push(`${controlId} ${parameter.id}`);
    });
  });

  return result;
};

export const getAgentGaps = (
  configuration: ENSConfigurationVersion,
  agents: { agentId: string; type?: ENSSystemType }[],
  getLevel: (controlId: string) => ENSLevel
): Record<string, Record<string, number>> => {
  const gaps: Record<string, Record<string, number>> = {};
  agents.forEach(({ agentId, type }) => {
    getAgentControls(configuration, agentId, type, getLevel)
      .filter(control => control.measured)
      .forEach(control => {
        getAgentCompleteness(configuration, agentId, [{ controlId: control.controlId, level: control.level }]).missingRequired.forEach(key => {
          const parameterId = key.split(' ')[1];
          gaps[control.controlId] = gaps[control.controlId] || {};
          gaps[control.controlId][parameterId] = (gaps[control.controlId][parameterId] || 0) + 1;
        });
      });
  });
  return gaps;
};


export const removeAgentEntry = (
  configuration: ENSConfigurationVersion,
  agentKey: string,
  controlId?: string,
  parameterId?: string
): ENSConfigurationVersion => {
  if (!configuration.agents || !configuration.agents[agentKey]) {
    return configuration;
  }

  const next = clone(configuration);
  const agents = next.agents!;

  if (!controlId) {
    delete agents[agentKey];
    return next;
  }

  const profile = agents[agentKey];
  const controls = profile.controls || {};

  if (!parameterId) {
    delete controls[controlId];
  } else {
    const entry = controls[controlId];
    if (entry?.parameters) {
      delete entry.parameters[parameterId];
      if (!Object.keys(entry.parameters).length) delete entry.parameters;
    }
    if (entry?.matchModes) {
      delete entry.matchModes[parameterId];
      if (!Object.keys(entry.matchModes).length) delete entry.matchModes;
    }
    if (entry && !Object.keys(entry).length) delete controls[controlId];
  }

  if (!Object.keys(controls).length) delete profile.controls;
  return next;
};

const describeValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.length ? value.map(item => String(item)).join('; ') : '(vacío)';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === undefined || value === null || value === '' ? '(vacío)' : String(value);
};

export const describeAgentEntryRemoval = (
  configuration: ENSConfigurationVersion,
  agentKey: string,
  controlId?: string,
  parameterId?: string,
  options: { overridesOnly?: boolean } = {}
): string[] => {
  const profile: any = configuration.agents?.[agentKey];
  if (!profile) return [];
  const lines: string[] = [];
  const controls: Record<string, any> = profile.controls || {};

  if (!controlId) {
    if (profile.name) lines.push(`Nombre: ${profile.name}`);
    if (profile.aliases?.length) lines.push(`Otros nombres: ${profile.aliases.join(', ')}`);
    if (profile.typeOverride === ENS_NO_TEMPLATE) lines.push('Sin plantilla de tipo');
    else if (profile.typeOverride) lines.push(`Tipo corregido a mano: ${ENS_SYSTEM_TYPE_LABELS[profile.typeOverride as ENSSystemType] || profile.typeOverride}`);
  }

  Object.entries(controls)
    .filter(([id]) => !controlId || id === controlId)
    .forEach(([id, entry]) => {
      const parameters: Record<string, unknown> = entry?.parameters || {};
      if (!parameterId && !options.overridesOnly && typeof entry?.templateId === 'string') {
        lines.push(`${id}: plantilla ${describeTemplateChoice(configuration, id, entry.templateId)}`);
      }
      Object.entries(parameters)
        .filter(([parameter]) => !parameterId || parameter === parameterId)
        .forEach(([parameter, value]) => {
          const name = configuration.controls.find(control => control.controlId === id)?.parameters.find(item => item.id === parameter)?.label;
          const regex = entry?.matchModes?.[parameter] === 'regex' ? 'expresión regular ' : '';
          lines.push(`${id} ${name ? `«${name}»` : parameter}: ${regex}${describeValue(value)}`);
        });
      if (!parameterId && !options.overridesOnly && !Object.keys(parameters).length && typeof entry?.templateId !== 'string') lines.push(`${id}: sin valores`);
    });

  return lines;
};

export const describeAgentValueSave = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controlId: string,
  parameterId: string,
  value: ENSAgentParameterValue | undefined,
  matchMode?: ENSMatchMode
): 'remove' | 'same' | 'propio' => {
  if (value === undefined || isEmptyParameterValue(value)) return 'remove';
  const inherited = getInheritedSetting(configuration, agentId, controlId, parameterId);
  return sameValue(value, inherited.value) && sameMode(matchMode, inherited.matchMode) ? 'same' : 'propio';
};
