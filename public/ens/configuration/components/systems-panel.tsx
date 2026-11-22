import React, { useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiConfirmModal,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';

import { getSelectedSystem } from '../../../../common/ens/selected-system';
import { isDefaultSystem, isValidSystemId } from '../../../../common/ens/systems';
import { createENSSystem, deleteENSSystem } from '../../systems/systems-client';
import { getKnownENSSystems } from '../../systems/system-runtime';
import { switchENSSystem } from '../../../app/system-selector';

export const SystemsPanel = () => {
  const current = getKnownENSSystems().find(system => system.id === getSelectedSystem());
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      await createENSSystem({ id, name: name.trim() || id });
      switchENSSystem(id);
    });

  const remove = () =>
    run(async () => {
      setConfirming(false);
      await deleteENSSystem(getSelectedSystem());
      switchENSSystem('default');
    });

  const idInvalid = id !== '' && !isValidSystemId(id);

  return (
    <EuiPanel paddingSize='m' color='subdued'>
      <EuiTitle size='s'>
        <h3>Sistemas ENS</h3>
      </EuiTitle>
      <EuiSpacer size='s' />
      {error && (
        <>
          <EuiCallOut size='s' color='danger' iconType='alert' title={error} />
          <EuiSpacer size='s' />
        </>
      )}
      <EuiFlexGroup gutterSize='s' alignItems='flexEnd' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFormRow label='Identificador' isInvalid={idInvalid} error={idInvalid ? 'Minúsculas, cifras y guiones' : undefined}>
            <EuiFieldText compressed value={id} isInvalid={idInvalid} onChange={event => setId(event.target.value.trim())} />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFormRow label='Nombre'>
            <EuiFieldText compressed value={name} onChange={event => setName(event.target.value)} />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' iconType='plusInCircle' isLoading={busy} isDisabled={!isValidSystemId(id)} onClick={create}>
            Nuevo sistema
          </EuiButton>
        </EuiFlexItem>
        {current && !isDefaultSystem(current.id) && (
          <EuiFlexItem grow={false}>
            <EuiButton size='s' color='danger' iconType='trash' isDisabled={busy} onClick={() => setConfirming(true)}>
              Eliminar {current.name}
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {confirming && current && (
        <EuiConfirmModal
          title={`Eliminar el sistema ${current.name}`}
          cancelButtonText='Cancelar'
          confirmButtonText='Eliminar'
          buttonColor='danger'
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        >
          <p>Las máquinas pasan al sistema principal. Se conservan el historial y los veredictos.</p>
        </EuiConfirmModal>
      )}
    </EuiPanel>
  );
};
