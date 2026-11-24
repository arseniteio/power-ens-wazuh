import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENS_OUT_OF_GROUP_LABEL } from '../../../../common/ens/core/scope/evaluable-groups';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE } from '../../../../common/agent-configuration';
import { getControlTemplates } from '../../../../common/ens/configuration/templates';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import {
  getAgentMeasurementPlane,
  getControlMeasurementPlanes,
} from '../../../../common/ens/core/scope/measurement-planes';
import { getEffectiveTemplate } from '../../../../common/ens/configuration/agents/configuration-resolver';
import {
  ENSAssignmentPreview,
  describeTemplateChoice,
  getAgentCompleteness,
  previewControlAssignment,
  setControlTemplateAssignment,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { ChangePreviewModal } from './change-preview-modal';
import { errorMessage } from './confirm-modal';
import { agentTypeLabel } from './labels';
import { ENSAgentRow, agentRowLabel } from './use-agents-data';
import { Choice } from '../../ui/choice';
import { OsIcon, osKindOf } from '../groups/os-icon';

interface ControlAssignmentPanelProps {
  configuration: ENSConfigurationVersion;
  controlId: string;
  rows: ENSAgentRow[];
  loading: boolean;
  activeLevel: ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

const BY_TYPE = '__type';

const describeEffectiveTemplate = (configuration: ENSConfigurationVersion, row: ENSAgentRow, controlId: string): string => {
  const effective = getEffectiveTemplate(configuration, row.id, controlId);
  if (effective.template) return `${effective.template.name}${effective.via === 'type' ? ' (de serie, por su tipo)' : ''}`;
  if (effective.assignedId === ENS_NO_TEMPLATE) return 'Sin plantilla (valores por defecto)';
  const type = agentTypeLabel(configuration.agents?.[row.id], row.detection);
  if (type.stored) return 'Ninguna: valores por defecto';
  return type.pending ? 'Ninguna hasta guardar su tipo: valores por defecto' : 'Ninguna: sin tipo, valores por defecto';
};

export const ControlAssignmentPanel = ({
  configuration,
  controlId,
  rows,
  loading,
  activeLevel,
  onNavigate,
  onConfigurationSaved,
}: ControlAssignmentPanelProps) => {
  const templates = getControlTemplates(configuration, controlId);
  const planes = getControlMeasurementPlanes(getENSCatalogControl(controlId) || {});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [choice, setChoice] = useState<string>('');
  const [preview, setPreview] = useState<{ previews: ENSAssignmentPreview[]; templateId?: string } | undefined>();
  const [notice, setNotice] = useState<{ color: 'success' | 'danger'; text: string } | undefined>();
  const [tableKey, setTableKey] = useState(0);

  const missing = useMemo(() => {
    const byId = new Map<string, string[]>();
    rows.forEach(row => byId.set(row.id, getAgentCompleteness(configuration, row.id, [{ controlId, level: activeLevel }]).missingRequired));
    return byId;
  }, [configuration, rows, controlId, activeLevel]);

  const templateIdOf = (value: string): string | undefined => (value === BY_TYPE ? undefined : value);

  const openPreview = () => {
    if (!choice || !selectedIds.length) return;
    try {
      const templateId = templateIdOf(choice);
      setPreview({ previews: previewControlAssignment(configuration, controlId, selectedIds, templateId).previews, templateId });
    } catch (failure) {
      setNotice({ color: 'danger', text: errorMessage(failure) });
    }
  };

  const apply = async (): Promise<string | undefined> => {
    if (!preview) return undefined;
    const ids = preview.previews.map(item => item.agentId);
    const label = describeTemplateChoice(configuration, controlId, preview.templateId);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setControlTemplateAssignment(
          latest,
          controlId,
          ids,
          preview.templateId,
          Object.fromEntries(rows.filter(row => ids.includes(row.id)).map(row => [row.id, row.agent]))
        ),
        reason: `${controlId}: plantilla ${label} para ${ids.join(', ')}.`,
      }));
      setNotice({ color: 'success', text: `${controlId}: plantilla ${label} para ${ids.join(', ')}.` });
      setPreview(undefined);
      setSelectedIds([]);
      setTableKey(key => key + 1);
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      return errorMessage(failure);
    }
  };

  const labels = Object.fromEntries(rows.map(row => [row.id, agentRowLabel(row)]));

  const columns: EuiBasicTableColumn<ENSAgentRow>[] = [
    {
      field: 'id',
      name: 'Activo',
      render: (_id: string, row: ENSAgentRow) => (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => onNavigate({ view: 'agents', agentId: row.id, controlId })}>
          <OsIcon kind={osKindOf({ id: row.id, os: row.agent.os })} size={16} /> {agentRowLabel(row)}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'detection',
      name: 'Tipo',
      render: (_detection: unknown, row: ENSAgentRow) => {
        const type = agentTypeLabel(configuration.agents?.[row.id], row.detection, loading);
        return <EuiBadge color={type.color}>{type.text}</EuiBadge>;
      },
    },
    {
      field: 'agent',
      name: 'Plantilla',
      render: (_agent: unknown, row: ENSAgentRow) => {
        const measured = planes.includes(getAgentMeasurementPlane(row.id));
        return (
          <div>
            <EuiText size='xs'><p>{describeEffectiveTemplate(configuration, row, controlId)}</p></EuiText>
            {!measured && (
              <EuiText size='xs' color='subdued'>
                <p>{planes.includes('manager') ? 'Se evalúa en el manager, con las filas de todos los activos.' : 'No se evalúa en el manager.'}</p>
              </EuiText>
            )}
          </div>
        );
      },
    },
    {
      field: 'inScope',
      name: 'Personalizados',
      render: (_inScope: boolean, row: ENSAgentRow) => {
        const own = Object.keys(configuration.agents?.[row.id]?.controls?.[controlId]?.parameters || {}).length;
        const required = missing.get(row.id) || [];
        return (
          <EuiText size='xs'>
            <p>
              {own ? `${own} personalizado(s)` : 'Ninguno'}
              {required.length ? ` · ${required.length} obligatorio(s) sin valor` : ''}
              {!row.inScope ? ` · ${ENS_OUT_OF_GROUP_LABEL}` : ''}
            </p>
          </EuiText>
        );
      },
    },
  ];

  return (
    <>
      <EuiTitle size='s'>
        <h3>Asignación</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>Plantilla por activo</p>
      </EuiText>
      <EuiSpacer size='s' />

      {notice && (
        <>
          <EuiCallOut color={notice.color} iconType={notice.color === 'success' ? 'check' : 'alert'} size='s' title={notice.text} />
          <EuiSpacer size='s' />
        </>
      )}

      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <Choice
            legend='Plantilla que se asigna'
            options={[
              { value: '', text: 'Elegir plantilla…' },
              { value: BY_TYPE, text: 'Detectado automáticamente' },
              ...templates.map(template => ({ value: template.id, text: `${template.name}${template.builtin ? ' (de serie)' : ''}` })),
              { value: ENS_NO_TEMPLATE, text: 'Sin plantilla (valores por defecto)' },
            ]}
            value={choice}
            onChange={(value: string) => setChoice(value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' isDisabled={!choice || !selectedIds.length} onClick={openPreview}>
            Asignar a {selectedIds.length} agente(s)…
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />

      <EuiBasicTable
        key={tableKey}
        items={rows}
        itemId='id'
        columns={columns}
        loading={loading}
        isSelectable
        selection={{ onSelectionChange: (items: ENSAgentRow[]) => setSelectedIds(items.map(item => item.id)) }}
        noItemsMessage='No hay activos en el alcance.'
      />

      {preview && (
        <ChangePreviewModal
          title={`Asignar ${describeTemplateChoice(configuration, controlId, preview.templateId)} en ${controlId} a ${preview.previews.length} activo(s)`}
          confirmLabel='Asignar'
          intro='Los valores personalizados se mantienen.'
          configuration={configuration}
          agentLabels={labels}
          previews={preview.previews}
          onCancel={() => setPreview(undefined)}
          onConfirm={apply}
        />
      )}
    </>
  );
};
