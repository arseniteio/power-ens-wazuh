import React, { useState } from 'react';
import {
  EuiBadge,
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
  EuiText,
} from '@elastic/eui';

import type {
  ENSAgentParameterValue,
  ENSControlConfiguration,
  ENSControlParameter,
  ENSMatchMode,
  ENSSystemType,
} from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPES, ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import { ENSControlTemplate, describeTemplate } from '../../../../common/ens/configuration/templates';
import type { ENSTemplateInput } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import {
  getParameterClass,
  isAgentLevelParameter,
} from '../../../../common/ens/configuration/agents/parameter-classes';
import { isEmptyParameterValue } from '../../../../common/ens/configuration/services/parameter-value-validator';
import { withMatchMode } from '../../../../common/ens/configuration/services/parameter-pattern';
import { ParameterRendererFactory } from '../form-engine';
import { valueRows } from './agent-parameter-row';
import { Choice } from '../../ui/choice';

export type ENSTemplateEditorMode = 'view' | 'create' | 'edit';

interface TemplateEditorModalProps {
  mode: ENSTemplateEditorMode;
  control: ENSControlConfiguration;
  template?: ENSControlTemplate;
  usage: string[];
  onCancel: () => void;
  onSave: (input: Omit<ENSTemplateInput, 'controlId'>) => Promise<string | undefined>;
}

const Rows = ({ rows }: { rows: string[] }) =>
  rows.length ? <ul>{rows.map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}</ul> : null;

export const templateParameters = (control: ENSControlConfiguration): ENSControlParameter[] =>
  control.parameters.filter(parameter => isAgentLevelParameter(control.controlId, parameter.id));

const TITLES: Record<ENSTemplateEditorMode, string> = {
  view: 'Plantilla',
  create: 'Crear plantilla',
  edit: 'Editar plantilla',
};

export const TemplateEditorModal = ({ mode, control, template, usage, onCancel, onSave }: TemplateEditorModalProps) => {
  const readOnly = mode === 'view';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [systemType, setSystemType] = useState<string>(template?.systemType || '');
  const [values, setValues] = useState<Record<string, ENSAgentParameterValue | undefined>>(() => ({ ...(template?.values || {}) }));
  const [modes, setModes] = useState<Record<string, ENSMatchMode>>(() => ({ ...(template?.matchModes || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const clean: Record<string, ENSAgentParameterValue> = {};
    const matchModes: Record<string, ENSMatchMode> = {};
    Object.entries(values).forEach(([parameterId, value]) => {
      const typed = value as ENSAgentParameterValue | undefined;
      if (typed === undefined || isEmptyParameterValue(typed)) return;
      clean[parameterId] = typed;
      if (modes[parameterId] === 'regex') matchModes[parameterId] = 'regex';
    });
    const failure = await onSave({
      name,
      description,
      systemType: (systemType || undefined) as ENSSystemType | undefined,
      values: clean,
      matchModes,
    });
    if (failure) {
      setSaving(false);
      setError(failure);
    }
  };

  return (
    <EuiModal onClose={onCancel} style={{ width: 900 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h3>{`${TITLES[mode]}${readOnly && template ? ` «${template.name}»` : ''} · ${control.controlId}`}</h3>
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        {template && (
          <EuiBadge color={template.builtin ? 'hollow' : 'primary'}>{template.builtin ? 'De serie' : 'Propia'}</EuiBadge>
        )}
        {usage.length > 0 && (
          <EuiText size='s' color='subdued'>
            <p>Asignada a {usage.length} activo(s): {usage.join(', ')}.</p>
          </EuiText>
        )}
        {readOnly ? (
          <EuiText size='s'>
            {template && describeTemplate(template) && <p>{describeTemplate(template)}</p>}
            {template?.systemType && <p>Tipo de sistema: {ENS_SYSTEM_TYPE_LABELS[template.systemType]}</p>}
          </EuiText>
        ) : (
          <>
            <EuiFormRow label='Nombre' fullWidth>
              <EuiFieldText value={name} fullWidth onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)} />
            </EuiFormRow>
            <EuiFormRow label='Descripción' fullWidth>
              <EuiFieldText value={description} fullWidth onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)} />
            </EuiFormRow>
            <EuiFormRow label='Tipo de sistema' >
              <Choice
                legend='Tipo de sistema'
                options={[{ value: '', text: 'Cualquiera' }, ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: ENS_SYSTEM_TYPE_LABELS[type] }))]}
                value={systemType}
                onChange={(value: string) => setSystemType(value)}
              />
            </EuiFormRow>
          </>
        )}

        <EuiSpacer size='m' />

        {templateParameters(control).map(parameter => {
          const value = values[parameter.id];
          const empty = value === undefined || isEmptyParameterValue(value);
          return (
            <React.Fragment key={parameter.id}>
              <EuiPanel paddingSize='s'>
                <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
                  <EuiFlexItem grow={false}>
                    <EuiText size='s'><strong>{parameter.id} · {parameter.label}</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color='hollow'>{getParameterClass(control.controlId, parameter.id) === 'system' ? 'cambia por activo' : 'de la plataforma'}</EuiBadge>
                  </EuiFlexItem>
                  {empty && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color='default'>sin valor: toma el valor por defecto</EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                {readOnly ? (
                  <EuiText size='xs'><Rows rows={valueRows(parameter, value as ENSControlParameter['value'], modes[parameter.id])} /></EuiText>
                ) : (
                  <>
                    <ParameterRendererFactory
                      parameter={withMatchMode(parameter, modes[parameter.id])}
                      value={value as ENSControlParameter['value']}
                      onChange={(_name, next) => setValues(current => ({ ...current, [parameter.id]: next as ENSAgentParameterValue }))}
                      onMatchModeChange={(_name, mode) => setModes(current => ({ ...current, [parameter.id]: mode }))}
                    />
                    {!empty && (
                      <EuiButtonEmpty
                        size='xs'
                        color='danger'
                        onClick={() => {
                          setValues(current => ({ ...current, [parameter.id]: undefined }));
                          setModes(current => ({ ...current, [parameter.id]: 'exact' }));
                        }}
                      >
                        Vaciar (valor por defecto)
                      </EuiButtonEmpty>
                    )}
                  </>
                )}
              </EuiPanel>
              <EuiSpacer size='s' />
            </React.Fragment>
          );
        })}

        {error && <EuiCallOut color='danger' iconType='alert' size='s' title={error} />}
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty onClick={onCancel}>{readOnly ? 'Cerrar' : 'Cancelar'}</EuiButtonEmpty>
        {!readOnly && (
          <EuiButton fill isLoading={saving} onClick={save}>
            Guardar plantilla
          </EuiButton>
        )}
      </EuiModalFooter>
    </EuiModal>
  );
};
