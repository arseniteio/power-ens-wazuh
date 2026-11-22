import { POWER_ENS_SYSTEMS_PATH } from '../../../common/constants';
import type { ENSSystemScope, ENSSystemSummary } from '../../../common/ens/systems';
import { getHttp } from '../../services';

const messageOf = (error: any): string => error?.body?.message || error?.message || String(error);

const asked = async <T>(request: () => Promise<{ data: T }>): Promise<T> => {
  try {
    return (await request()).data;
  } catch (error) {
    throw new Error(messageOf(error));
  }
};

export const fetchENSSystems = (): Promise<ENSSystemScope[]> =>
  asked(() => getHttp().get<{ data: ENSSystemScope[] }>(POWER_ENS_SYSTEMS_PATH));

export const createENSSystem = (system: ENSSystemSummary): Promise<ENSSystemSummary> =>
  asked(() => getHttp().post<{ data: ENSSystemSummary }>(POWER_ENS_SYSTEMS_PATH, { body: JSON.stringify(system) }));

export const deleteENSSystem = (id: string): Promise<ENSSystemSummary> =>
  asked(() => getHttp().delete<{ data: ENSSystemSummary }>(`${POWER_ENS_SYSTEMS_PATH}/${encodeURIComponent(id)}`));
