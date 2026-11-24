import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSControlConfiguration } from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import { ENSControlTemplate, getControlTemplates } from '../../../../common/ens/configuration/templates';
import { getEffectiveTemplate } from '../../../../common/ens/configuration/agents/configuration-resolver';
import {
  ENSAgentChangePreview,
  ENSTemplateInput,
  createControlTemplate,
  deleteControlTemplate,
  duplicateControlTemplate,
  getTemplateUsage,
  previewConfigurationChange,
  updateControlTemplate,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import { ChangePreviewModal } from './change-preview-modal';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { plural } from './labels';
import { ENSTemplateEditorMode, TemplateEditorModal, templateParameters } from './template-editor-modal';
import { ENSAgentRow, agentRowLabel } from './use-agents-data';
import { Choice } from '../../ui/choice';

interface ControlTemplatesPanelProps {
  configuration: ENSConfigurationVersion;
  control: ENSControlConfiguration;
  rows: ENSAgentRow[];
  onConfigurationSaved: () => void;
}

type Editor = { mode: ENSTemplateEditorMode; template?: ENSControlTemplate } | undefined;
type TemplateEdit = Omit<ENSTemplateInput, 'controlId'>;

const TYPE_DEFAULT = '';

export const ControlTemplatesPanel = ({ configuration, control, rows, onConfigurationSaved }: ControlTemplatesPanelProps) => {
  const controlId = control.controlId;
  const templates = getControlTemplates(configuration, controlId);
  const total = templateParameters(control).length;
  const labels = Object.fromEntries(rows.map(row => [row.id, agentRowLabel(row)]));
  const [editor, setEditor] = useState<Editor>();
  const [pendingEdit, setPendingEdit] = useState<{ template: ENSControlTemplate; input: TemplateEdit; previews: ENSAgentChangePreview[] } | undefined>();
  const [removal, setRemoval] = useState<ENSControlTemplate | undefined>();
  const [reassignTo, setReassignTo] = useState<string>(TYPE_DEFAULT);
  const [notice, setNotice] = useState<{ color: 'success' | 'danger'; text: string } | undefined>();

  const save = async (
    build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion,
    reason: string
  ): Promise<string | undefined> => {
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: build(latest), reason }));
      setNotice({ color: 'success', text: reason });
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      return errorMessage(failure);
    }
  };

  const duplicate = async (template: ENSControlTemplate) => {
    const name = duplicateControlTemplate(configuration, controlId, template.id).template.name;
    const failure = await save(
      latest => duplicateControlTemplate(latest, controlId, template.id, name).configuration,
      `${controlId}: «${name}» creada desde «${template.name}».`
    );
    if (failure) setNotice({ color: 'danger', text: failure });
  };

  const usage = (template: ENSControlTemplate) => getTemplateUsage(configuration, controlId, template.id);
  const byType = (template: ENSControlTemplate) =>
    rows.filter(row => {
      const effective = getEffectiveTemplate(configuration, row.id, controlId);
      return row.inScope && effective.via === 'type' && effective.template?.id === template.id;
    }).length;

  const saveEditor = async (input: TemplateEdit) => {
    const current = editor?.template;
    if (current && editor?.mode === 'edit') {
      const users = usage(current);
      if (users.length) {
        try {
          const next = updateControlTemplate(configuration, current.id, input);
          setPendingEdit({ template: current, input, previews: previewConfigurationChange(configuration, next, users, [controlId]) });
          setEditor(undefined);
          return undefined;
        } catch (failure) {
          return errorMessage(failure);
        }
      }
      const failure = await save(latest => updateControlTemplate(latest, current.id, input), `${controlId}: plantilla «${input.name}» guardada.`);
      if (!failure) setEditor(undefined);
      return failure;
    }
    const failure = await save(latest => createControlTemplate(latest, { ...input, controlId }).configuration, `${controlId}: plantilla «${input.name}» creada.`);
    if (!failure) setEditor(undefined);
    return failure;
  };

  const confirmEdit = async () => {
    if (!pendingEdit) return undefined;
    const { template, input } = pendingEdit;
    const failure = await save(latest => updateControlTemplate(latest, template.id, input), `${controlId}: plantilla «${input.name}» guardada.`);
    if (!failure) setPendingEdit(undefined);
    return failure;
  };

  const confirmRemoval = async () => {
    if (!removal) return undefined;
    const users = usage(removal);
    const target = reassignTo === TYPE_DEFAULT ? undefined : reassignTo;
    const destination = target === undefined ? 'la de serie de su tipo' : target === ENS_NO_TEMPLATE ? 'sin plantilla' : `«${templates.find(item => item.id === target)?.name || target}»`;
    const failure = await save(
      latest => deleteControlTemplate(latest, removal.id, users.length ? { templateId: target } : undefined),
      `${controlId}: plantilla «${removal.name}» borrada${users.length ? `; ${users.join(', ')} pasan a ${destination}` : ''}.`
    );
    if (!failure) setRemoval(undefined);
    return failure;
  };

  const columns: EuiBasicTableColumn<ENSControlTemplate>[] = [
    {
      field: 'name',
      name: 'Plantilla',
      render: (name: string, template: ENSControlTemplate) => (
        <span>
          {name}{' '}
          <EuiBadge color={template.builtin ? 'hollow' : 'primary'}>{template.builtin ? 'De serie' : 'Propia'}</EuiBadge>
          {template.builtin && !template.typeDefault && <EuiBadge color='default'>alternativa</EuiBadge>}
        </span>
      ),
    },
    {
      field: 'systemType',
      name: 'Tipo',
      render: (type: ENSControlTemplate['systemType']) => (type ? ENS_SYSTEM_TYPE_LABELS[type] : 'Cualquiera'),
    },
    {
      field: 'values',
      name: 'Valores',
      render: (values: ENSControlTemplate['values']) => `${Object.keys(values).length} de ${total}`,
    },
    {
      field: 'id',
      name: 'Activos',
      render: (_id: string, template: ENSControlTemplate) => {
        const assigned = usage(template).length;
        const typed = byType(template);
        const parts = [assigned ? `${plural(assigned, 'asignado', 'asignados')}` : '', typed ? `${typed} por su tipo` : ''].filter(Boolean);
        return parts.length ? parts.join(' · ') : '—';
      },
    },
    {
      field: 'id',
      name: 'Acciones',
      render: (_id: string, template: ENSControlTemplate) => (
        <span>
          <EuiButtonEmpty size='xs' onClick={() => setEditor({ mode: 'view', template })}>Ver</EuiButtonEmpty>
          <EuiButtonEmpty size='xs' onClick={() => duplicate(template)}>Duplicar</EuiButtonEmpty>
          {!template.builtin && (
            <>
              <EuiButtonEmpty size='xs' onClick={() => setEditor({ mode: 'edit', template })}>Editar</EuiButtonEmpty>
              <EuiButtonEmpty size='xs' color='danger' onClick={() => { setReassignTo(TYPE_DEFAULT); setRemoval(template); }}>Borrar</EuiButtonEmpty>
            </>
          )}
        </span>
      ),
    },
  ];

  const removalUsers = removal ? usage(removal) : [];

  return (
    <>
      <EuiTitle size='s'>
        <h3>Plantillas</h3>
      </EuiTitle>
      <EuiSpacer size='s' />

      {notice && (
        <>
          <EuiCallOut color={notice.color} iconType={notice.color === 'success' ? 'check' : 'alert'} size='s' title={notice.text} />
          <EuiSpacer size='s' />
        </>
      )}

      <EuiBasicTable items={templates} itemId='id' columns={columns} noItemsMessage='Este control no tiene plantillas.' />
      <EuiSpacer size='s' />
      <EuiButton size='s' iconType='plusInCircle' onClick={() => setEditor({ mode: 'create' })}>
        Crear plantilla
      </EuiButton>

      {editor && (
        <TemplateEditorModal
          mode={editor.mode}
          control={control}
          template={editor.template}
          usage={editor.template ? usage(editor.template).map(id => labels[id] || id) : []}
          onCancel={() => setEditor(undefined)}
          onSave={saveEditor}
        />
      )}

      {pendingEdit && (
        <ChangePreviewModal
          title={`Guardar «${pendingEdit.input.name}»: cambia ${plural(pendingEdit.previews.filter(preview => preview.changes.length).length, 'activo', 'activos')}`}
          confirmLabel='Guardar plantilla'
          intro='Los valores personalizados de cada activo se mantienen.'
          configuration={configuration}
          agentLabels={labels}
          previews={pendingEdit.previews}
          onCancel={() => {
            setEditor({ mode: 'edit', template: { ...pendingEdit.template, ...pendingEdit.input } as ENSControlTemplate });
            setPendingEdit(undefined);
          }}
          onConfirm={confirmEdit}
        />
      )}

      {removal && (
        <ConfirmModal
          title={`Borrar la plantilla «${removal.name}»`}
          confirmLabel='Borrar'
          danger
          typedWord={removalUsers.length ? 'borrar' : undefined}
          onCancel={() => setRemoval(undefined)}
          onConfirm={confirmRemoval}
        >
          <EuiText size='s'>
            {removalUsers.length ? (
              <p>Está asignada a {plural(removalUsers.length, 'activo', 'activos')}: {removalUsers.map(id => labels[id] || id).join(', ')}. Antes de borrarla se les asigna otra.</p>
            ) : (
              <p>No está asignada a ningún activo.</p>
            )}
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
          {removalUsers.length > 0 && (
            <EuiFormRow label='Reasignar sus activos a'>
              <Choice
                legend='Reasignar sus activos a'
                options={[
                  { value: TYPE_DEFAULT, text: 'Detectado automáticamente' },
                  ...templates.filter(item => item.id !== removal.id).map(item => ({ value: item.id, text: item.name })),
                  { value: ENS_NO_TEMPLATE, text: 'Sin plantilla (valores por defecto)' },
                ]}
                value={reassignTo}
                onChange={(value: string) => setReassignTo(value)}
              />
            </EuiFormRow>
          )}
        </ConfirmModal>
      )}
    </>
  );
};
