import React from 'react';
import { EuiFormRow, EuiLink, EuiText } from '@elastic/eui';

import type { ENSControlParameter } from '../../../../../common/ens/configuration/types';
import type {
  ENSOrganizationDataItem,
} from '../../../../../common/ens/configuration/organization/organization-data-items';
import { organizationValueLines } from '../../../../../common/ens/configuration/organization/organization-data-form';
import { useSetRouterSearch } from '../../../../routing/use-router-search';
import { configurationSearchChanges } from '../../../../routing/configuration-link';
import { ParameterLabel } from './parameter-label';

interface OrganizationParameterRendererProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  item: ENSOrganizationDataItem;
}

export const OrganizationParameterRenderer = ({ parameter, value, item }: OrganizationParameterRendererProps) => {
  const setSearch = useSetRouterSearch();
  const lines = organizationValueLines(value);
  return (
    <EuiFormRow label={<ParameterLabel parameter={parameter} />} fullWidth>
      <EuiText size='s'>
        {lines.length ? (
          <ul>
            {lines.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>Sin valor</p>
        )}
        <p>
          {'Ámbito organización · '}
          <EuiLink onClick={() => setSearch(configurationSearchChanges({ view: 'organization', itemId: item.id }))}>
            {`Ir a «${item.label}»`}
          </EuiLink>
        </p>
      </EuiText>
    </EuiFormRow>
  );
};
