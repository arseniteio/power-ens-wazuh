import React from 'react';
import { EuiText } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { describeAgentEntryRemoval } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';

export interface ENSEntryRemoval {
  agentKey: string;
  controlId?: string;
}

interface RemoveEntryModalProps {
  configuration: ENSConfigurationVersion;
  removal: ENSEntryRemoval;
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

export const RemoveEntryModal = ({ configuration, removal, onCancel, onConfirm }: RemoveEntryModalProps) => {
  const lines = describeAgentEntryRemoval(configuration, removal.agentKey, removal.controlId);
  const whole = !removal.controlId;

  return (
    <ConfirmModal
      title={whole ? `Quitar configuración de «${removal.agentKey}»` : `Quitar ${removal.controlId} de «${removal.agentKey}»`}
      confirmLabel='Quitar'
      typedWord={whole ? 'quitar' : undefined}
      danger
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <EuiText size='s'>
        <p>Se borra todo esto del documento:</p>
        <ul>
          {lines.length ? lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>) : <li>nada guardado</li>}
        </ul>
        <p>No se aplica a ningún activo. La versión anterior queda en el historial.</p>
      </EuiText>
    </ConfirmModal>
  );
};
