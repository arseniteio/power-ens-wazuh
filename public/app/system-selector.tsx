import React from 'react';
import { EuiButtonGroup, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { getSelectedSystem, selectSystem } from '../../common/ens/selected-system';
import { getKnownENSSystems } from '../ens/systems/system-runtime';

export const switchENSSystem = (system: string): void => {
  selectSystem(system);
  window.location.reload();
};

export const SystemSelector = () => {
  const systems = getKnownENSSystems();
  if (systems.length < 2) return null;

  return (
    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size='s'>
          <strong>Sistema ENS</strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          legend='Sistema ENS'
          buttonSize='compressed'
          idSelected={getSelectedSystem()}
          options={systems.map(system => ({ id: system.id, label: system.name }))}
          onChange={id => id !== getSelectedSystem() && switchENSSystem(id)}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
