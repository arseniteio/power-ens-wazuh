import type { Logger } from '../../../../src/core/server';
import { buildOrganizationMaturityRequest, organizationMaturityOf } from '../../common/ens/maturity/queries';
import { isDefaultSystem, isValidSystemId, systemOf } from '../../common/ens/systems';

interface Options {
  logger: Logger;
}

const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

export const createMaturityHandlers = ({ logger }: Options) => {
  const organization = async (context: any, request: any, response: any) => {
    const system = systemOf(request?.query?.system);
    if (!isDefaultSystem(system) && !isValidSystemId(system)) {
      return response.customError({ statusCode: 400, body: { message: `«${system}» no es un identificador de sistema ENS válido.` } });
    }
    try {
      const result = await context.core.opensearch.client.asCurrentUser.search(buildOrganizationMaturityRequest(system));
      return response.ok({ body: { statusCode: 200, error: 0, data: organizationMaturityOf(result.body) } });
    } catch (error: any) {
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        return response.customError({ statusCode: 403, body: { message: 'No tienes permiso para leer el índice oscompliance-verdicts.' } });
      }
      logger.error(`Could not read the organization maturity: ${error?.message || error}`);
      return response.customError({ statusCode: 500, body: { message: 'No se pudo leer la madurez; el detalle está en el log del dashboard.' } });
    }
  };

  return { organization };
};
