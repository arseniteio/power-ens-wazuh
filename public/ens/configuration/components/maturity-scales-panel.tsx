import React, { useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldNumber,
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

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import { removeScale, scalesOf, setScale, thresholdsProblem } from '../../../../common/ens/maturity/assessments';
import { ENS_DEFAULT_SCALE, ENSMaturityScale } from '../../../../common/ens/maturity/types';
import { InfoTip } from '../../ui/info-tip';
import { ControlChoice } from './control-choice';

const machineLabel = (agentId?: string): string => agentId || 'Todas';

const thresholdsLabel = (thresholds: number[]): string => thresholds.map((t, i) => `L${i + 1} ${t} %`).join(' · ');

interface EditorProps {
  current?: ENSMaturityScale;
  onClose: () => void;
  onSaved: () => void;
}

const ScaleEditor = ({ current, onClose, onSaved }: EditorProps) => {
  const [controlId, setControlId] = useState(current?.controlId || '');
  const [agentId, setAgentId] = useState(current?.agentId || '');
  const [thresholds, setThresholds] = useState<number[]>(current?.thresholds || ENS_DEFAULT_SCALE);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const problem = thresholdsProblem(thresholds);

  const setThreshold = (index: number, value: string) =>
    setThresholds(previous => previous.map((t, i) => (i === index ? Number(value) : t)));

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setScale(latest, { controlId, agentId, thresholds }, current),
        reason: `Escala de madurez: ${controlId} en ${machineLabel(agentId.trim())}.`,
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
          <h1>Escala de madurez</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiFormRow label='Control' fullWidth>
          <ControlChoice value={controlId} onChange={setControlId} />
        </EuiFormRow>
        <EuiFormRow label='Máquina' fullWidth labelAppend={<InfoTip content='Id de agente de Wazuh. Vacío: todas las máquinas.' />}>
          <EuiFieldText value={agentId} onChange={event => setAgentId(event.target.value)} placeholder='Todas' fullWidth />
        </EuiFormRow>
        <EuiFormRow
          label='Porcentaje mínimo por nivel'
          fullWidth
          isInvalid={Boolean(problem)}
          error={problem}
          labelAppend={<InfoTip content='L2 cumple en BÁSICO, L3 en MEDIO y L4 en ALTO.' />}
        >
          <EuiFlexGroup gutterSize='s' responsive={false}>
            {thresholds.map((threshold, index) => (
              <EuiFlexItem key={index}>
                <EuiFieldNumber
                  prepend={`L${index + 1}`}
                  append='%'
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={event => setThreshold(index, event.target.value)}
                  compressed
                />
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFormRow>
        {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        <EuiButton fill onClick={save} isLoading={busy} isDisabled={busy || !controlId || Boolean(problem)}>
          Guardar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

export const MaturityScalesPanel = ({ configuration, onSaved }: { configuration: ENSConfigurationVersion; onSaved: () => void }) => {
  const [editing, setEditing] = useState<{ current?: ENSMaturityScale } | undefined>();
  const [error, setError] = useState<string | undefined>();

  const remove = async (scale: ENSMaturityScale) => {
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: removeScale(latest, scale),
        reason: `Escala de madurez retirada: ${scale.controlId} en ${machineLabel(scale.agentId)}.`,
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
            <h3>Escalas de madurez</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <InfoTip content={`Porcentaje de elementos conformes que da cada nivel en las evidencias con recuento. Sin escala: ${thresholdsLabel(ENS_DEFAULT_SCALE)}.`} />
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
      <EuiBasicTable<ENSMaturityScale>
        compressed
        items={scalesOf(configuration)}
        noItemsMessage='Sin escalas: se usa la escala por defecto.'
        columns={[
          { field: 'controlId', name: 'Control', width: '110px' },
          { field: 'agentId', name: 'Máquina', width: '120px', render: (agentId?: string) => machineLabel(agentId) },
          { field: 'thresholds', name: 'Porcentaje mínimo', render: (thresholds: number[]) => thresholdsLabel(thresholds) },
          {
            name: '',
            width: '160px',
            render: (scale: ENSMaturityScale) => (
              <>
                <EuiButtonEmpty size='xs' onClick={() => setEditing({ current: scale })}>
                  Editar
                </EuiButtonEmpty>
                <EuiButtonEmpty size='xs' color='danger' onClick={() => remove(scale)}>
                  Quitar
                </EuiButtonEmpty>
              </>
            ),
          },
        ]}
      />
      {editing && <ScaleEditor current={editing.current} onClose={() => setEditing(undefined)} onSaved={onSaved} />}
    </EuiPanel>
  );
};
