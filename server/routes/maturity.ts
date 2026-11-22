import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_MATURITY_PATH } from '../../common/constants';
import { createMaturityHandlers } from '../lib/maturity-handlers';

export const registerMaturityRoutes = (router: IRouter, options: { logger: Logger }): void => {
  const h = createMaturityHandlers(options);
  router.get(
    {
      path: `${POWER_ENS_MATURITY_PATH}/organization`,
      validate: { query: schema.object({ system: schema.maybe(schema.string({ maxLength: 64 })) }) },
    },
    h.organization
  );
};
