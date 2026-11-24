import React, { useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import {
  ENSLevelAdjustment,
  removeLevelAdjustment,
  setLevelAdjustment,
} from '../../../../common/ens/configuration/levels/level-adjustments';
import { Choice } from '../../ui/choice';
import { InfoTip } from '../../ui/info-tip';
import { ControlChoice } from './control-choice';

const LEVEL_OPTIONS = (['BAJO', 'MEDIO', 'ALTO'] as const).map(value => ({ value, text: value }));

const machineLabel = (agentId?: string): string => agentId || 'Todos';

interface EditorProps {
  current?: ENSLevelAdjustment;
  onClose: () => void;
  onSaved: () => void;
}

const AdjustmentEditor = ({ current, onClose, onSaved }: EditorProps) => {
  const [controlId, setControlId] = useState(current?.controlId || '');
  const [agentId, setAgentId] = useState(current?.agentId || '');
  const [level, setLevel] = useState<string>(current?.level || '');
  const [reason, setReason] = useState(current?.reason || '');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const complete = Boolean(controlId && level && reason.trim());

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const next: ENSLevelAdjustment = { controlId, agentId, level: level as ENSLevel, reason };
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setLevelAdjustment(latest, next, current),
        reason: `Ajuste de nivel: ${controlId} en ${machineLabel(agentId.trim())}, ${level}.`,
      }));
      onSaved();
      onClose();
    } catch (failure: any) {
      setError(failure?.message || String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <EuiModal onClose={onClose} style={{ width: 640 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Ajuste de nivel</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiFormRow label='Control' fullWidth>
          <ControlChoice value={controlId} onChange={setControlId} />
        </EuiFormRow>
        <EuiFormRow label='Activo' fullWidth labelAppend={<InfoTip content='Id de agente de Wazuh. Vacío: todos los activos.' />}>
          <EuiFieldText value={agentId} onChange={event => setAgentId(event.target.value)} placeholder='Todos' fullWidth />
        </EuiFormRow>
        <EuiFormRow label='Nivel' fullWidth labelAppend={<InfoTip content='Solo rebaja el nivel vigente del control; un nivel superior no se aplica.' />}>
          <Choice legend='Nivel' options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
        </EuiFormRow>
        <EuiFormRow label='Motivo' fullWidth>
          <EuiFieldText value={reason} onChange={event => setReason(event.target.value)} fullWidth />
        </EuiFormRow>
        {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton fill onClick={save} isLoading={busy} isDisabled={busy || !complete}>
          Guardar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

export const LevelAdjustmentsPanel = ({ configuration, onSaved }: { configuration: ENSConfigurationVersion; onSaved: () => void }) => {
  const [editing, setEditing] = useState<{ current?: ENSLevelAdjustment } | undefined>();
  const [error, setError] = useState<string | undefined>();

  const remove = async (adjustment: ENSLevelAdjustment) => {
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: removeLevelAdjustment(latest, adjustment),
        reason: `Ajuste de nivel retirado: ${adjustment.controlId} en ${machineLabel(adjustment.agentId)}.`,
      }));
      onSaved();
    } catch (failure: any) {
      setError(failure?.message || String(failure));
    }
  };

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size='xs'>
            <h3>Ajustes de nivel</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <InfoTip content='Nivel inferior al vigente para un control, en todos los activos o en uno.' />
        </EuiFlexItem>
        <EuiFlexItem />
        <EuiFlexItem grow={false}>
          <EuiButton size='s' onClick={() => setEditing({})}>
            Añadir
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      <EuiBasicTable<ENSLevelAdjustment>
        compressed
        items={configuration.levelAdjustments || []}
        noItemsMessage='Sin ajustes.'
        columns={[
          { field: 'controlId', name: 'Control', width: '110px' },
          { field: 'agentId', name: 'Activo', width: '120px', render: (agentId?: string) => machineLabel(agentId) },
          { field: 'level', name: 'Nivel', width: '90px' },
          { field: 'reason', name: 'Motivo' },
          {
            name: '',
            width: '160px',
            render: (adjustment: ENSLevelAdjustment) => (
              <>
                <EuiButtonEmpty size='xs' onClick={() => setEditing({ current: adjustment })}>
                  Editar
                </EuiButtonEmpty>
                <EuiButtonEmpty size='xs' color='danger' onClick={() => remove(adjustment)}>
                  Quitar
                </EuiButtonEmpty>
              </>
            ),
          },
        ]}
      />
      {editing && <AdjustmentEditor current={editing.current} onClose={() => setEditing(undefined)} onSaved={onSaved} />}
    </EuiPanel>
  );
};
