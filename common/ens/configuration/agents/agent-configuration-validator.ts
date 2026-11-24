import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSMatchMode,
} from '../types';
import { validateParameterValue } from '../services/parameter-value-validator';
import { withMatchMode } from '../services/parameter-pattern';
import { getParameterClass } from './parameter-classes';
import {
  ENS_NO_TEMPLATE,
  checkAgentsConfigurationKeys,
  checkCustomTemplatesKeys,
  describeNonIdAgentKey,
  isNormalisedAgentId,
  knownSystemType,
} from '../../../agent-configuration';
import {
  findControlTemplate,
  getBuiltinTemplates,
  getCustomTemplates,
  hasTemplateParameters,
  isReservedTemplateId,
} from '../templates';

interface ENSAgentConfigurationIssue {
  agentId: string;
  controlId?: string;
  parameterId?: string;
  severity: 'error' | 'warning';
  kind: 'orphan' | 'value' | 'template' | 'unknown';
  message: string;
}

interface ENSTemplateIssue {
  templateId: string;
  controlId?: string;
  parameterId?: string;
  severity: 'error' | 'warning';
  message: string;
}

export const describeAgentLevelValueIssue = (
  control: ENSControlConfiguration,
  parameterId: string,
  value: ENSAgentParameterValue,
  matchMode?: ENSMatchMode
): { kind: 'orphan' | 'value'; message: string } | undefined => {
  const parameter = control.parameters.find(item => item.id === parameterId);

  if (!parameter) {
    return { kind: 'orphan', message: `${control.controlId} no declara el parámetro ${parameterId}: el valor no se aplica` };
  }

  const parameterClass = getParameterClass(control.controlId, parameterId);

  if (parameterClass !== 'system' && parameterClass !== 'platform') {
    return {
      kind: 'orphan',
      message: `${control.controlId} «${parameter.label}» es un ajuste común del control: no admite valor por activo ni por plantilla y este no se aplica`,
    };
  }

  const verdict = validateParameterValue(withMatchMode(parameter, matchMode), value);

  return verdict.valid
    ? undefined
    : { kind: 'value', message: `${control.controlId} «${parameter.label}» ${verdict.reason || 'tiene un valor inválido'}` };
};

const describeModesWithoutValue = (
  control: ENSControlConfiguration,
  modes: Record<string, ENSMatchMode> | undefined,
  values: Record<string, unknown>
): [string, string][] =>
  Object.keys(modes || {})
    .filter(parameterId => !Object.prototype.hasOwnProperty.call(values, parameterId))
    .map(parameterId => {
      const label = control.parameters.find(parameter => parameter.id === parameterId)?.label;
      return [parameterId, `${control.controlId} ${label ? `«${label}»` : parameterId}`];
    });

export const validateAgentProfile = (
  agentId: string,
  profile: ENSAgentProfile,
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'templates'>
): ENSAgentConfigurationIssue[] => {
  const issues: ENSAgentConfigurationIssue[] = [];
  const add = (
    severity: ENSAgentConfigurationIssue['severity'],
    kind: ENSAgentConfigurationIssue['kind'],
    message: string,
    controlId?: string,
    parameterId?: string
  ) => issues.push({ agentId, controlId, parameterId, severity, kind, message });

  if (!isNormalisedAgentId(agentId)) {
    add('error', 'orphan', `${describeNonIdAgentKey(agentId)}: sus valores no se aplican a ningún activo`);
  }

  if (Array.isArray(profile.templates) && profile.templates.length) {
    add('warning', 'template', `plantillas de la 1.2.0 (${profile.templates.join(', ')}): se convierten en asignaciones por control al cargar`);
  }

  Object.entries(profile.controls || {}).forEach(([controlId, entry]) => {
    const control = configuration.controls.find(item => item.controlId === controlId);
    const values = entry?.parameters || {};
    const templateId = entry?.templateId;

    if (!control) {
      if (Object.keys(values).length) {
        add(
          'error',
          'orphan',
          `${controlId} no está en la configuración: sus ${Object.keys(values).length} ajuste(s) propio(s) no se aplican (se quitan, o se añade antes el control)`,
          controlId
        );
      }
      return;
    }

    if (templateId && templateId !== ENS_NO_TEMPLATE && !findControlTemplate(configuration, controlId, templateId)) {
      add('error', 'template', `${controlId}: la plantilla asignada «${templateId}» no existe; se aplica la de serie de su tipo`, controlId);
    }

    Object.entries(values).forEach(([parameterId, value]) => {
      const issue = describeAgentLevelValueIssue(control, parameterId, value, entry?.matchModes?.[parameterId]);
      if (issue) {
        add(
          'error',
          issue.kind,
          issue.kind === 'value' ? `${issue.message}: este activo se evalúa con una configuración inválida` : issue.message,
          controlId,
          parameterId
        );
      }
    });

    describeModesWithoutValue(control, entry?.matchModes, values).forEach(([parameterId, name]) =>
      add('error', 'orphan', `${name}: modo de comparación sin ajuste propio; no se aplica`, controlId, parameterId)
    );
  });

  return issues;
};

