import React from 'react';
import { EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import type { ENSGlobalConfiguration } from '../../../../common/ens/configuration/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSION_NAMES,
  categoryLabel,
  findDimensionsAboveENSLevel,
} from '../../../../common/ens/core/control-level';
import { configurationSearchChanges } from '../../../routing/configuration-link';
import { useSetRouterSearch } from '../../../routing/use-router-search';

const describeIncoherentLevelsLine = (global?: Partial<ENSGlobalConfiguration>): string | undefined => {
  const above = findDimensionsAboveENSLevel(global);

  if (!above.length || !global) {
    return undefined;
  }

  const list = above.map(d => `${ENS_DIMENSION_NAMES[d]} (${d}) ${global[ENS_DIMENSION_LEVEL_KEYS[d]]}`).join(', ');

  return `Niveles incoherentes: ${list} ${above.length === 1 ? 'supera' : 'superan'} la categoría del sistema ${categoryLabel(global.ensLevel)}.`;
};

export const IncoherentLevelsNotice = ({ global }: { global?: Partial<ENSGlobalConfiguration> }) => {
  const updateUrl = useSetRouterSearch();
  const line = describeIncoherentLevelsLine(global);

  if (!line) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        size='s'
        color='warning'
        iconType='alert'
        title={
          <>
            {line}{' '}
            <EuiLink onClick={() => updateUrl(configurationSearchChanges({ view: 'general' }))}>
              Corregir en Configuración &gt; General
            </EuiLink>
          </>
        }
      />
      <EuiSpacer size='s' />
    </>
  );
};
