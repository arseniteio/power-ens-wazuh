import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPES, ENS_SYSTEM_TYPE_LABELS, ENSSystemType } from '../../../../common/agent-configuration';
import { setAgentParameterValue, setAgentTypeOverride } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import { handPickedHosts, isHandPicked, newHandPickedGroup, withHosts } from '../../../../common/ens/profiles/groups';
import type { ENSProfile } from '../../../../common/ens/profiles/types';
import { PARAMETER_GROUPS } from '../profiles/parameter-groups';
import { ENSParameterEdit, ParameterValueEditor, emptyValueFor } from '../profiles/parameter-value-editor';
import { controlTitle } from '../profiles/parameter-titles';
import type { ENSHostRow } from '../profiles/profiles-client';
import { Choice } from '../../ui/choice';

export const hostnameOf = (host: Pick<ENSHostRow, 'hostname' | 'name'>): string => host.hostname || host.name;

const agentOf = (host: ENSHostRow) => ({ id: host.agentId, name: host.name, os: host.os });

const slug = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

export const TYPE_TEMPLATE_OPTIONS = [
  { value: '', text: 'Detectado automáticamente' },
  ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: `${ENS_SYSTEM_TYPE_LABELS[type]}` })),
  { value: ENS_NO_TEMPLATE, text: 'Sin plantilla' },
];

const Frame = ({
  title,
  busy,
  error,
  disabled,
  confirm,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  error?: string;
  disabled?: boolean;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <EuiModal onClose={onClose} style={{ width: 600 }}>
    <EuiModalHeader>
      <EuiModalHeaderTitle>
        <h1>{title}</h1>
      </EuiModalHeaderTitle>
    </EuiModalHeader>
    <EuiModalBody>
      {children}
      {error && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut size='s' color='danger' iconType='alert' title={error} />
        </>
      )}
    </EuiModalBody>
    <EuiModalFooter>
      <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
      <EuiButton fill onClick={onConfirm} isLoading={busy} isDisabled={busy || disabled}>
        {confirm}
      </EuiButton>
    </EuiModalFooter>
  </EuiModal>
);

const machinesText = (count: number): string => (count === 1 ? '1 activo' : `${count} activos`);

export const AddToGroupModal = ({
  hosts,
  groups,
  onStage,
  onClose,
}: {
  hosts: ENSHostRow[];
  groups: ENSProfile[];
  onStage: (profile: ENSProfile) => void;
  onClose: () => void;
}) => {
  const manual = groups.filter(isHandPicked);
  const [choice, setChoice] = useState(manual[0]?.id || '');
  const [name, setName] = useState('');
  const takenId = groups.some(group => group.id === slug(name));
  const names = hosts.map(hostnameOf);

  const confirm = () => {
    if (choice) {
      const group = manual.find(item => item.id === choice)!;
      onStage(withHosts(group, names));
    } else {
      onStage(newHandPickedGroup(slug(name), name.trim(), names));
    }
    onClose();
  };

  return (
    <Frame
      title={`Añadir ${machinesText(hosts.length)} a un grupo`}
      busy={false}
      confirm='Añadir'
      disabled={!choice && (!name.trim() || takenId)}
      onConfirm={confirm}
      onClose={onClose}
    >
      <EuiSpacer size='m' />
      <EuiFormRow label='Grupo' fullWidth>
        <Choice
          legend='Grupo'
          options={[...manual.map(group => ({ value: group.id, text: `${group.name} (${handPickedHosts(group).length})` })), { value: '', text: 'Un grupo nuevo…' }]}
          value={choice}
          onChange={(value: string) => setChoice(value)}
        />
      </EuiFormRow>
      {!choice && (
        <EuiFormRow label='Nombre del grupo nuevo' isInvalid={takenId} error={takenId ? 'Ya hay un grupo con ese nombre.' : undefined} fullWidth>
          <EuiFieldText fullWidth value={name} onChange={event => setName(event.target.value)} />
        </EuiFormRow>
      )}
    </Frame>
  );
};

export const TypeTemplateModal = ({
  hosts,
  onSaved,
  onClose,
}: {
  hosts: ENSHostRow[];
  onSaved: () => void;
  onClose: () => void;
}) => {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    const type = (choice || undefined) as ENSSystemType | typeof ENS_NO_TEMPLATE | undefined;
    const label = TYPE_TEMPLATE_OPTIONS.find(option => option.value === choice)?.text || choice;
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: hosts.reduce((next, host) => setAgentTypeOverride(next, host.agentId, type, agentOf(host)), latest),
        reason: `Plantilla de ${machinesText(hosts.length)}: ${label}.`,
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
    <Frame title={`Plantilla de ${machinesText(hosts.length)}`} busy={busy} error={error} confirm='Aplicar' onConfirm={confirm} onClose={onClose}>
      <EuiSpacer size='m' />
      <EuiFormRow label='Plantilla' fullWidth>
        <Choice
          legend='Plantilla'
          options={TYPE_TEMPLATE_OPTIONS}
          value={choice}
          onChange={(value: string) => setChoice(value)}
        />
      </EuiFormRow>
    </Frame>
  );
};

export const BulkValueModal = ({
  hosts,
  onSaved,
  onClose,
}: {
  hosts: ENSHostRow[];
  onSaved: () => void;
  onClose: () => void;
}) => {
  const [key, setKey] = useState('');
  const [edit, setEdit] = useState<ENSParameterEdit | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [controlId, parameterId] = key.split('|');
  const parameter = PARAMETER_GROUPS.find(group => group.controlId === controlId)?.parameters.find(item => item.parameterId === parameterId);

  const options = [
    { value: '', text: 'Ninguno' },
    ...PARAMETER_GROUPS.flatMap(group =>
      group.parameters.map(item => ({ value: `${group.controlId}|${item.parameterId}`, text: `${group.controlId} · ${item.label}` }))
    ),
  ];

  const confirm = async () => {
    if (!parameter || !edit) return;
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: hosts.reduce(
          (next, host) => setAgentParameterValue(next, host.agentId, controlId, parameterId, edit.value, agentOf(host), edit.matchMode),
          latest
        ),
        reason: `${controlId} ${parameterId}: valor propio en ${machinesText(hosts.length)}.`,
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
    <Frame
      title={`Cambiar un valor en ${machinesText(hosts.length)}`}
      busy={busy}
      error={error}
      confirm='Aplicar'
      disabled={!parameter || !edit}
      onConfirm={confirm}
      onClose={onClose}
    >
      <EuiSpacer size='m' />
      <EuiFormRow label='Parámetro' fullWidth>
        <Choice
          legend='Parámetro'
          options={options}
          value={key}
          onChange={(value: string) => {
            const [nextControl, nextParameter] = value.split('|');
            const type = PARAMETER_GROUPS.find(group => group.controlId === nextControl)?.parameters.find(item => item.parameterId === nextParameter)?.type;
            setKey(value);
            setEdit(type ? { value: emptyValueFor(type), replace: false } : undefined);
          }}
        />
      </EuiFormRow>
      {parameter && edit && (
        <>
          <EuiText size='xs' color='subdued'>
            <p>{controlTitle(controlId)}</p>
          </EuiText>
          <EuiSpacer size='s' />
          <ParameterValueEditor
            key={key}
            controlId={controlId}
            parameterId={parameterId}
            edit={edit}
            readOnly={false}
            onChange={setEdit}
            onRemove={() => setKey('')}
          />
        </>
      )}
    </Frame>
  );
};
