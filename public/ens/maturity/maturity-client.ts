import { useCallback, useEffect, useState } from 'react';
import { POWER_ENS_MATURITY_PATH } from '../../../common/constants';
import type { ENSOrganizationMaturity } from '../../../common/ens/maturity/types';
import { getHttp } from '../../services';
import { systemQuery } from '../../../common/ens/selected-system';

const messageOf = (error: any): string => error?.body?.message || error?.message || String(error);

export const fetchOrganizationMaturity = async (): Promise<ENSOrganizationMaturity> => {
  try {
    return (await getHttp().get<{ data: ENSOrganizationMaturity }>(`${POWER_ENS_MATURITY_PATH}/organization`, { query: systemQuery() })).data;
  } catch (error) {
    throw new Error(messageOf(error));
  }
};

export const useOrganizationMaturity = () => {
  const [data, setData] = useState<ENSOrganizationMaturity | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetchOrganizationMaturity()
      .then(result => {
        setData(result);
        setError(undefined);
      })
      .catch(failure => setError(failure.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);
  return { data, error, loading, reload };
};
