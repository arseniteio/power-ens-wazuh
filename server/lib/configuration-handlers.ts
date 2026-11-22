import type { Logger } from '../../../../src/core/server';
import {
  deleteENSSystem,
  ENSConfigurationConflictError,
  ENSConfigurationDocumentVersion,
  ENSConfigurationStoredDocument,
  listENSSystems,
  parseConfigurationVersion,
  persistENSConfiguration,
  readActiveENSConfigurationWithVersion,
  readENSConfigurationHistory,
} from './configuration-storage';
import {
  DEFAULT_ENS_SYSTEM,
  describeSystemScopeIssue,
  isDefaultSystem,
  isValidSystemId,
  sharedScopeGroups,
  systemOf,
} from '../../common/ens/systems';
import type { ENSSystemScope } from '../../common/ens/systems';
import { resolveCurrentUser } from './current-user';
import {
  checkAgentsConfigurationKeys,
  validateAgentsConfigurationShape,
  validateCommonMatchModesShape,
  validateCustomTemplatesShape,
} from '../../common/agent-configuration';
import { validateOrganizationDataShape } from '../../common/ens/configuration/organization/organization-data-shape';
import {
  describeOrganizationFills,
  normalizeOrganizationData,
} from '../../common/ens/configuration/organization/organization-data-migration';
import { describeNewLevelOptionIssues } from '../../common/ens/configuration/services/level-options';
import { withCatalogControls } from '../../common/ens/configuration/services/catalog-controls';
import { stampAssessments, validateMaturityShape } from '../../common/ens/maturity/assessments';
import type { ENSMaturityAssessment, ENSMaturityScale } from '../../common/ens/maturity/types';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const metadata = (doc?: ENSConfigurationStoredDocument, version?: ENSConfigurationDocumentVersion) =>
  doc
    ? { createdAt: doc.createdAt, createdBy: doc.createdBy, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, ...(version || {}) }
    : null;

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const HISTORY_NOT_WRITTEN = 'Guardado; no se pudo registrar el historial';

const NO_ROLE = 'Hace falta el rol power_ens_admin o all_access para cambiar la configuración ENS o ver su historial.';

// Scales come from the consultant's template, not from the maturity form: a save that does not
// send them keeps the ones already stored.
const keptScales = (sent?: ENSMaturityScale[], stored?: ENSMaturityScale[]): { scales?: ENSMaturityScale[] } => {
  const scales = sent ?? stored;
  return scales?.length ? { scales } : {};
};

const NO_SYSTEM_ID = 'El identificador del sistema tiene de 1 a 40 letras minúsculas, cifras o guiones, y no puede ser «default».';

const requestedSystem = (request: any): string | undefined => {
  const system = systemOf(request?.query?.system);
  return isDefaultSystem(system) || isValidSystemId(system) ? system : undefined;
};

// A new system starts from the organisation data and the parameters of the default one, with an
// empty scope: its machines, their own values and its maturity assessments are not copied.
const newSystemConfiguration = (base: Record<string, any>): Record<string, unknown> => {
  const { agents: _agents, maturity: _maturity, auditTrail: _trail, levelAdjustments: _adjustments, ...rest } = base;
  return { ...rest, scope: { mode: 'group', groupIds: [], agentIds: [], controlGroups: false } };
};