export const validateAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents' | 'templates'>
): ENSAgentConfigurationIssue[] => {
  const agents = configuration.agents && typeof configuration.agents === 'object' ? configuration.agents : {};
  const warnings = checkAgentsConfigurationKeys(agents).warnings.map(message => ({
    agentId: message.split(':')[0].replace(/^configuration\.agents\./, '').split('.')[0],
    severity: 'warning' as const,
    kind: 'unknown' as const,
    message,
  }));

  return [
    ...Object.entries(agents).flatMap(([agentId, profile]) =>
      validateAgentProfile(agentId, (profile || {}) as ENSAgentProfile, configuration)
    ),
    ...warnings,
  ];
};

export const validateCustomTemplates = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'templates'>
): ENSTemplateIssue[] => {
  const issues: ENSTemplateIssue[] = [];
  const seen = new Set<string>();
  const names = new Set<string>();

  getCustomTemplates(configuration).forEach(template => {
    const add = (severity: ENSTemplateIssue['severity'], message: string, parameterId?: string) =>
      issues.push({ templateId: template.id, controlId: template.controlId, parameterId, severity, message });

    if (isReservedTemplateId(template.id)) {
      add('error', `el id «${template.id}» es de una plantilla de serie: la propia no se aplica`);
    }
    if (seen.has(template.id)) {
      add('error', `el id «${template.id}» está repetido: solo se aplica la primera plantilla con ese id`);
    }
    seen.add(template.id);

    const nameKey = `${template.controlId}|${template.name.trim().toLowerCase()}`;
    const builtinName = getBuiltinTemplates(template.controlId).some(item => item.name.trim().toLowerCase() === template.name.trim().toLowerCase());
    if (names.has(nameKey) || builtinName) {
      add('warning', `${template.controlId}: hay otra plantilla llamada «${template.name}»`);
    }
    names.add(nameKey);

    const control = configuration.controls.find(item => item.controlId === template.controlId);
    if (!control) {
      add('error', `${template.controlId} no está en la configuración: la plantilla «${template.name}» no se aplica`);
      return;
    }
    if (!hasTemplateParameters(template.controlId)) {
      add('error', `${template.controlId} solo tiene ajustes comunes: la plantilla «${template.name}» no se aplica`);
      return;
    }

    Object.entries(template.values).forEach(([parameterId, value]) => {
      const issue = describeAgentLevelValueIssue(control, parameterId, value, template.matchModes?.[parameterId]);
      if (issue) add('error', `plantilla «${template.name}»: ${issue.message}`, parameterId);
    });

    describeModesWithoutValue(control, template.matchModes, template.values).forEach(([parameterId, name]) =>
      add('warning', `plantilla «${template.name}»: ${name}: modo de comparación sin valor en la plantilla; se ignora`, parameterId)
    );
  });

  checkCustomTemplatesKeys(configuration.templates).forEach(message =>
    issues.push({ templateId: '', severity: 'warning', message })
  );

  return issues;
};

interface ENSAgentConfigurationSummary {
  agentId: string;
  name?: string;
  type?: string;
  typeSource: 'manual' | 'detectado' | 'sin tipo';
  assignments: Record<string, string>;
  ownValues: number;
}

export const summarizeAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'agents'>
): ENSAgentConfigurationSummary[] =>
  Object.entries(configuration.agents || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agentId, profile]) => ({
      agentId,
      name: profile?.name,
      type: knownSystemType(profile?.typeOverride) || knownSystemType(profile?.detectedType),
      typeSource: knownSystemType(profile?.typeOverride) ? 'manual' : knownSystemType(profile?.detectedType) ? 'detectado' : 'sin tipo',
      assignments: Object.fromEntries(
        Object.entries(profile?.controls || {})
          .filter(([, entry]) => typeof entry?.templateId === 'string')
          .map(([controlId, entry]) => [controlId, entry!.templateId as string])
      ),
      ownValues: Object.values(profile?.controls || {}).reduce(
        (total, control) => total + Object.keys(control?.parameters || {}).length,
        0
      ),
    }));
