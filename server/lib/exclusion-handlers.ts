import type { Logger } from '../../../../src/core/server';
import { parseExclusionChange, parseExclusionTarget } from '../../common/ens/exclusions';
import { resolveCurrentUser } from './current-user';
import { appendExclusion, readLatestExclusion } from './exclusion-storage';

interface Options {
  logger: Logger;
  securityEnabled: boolean;
}

const NO_ROLE = 'Hace falta el rol power_ens_admin o all_access para excluir un activo de un control.';

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

export const createExclusionHandlers = ({ logger, securityEnabled }: Options) => {
  const internal = (context: any) => context.core.opensearch.client.asInternalUser;
  const actual = (context: any) => context.core.opensearch.client.asCurrentUser;
  const currentUser = (context: any) => resolveCurrentUser(actual(context), securityEnabled);

  const canChange = async (context: any): Promise<boolean> => {
    try {
      const user = await currentUser(context);
      return user.administrator && Boolean(user.username);
    } catch (error: any) {
      logger.warn(`ENS exclusions: could not identify the user, changes stay hidden: ${error?.message || error}`);
      return false;
    }
  };

  const status = async (context: any, request: any, response: any) => {
    const target = parseExclusionTarget(request.query?.agentId, request.query?.controlId);
    if (typeof target === 'string') return failure(response, 400, target);

    try {
      const latest = await readLatestExclusion(actual(context), target.agentId, target.controlId);
      return correct(response, { latest, canChange: await canChange(context) });
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 401 || status === 403) return failure(response, status, 'No tienes permiso para leer los motivos de exclusión.');
      logger.error(`Could not read the exclusions of ${target.agentId} in ${target.controlId}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo leer el motivo de exclusión; el detalle está en el log del dashboard.');
    }
  };

  const record = async (context: any, request: any, response: any) => {
    const change = parseExclusionChange(request.body);
    if (typeof change === 'string') return failure(response, 400, change);

    let username: string;
    try {
      const user = await currentUser(context);
      if (!user.administrator) return failure(response, 403, NO_ROLE);
      if (!user.username) return failure(response, 401, 'No se pudo identificar al usuario.');
      username = user.username;
    } catch (error: any) {
      return failure(response, statusOf(error), error?.message || 'No se pudo comprobar el usuario.');
    }

    try {
      const saved = { ...change, user: username, date: new Date().toISOString() };
      await appendExclusion(internal(context), saved);
      logger.info(`ENS exclusions: ${username} recorded ${change.action} for ${change.agentId} in ${change.controlId}`);
      return correct(response, saved);
    } catch (error: any) {
      logger.error(`Could not record the exclusion of ${change.agentId} in ${change.controlId}: ${error?.message || error}`);
      return failure(response, 500, 'No se pudo guardar el motivo; el detalle está en el log del dashboard.');
    }
  };

  return { status, record };
};