export const createConfigurationHandlers = ({ logger, securityEnabled }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;

  const administrator = async (context: any, response: any, logLabel: string) => {
    try {
      const user = await resolveCurrentUser(actual(context), securityEnabled);
      if (!user.administrator) {
        logger.warn(`ENS config: refused ${logLabel} for ${user.username || 'an unnamed user'} (lacks power_ens_admin and all_access)`);
        return { error: failure(response, 403, NO_ROLE) };
      }
      if (!user.username) return { error: failure(response, 401, 'No se pudo identificar al usuario.') };
      return { user };
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 403) logger.warn(`ENS config: refused ${logLabel}; OpenSearch does not let the user be identified (403)`);
      if (status === 401 || status === 403) return { error: failure(response, status, error?.message || 'No autorizado') };
      logger.error(`Could not check the ENS configuration user: ${error?.message || error}`);
      return { error: failure(response, 500, 'No se pudo comprobar el usuario; el detalle está en el log del dashboard.') };
    }
  };

  const getActive = async (context: any, request: any, response: any) => {
    const system = requestedSystem(request);
    if (!system) return failure(response, 400, NO_SYSTEM_ID);
    try {
      const { document: doc, version } = await readActiveENSConfigurationWithVersion(internal(context), logger, system);
      if (!doc && !isDefaultSystem(system)) return failure(response, 404, `El sistema ENS «${system}» no existe.`);
      return correct(response, { configuration: doc?.configuration ?? null, metadata: metadata(doc, version) });
    } catch (error: any) {
      logger.error(`Could not read the active ENS configuration: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const save = async (context: any, request: any, response: any) => {
    const system = requestedSystem(request);
    if (!system) return failure(response, 400, NO_SYSTEM_ID);
    const bodyText = request?.body;
    if (!bodyText || !bodyText.configuration || typeof bodyText.configuration !== 'object' || Array.isArray(bodyText.configuration)) {
      return failure(response, 400, 'Hace falta una configuración ENS válida.');
    }

    const scopeIssue = describeSystemScopeIssue(system, bodyText.configuration.scope);
    if (scopeIssue) return failure(response, 400, scopeIssue);

    const agentErrors = [
      ...validateAgentsConfigurationShape(bodyText.configuration.agents),
      ...checkAgentsConfigurationKeys(bodyText.configuration.agents).errors,
    ];
    if (agentErrors.length) {
      return failure(response, 400, `configuration.agents no es válida: ${agentErrors.slice(0, 5).join(' ')}`);
    }

    const templateErrors = validateCustomTemplatesShape(bodyText.configuration.templates);
    if (templateErrors.length) {
      return failure(response, 400, `configuration.templates no es válida: ${templateErrors.slice(0, 5).join(' ')}`);
    }

    const modeErrors = validateCommonMatchModesShape(bodyText.configuration.controls);
    if (modeErrors.length) {
      return failure(response, 400, `configuration.controls no es válida: ${modeErrors.slice(0, 5).join(' ')}`);
    }

    const organizationErrors = validateOrganizationDataShape(bodyText.configuration.organizationData);
    if (organizationErrors.length) {
      return failure(response, 400, `configuration.organizationData no es válida: ${organizationErrors.slice(0, 5).join(' ')}`);
    }

    const maturityErrors = validateMaturityShape(bodyText.configuration.maturity);
    if (maturityErrors.length) {
      return failure(response, 400, `configuration.maturity no es válida: ${maturityErrors.slice(0, 5).join(' ')}`);
    }

    const access = await administrator(context, response, 'save the configuration');
    if (access.error) return access.error;
    const username = access.user!.username;

    try {
      const { document: previous, version } = await readActiveENSConfigurationWithVersion(internal(context), logger, system);
      if (!previous && !isDefaultSystem(system)) return failure(response, 404, `El sistema ENS «${system}» no existe.`);
      const shared = sharedScopeGroups(system, bodyText.configuration.scope, await listENSSystems(internal(context), logger));
      if (shared.length) {
        return failure(response, 400, `No se guarda: otro sistema ya usa los grupos ${shared.join(', ')}. Una máquina solo puede estar en un sistema.`);
      }
      const expectsNone = bodyText.expectedVersion === null;
      const expected = parseConfigurationVersion(bodyText.expectedVersion);
      if (
        (expectsNone && previous) ||
        (expected && (!previous || (version && (expected.seqNo !== version.seqNo || expected.primaryTerm !== version.primaryTerm))))
      ) {
        logger.warn(`ENS config: refused a stale save by ${username}`);
        return failure(response, 409, new ENSConfigurationConflictError().message);
      }
      const previous2: any = previous?.configuration || {};
      const trail = Array.isArray(previous2.auditTrail) ? previous2.auditTrail : [];
      const now = new Date().toISOString();
      const initial = !previous;
      const requestedReason =
        text(bodyText.changeReason) ||
        text(bodyText.configuration.changeReason) ||
        (initial ? 'Configuración ENS creada.' : 'Configuración ENS actualizada.');

      const keepsAgents =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'agents') &&
        previous2.agents && typeof previous2.agents === 'object'
          ? { agents: previous2.agents }
          : {};

      const keptTemplates =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'templates') && Array.isArray(previous2.templates)
          ? { templates: previous2.templates }
          : {};

      const keptLevelAdjustments =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'levelAdjustments') && Array.isArray(previous2.levelAdjustments)
          ? { levelAdjustments: previous2.levelAdjustments }
          : {};

      const keptOrganizationData =
        !Object.prototype.hasOwnProperty.call(bodyText.configuration, 'organizationData') &&
        previous2.organizationData && typeof previous2.organizationData === 'object'
          ? { organizationData: previous2.organizationData }
          : {};

      const previousAssessments: ENSMaturityAssessment[] = previous2.maturity?.assessments || [];
      const maturity = Object.prototype.hasOwnProperty.call(bodyText.configuration, 'maturity')
        ? {
            maturity: {
              assessments: stampAssessments(bodyText.configuration.maturity?.assessments || [], previousAssessments, username, now),
              ...keptScales(bodyText.configuration.maturity?.scales, previous2.maturity?.scales),
            },
          }
        : previous2.maturity
          ? { maturity: previous2.maturity }
          : {};

      const organization = normalizeOrganizationData(
        withCatalogControls({ ...bodyText.configuration, ...keepsAgents, ...keptTemplates, ...keptOrganizationData, ...keptLevelAdjustments, ...maturity })
      );
      const levelIssues = describeNewLevelOptionIssues(organization.configuration, previous2);
      if (levelIssues.length) {
        return failure(response, 400, `No se guarda: ${levelIssues.slice(0, 5).join('; ')}.`);
      }
      const fills = describeOrganizationFills(organization.filled).filter(line => !requestedReason.includes(line));
      const reason = fills.length ? `${requestedReason} ${fills.join(' ')}` : requestedReason;
      const configurationValue = {
        ...organization.configuration,
        createdAt: initial ? now : text(previous2.createdAt) || now,
        createdBy: initial ? username : text(previous2.createdBy) || username,
        updatedAt: now,
        updatedBy: username,
        changeReason: reason,
        auditTrail: [
          ...trail,
          { action: initial ? 'CREATED' : 'UPDATED', user: username, date: now, summary: reason },
        ],
      };

      const last = previous ? (await readENSConfigurationHistory(internal(context), logger, 1, system))[0] : undefined;
      const previousOutsideHistory =
        previous && JSON.stringify(last?.configuration ?? null) !== JSON.stringify(previous.configuration)
          ? { configuration: previous.configuration, author: text(previous2.updatedBy) || previous.updatedBy }
          : undefined;

      const savedValue = await persistENSConfiguration(
        internal(context),
        logger,
        configurationValue,
        username,
        previousOutsideHistory,
        previous ? version : 'absent',
        { id: system, name: previous?.system?.name || system }
      );
      logger.info(`ENS configuration of system ${system} saved by ${username}`);
      if (savedValue.historyError) {
        logger.error(`ENS configuration saved by ${username}, but its history entry was not written: ${savedValue.historyError}`);
      }

      return correct(response, {
        configuration: savedValue.configuration,
        metadata: metadata(savedValue, savedValue.version),
        ...(savedValue.historyError ? { warning: HISTORY_NOT_WRITTEN } : {}),
      });
    } catch (error: any) {
      if (error instanceof ENSConfigurationConflictError) {
        logger.warn(`ENS config: refused a stale save by ${username} (the document changed while saving)`);
        return failure(response, 409, error.message);
      }
      logger.error(`Could not save the ENS configuration: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo guardar la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const history = async (context: any, request: any, response: any) => {
    const system = requestedSystem(request);
    if (!system) return failure(response, 400, NO_SYSTEM_ID);
    const access = await administrator(context, response, 'read the history');
    if (access.error) return access.error;

    try {
      const docs = await readENSConfigurationHistory(internal(context), logger, 100, system);
      return correct(response, docs.map(doc => ({ configuration: doc.configuration, metadata: metadata(doc) })));
    } catch (error: any) {
      logger.error(`Could not read the ENS configuration history: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer el historial de la configuración ENS; el detalle está en el log del dashboard.');
    }
  };

  const systems = async (context: any, _request: any, response: any) => {
    try {
      const list = await listENSSystems(internal(context), logger);
      return correct(response, list.map(({ id, name, scope }): ENSSystemScope => ({ id, name, ...(scope ? { scope } : {}) })));
    } catch (error: any) {
      logger.error(`Could not list the ENS systems: ${error?.message || error}`);
      return failure(response, 500, 'No se pudieron leer los sistemas ENS; el detalle está en el log del dashboard.');
    }
  };

  const createSystem = async (context: any, request: any, response: any) => {
    const id = text(request?.body?.id) || '';
    const name = text(request?.body?.name) || id;
    if (!isValidSystemId(id)) return failure(response, 400, NO_SYSTEM_ID);

    const access = await administrator(context, response, 'create a system');
    if (access.error) return access.error;
    const username = access.user!.username;

    try {
      if ((await listENSSystems(internal(context), logger)).some(system => system.id === id)) {
        return failure(response, 409, `Ya existe un sistema ENS con el identificador «${id}».`);
      }
      const { document: base } = await readActiveENSConfigurationWithVersion(internal(context), logger, DEFAULT_ENS_SYSTEM);
      const now = new Date().toISOString();
      const reason = `Sistema ENS «${name}» creado a partir del sistema principal.`;
      const configuration = {
        ...newSystemConfiguration(base?.configuration || {}),
        createdAt: now,
        createdBy: username,
        updatedAt: now,
        updatedBy: username,
        changeReason: reason,
        auditTrail: [{ action: 'CREATED', user: username, date: now, summary: reason }],
      };
      await persistENSConfiguration(internal(context), logger, configuration, username, undefined, 'absent', { id, name });
      logger.info(`ENS system ${id} created by ${username}`);
      return correct(response, { id, name });
    } catch (error: any) {
      if (error instanceof ENSConfigurationConflictError) return failure(response, 409, `Ya existe un sistema ENS con el identificador «${id}».`);
      logger.error(`Could not create the ENS system ${id}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo crear el sistema ENS; el detalle está en el log del dashboard.');
    }
  };

  const deleteSystem = async (context: any, request: any, response: any) => {
    const id = text(request?.params?.id) || '';
    if (!isValidSystemId(id)) return failure(response, 400, 'El sistema principal no se puede eliminar.');

    const access = await administrator(context, response, 'delete a system');
    if (access.error) return access.error;

    try {
      if (!(await deleteENSSystem(internal(context), logger, id))) return failure(response, 404, `El sistema ENS «${id}» no existe.`);
      logger.info(`ENS system ${id} deleted by ${access.user!.username}; its history and verdicts are kept`);
      return correct(response, { id });
    } catch (error: any) {
      logger.error(`Could not delete the ENS system ${id}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo eliminar el sistema ENS; el detalle está en el log del dashboard.');
    }
  };

  return { getActive, save, history, systems, createSystem, deleteSystem };
};
