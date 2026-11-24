import type { ENSAgentProfile, ENSConfigurationVersion, ENSCustomTemplate } from '../types';
import { ENS_NO_TEMPLATE, knownSystemType } from '../../../agent-configuration';
import { ENS_PARAMETER_CLASSES } from './parameter-classes';
import { getPlatformSource, getTypeDefaultTemplate, hasTemplateParameters } from '../templates';
import { cloneDocument } from './profile-identity';

type ENSTemplateModelDocument = Pick<ENSConfigurationVersion, 'controls' | 'agents' | 'templates'>;

export interface ENSTemplateAssignmentChange {
  agentId: string;
  controlId: string;
  templateId: string;
  from: string[];
}

export interface ENSTemplateMigrationPlan<T extends ENSTemplateModelDocument = ENSConfigurationVersion> {
  configuration: T;
  changed: boolean;
  assignments: ENSTemplateAssignmentChange[];
  created: ENSCustomTemplate[];
  dropped: { agentId: string; templateId: string }[];
}

const isTemplateModelDocument = (configuration: Pick<ENSTemplateModelDocument, 'templates'>): boolean =>
  Array.isArray(configuration.templates);

export const needsTemplateMigration = (configuration: ENSTemplateModelDocument): boolean =>
  !isTemplateModelDocument(configuration) ||
  Object.values(configuration.agents || {}).some(profile => Array.isArray(profile?.templates));

const TEMPLATE_CONTROLS = Object.keys(ENS_PARAMETER_CLASSES).filter(hasTemplateParameters);

const supplies = (templateId: string, controlId: string): boolean =>
  Object.keys(getPlatformSource(templateId)?.values[controlId] || {}).length > 0;

export const planTemplateMigration = <T extends ENSTemplateModelDocument>(configuration: T): ENSTemplateMigrationPlan<T> => {
  if (!needsTemplateMigration(configuration)) {
    return { configuration, changed: false, assignments: [], created: [], dropped: [] };
  }

  const legacyDocument = !isTemplateModelDocument(configuration);
  const next: T = { ...configuration };
  if (configuration.agents) next.agents = cloneDocument(configuration.agents);
  const templates: ENSCustomTemplate[] = Array.isArray(configuration.templates) ? cloneDocument(configuration.templates) : [];
  next.templates = templates;
  const assignments: ENSTemplateAssignmentChange[] = [];
  const created: ENSCustomTemplate[] = [];
  const dropped: { agentId: string; templateId: string }[] = [];

  Object.keys(next.agents || {})
    .sort()
    .forEach(agentId => {
      const profile: ENSAgentProfile = next.agents![agentId] || {};
      const legacy = Array.isArray(profile.templates) ? profile.templates : undefined;

      if (!legacy && !legacyDocument) {
        return;
      }

      const known = (legacy || []).filter(id => getPlatformSource(id));
      (legacy || []).filter(id => !getPlatformSource(id)).forEach(templateId => dropped.push({ agentId, templateId }));
      const type = knownSystemType(profile.typeOverride) || knownSystemType(profile.detectedType);
      const controls = { ...(profile.controls || {}) };

      TEMPLATE_CONTROLS.forEach(controlId => {
        if (controls[controlId]?.templateId !== undefined) {
          return;
        }

        const from = known.filter(id => supplies(id, controlId));
        const first = getPlatformSource(from[0] || '')?.values[controlId] || {};
        const later = from.slice(1).some(id => Object.keys(getPlatformSource(id)!.values[controlId]).some(key => !(key in first)));
        let templateId: string | undefined;

        if (from.length === 1 || (from.length > 1 && !later)) {
          templateId = from[0];
        } else if (from.length > 1) {
          templateId = `migrated-${controlId}-${from.join('-')}`;
          if (!templates.some(template => template.id === templateId)) {
            const values = {};
            from.forEach(id => Object.entries(getPlatformSource(id)!.values[controlId]).forEach(([parameterId, value]) => {
              if (!(parameterId in values)) (values as Record<string, unknown>)[parameterId] = value;
            }));
            const template: ENSCustomTemplate = {
              id: templateId,
              controlId,
              name: `${from.map(id => getPlatformSource(id)!.label).join(' + ')} (de la 1.2.0)`,
              description: 'Creada al convertir la configuración de la 1.2.0: las plantillas que se aplicaban juntas a un activo.',
              values: values as ENSCustomTemplate['values'],
            };
            templates.push(template);
            created.push(template);
          }
        } else if (Object.keys(getTypeDefaultTemplate(controlId, type)?.values || {}).length) {
          templateId = ENS_NO_TEMPLATE;
        }

        if (templateId) {
          controls[controlId] = { ...(controls[controlId] || {}), templateId };
          assignments.push({ agentId, controlId, templateId, from });
        }
      });

      const converted: ENSAgentProfile = { ...profile, controls };
      delete converted.templates;
      if (!Object.keys(controls).length) delete converted.controls;
      next.agents![agentId] = converted;
    });

  const changed = assignments.length > 0 || dropped.length > 0 ||
    Object.values(configuration.agents || {}).some(profile => Array.isArray(profile?.templates));

  return { configuration: next, changed, assignments, created, dropped };
};

export const summarizeTemplateMigration = (plan: Pick<ENSTemplateMigrationPlan, 'assignments' | 'created' | 'dropped'>): string => {
  const agents = new Set(plan.assignments.map(item => item.agentId)).size;
  const assigned = plan.assignments.filter(item => item.templateId !== ENS_NO_TEMPLATE).length;
  const pinned = plan.assignments.length - assigned;
  return [
    `Conversión de la configuración 1.2.0: ${assigned} asignación(es) de plantilla por control en ${agents} activo(s)`,
    pinned ? `, ${pinned} control(es) marcados «Sin plantilla» para que sigan con el valor común` : '',
    plan.created.length ? `, ${plan.created.length} plantilla(s) propia(s) creada(s) con plantillas que se aplicaban juntas` : '',
    plan.dropped.length ? `; ${plan.dropped.length} plantilla(s) desconocida(s) que no se aplicaban se descartan` : '',
    '.',
  ].join('');
};
