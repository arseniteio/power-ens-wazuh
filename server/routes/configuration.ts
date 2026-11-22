import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_CONFIGURATION_PATH, POWER_ENS_SYSTEMS_PATH } from '../../common/constants';
import { createConfigurationHandlers } from '../lib/configuration-handlers';

export const registerConfigurationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean }
): void => {
  const h = createConfigurationHandlers(options);

  const query = schema.object({ system: schema.maybe(schema.string({ maxLength: 64 })) });

  router.get({ path: POWER_ENS_CONFIGURATION_PATH, validate: { query } }, h.getActive);
  router.put(
    {
      path: POWER_ENS_CONFIGURATION_PATH,
      validate: {
        query,
        body: schema.object({
          configuration: schema.any(),
          changeReason: schema.maybe(schema.string()),
          expectedVersion: schema.maybe(
            schema.nullable(schema.object({ seqNo: schema.number(), primaryTerm: schema.number() }))
          ),
        }),
      },
    },
    h.save
  );
  router.get({ path: `${POWER_ENS_CONFIGURATION_PATH}/history`, validate: { query } }, h.history);
  router.get({ path: POWER_ENS_SYSTEMS_PATH, validate: false }, h.systems);
  router.post(
    {
      path: POWER_ENS_SYSTEMS_PATH,
      validate: { body: schema.object({ id: schema.string({ maxLength: 64 }), name: schema.maybe(schema.string({ maxLength: 200 })) }) },
    },
    h.createSystem
  );
  router.delete(
    { path: `${POWER_ENS_SYSTEMS_PATH}/{id}`, validate: { params: schema.object({ id: schema.string({ maxLength: 64 }) }) } },
    h.deleteSystem
  );
};
