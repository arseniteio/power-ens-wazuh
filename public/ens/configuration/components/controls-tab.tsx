import React, { useMemo, useState } from 'react';
import { withInventoryTypes } from '../../../../common/ens/configuration/agents/system-detection';
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiInMemoryTable,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE } from '../../../../common/agent-configuration';
import { ENSConfigurationRegistry, getENSControlConfiguration } from '../../../../common/ens/configuration/registry';
import { resolveControlConfigurationState } from '../../../../common/ens/configuration/services/validation-engine';
import { getBuiltinTemplates, getCustomTemplates } from '../../../../common/ens/configuration/templates';
import { effectiveSystemType } from '../../../../common/ens/configuration/agents/system-detection';
import {
  addMissingControls,
  getAgentGaps,
  getMissingCatalogControls,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { errorMessage } from './confirm-modal';
import { ControlPage, commonView } from './control-page';
import { plural } from './labels';
import { ENSAgentsData, buildAgentRows, useAgentsData } from './use-agents-data';

interface ControlsTabProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

interface ControlRow {
  id: string;
  catalog: ENSControlConfiguration;
  control?: ENSControlConfiguration;
}

const STATES: Record<string, { label: string; color: 'success' | 'danger' | 'warning' | 'default' }> = {
  CONFIGURED: { label: 'Configurado', color: 'success' },
  INCOMPLETE: { label: 'Incompleto', color: 'danger' },
  INVALID: { label: 'Inválido', color: 'danger' },
  NOT_CONFIGURED: { label: 'Sin configurar', color: 'warning' },
  MISSING: { label: 'Sin añadir', color: 'default' },
};

const MAX_LINES = 3;

export const ControlsTab = (props: ControlsTabProps) => {
  const data = useAgentsData();
  const { target, getActiveLevel, onNavigate, onConfigurationSaved } = props;
  const configuration = useMemo(() => withInventoryTypes(props.configuration, data.inventory), [props.configuration, data.inventory]);
  const selected = target.controlId ? configuration.controls.find(control => control.controlId === target.controlId) : undefined;

  return (
    <>
      <ControlsList {...props} configuration={configuration} data={data} />
      {selected && (
        <EuiFlyout size='l' ownFocus onClose={() => onNavigate({ view: 'controls' })} aria-labelledby='ens-control-flyout-title'>
          <EuiFlyoutHeader hasBorder>
            <EuiBadge color='hollow'>{selected.controlId}</EuiBadge>
            <EuiTitle size='s'>
              <h2 id='ens-control-flyout-title'>{selected.controlName}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <ControlPage
              key={selected.controlId}
              configuration={configuration}
              control={selected}
              activeLevel={getActiveLevel(selected.controlId)}
              focusParameterId={target.parameterId}
              data={data}
              onNavigate={onNavigate}
              onConfigurationSaved={onConfigurationSaved}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};

const ControlsList = ({ configuration, target, getActiveLevel, onNavigate, onConfigurationSaved, data }: ControlsTabProps & { data: ENSAgentsData }) => {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const rows = useMemo(() => buildAgentRows(configuration, data).filter(row => row.inScope), [configuration, data]);
  const gaps: Record<string, Record<string, number>> = useMemo(
    () =>
      data.loading
        ? {}
        : getAgentGaps(
            configuration,
            rows.map(row => ({ agentId: row.id, type: effectiveSystemType(row.detection, configuration.agents?.[row.id]).type })),
            getActiveLevel
          ),
    [configuration, rows, data.loading, getActiveLevel]
  );
  const missing = getMissingCatalogControls(configuration);

  const add = async (controlIds: string[], key: string) => {
    setAdding(key);
    setError(undefined);
    try {
      const done = await saveFromLatestConfiguration(latest => {
        const result = addMissingControls(latest, controlIds);
        return result.added.length
          ? { configuration: result.configuration, reason: `Añadido ${result.added.join(', ')}.` }
          : undefined;
      });
      if (done) onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setAdding(undefined);
    }
  };

  const q = query.trim().toLowerCase();
  const items: ControlRow[] = ENSConfigurationRegistry.map(catalog => ({
    id: catalog.controlId,
    catalog,
    control: configuration.controls.find(control => control.controlId === catalog.controlId),
  })).filter(row => !q || row.id.includes(q) || row.catalog.controlName.toLowerCase().includes(q));

  const nameOf = (control: ENSControlConfiguration, parameterId: string) =>
    control.parameters.find(parameter => parameter.id === parameterId)?.label || parameterId;

  const stateOf = (row: ControlRow): { key: string; lines: string[] } => {
    if (!row.control) return { key: 'MISSING', lines: [] };
    const control = row.control;
    const state = resolveControlConfigurationState(commonView(control), getActiveLevel(row.id));
    const lines =
      state.status === 'INCOMPLETE'
        ? state.validation.missingRequired.map(parameter => `Falta «${parameter.label}».`)
        : state.status === 'INVALID'
        ? state.validation.issues.map(issue => `«${issue.label}» no es válido.`)
        : [];
    const perAgent = Object.entries(gaps[row.id] || {}).map(([parameterId, count]) => `Falta «${nameOf(control, parameterId)}» en ${plural(count, 'activo', 'activos')}.`);
    const key = perAgent.length && (state.status === 'CONFIGURED' || state.status === 'NOT_CONFIGURED') ? 'INCOMPLETE' : state.status;
    const all = [...lines, ...perAgent];
    return { key, lines: all.length > MAX_LINES ? [...all.slice(0, MAX_LINES), `Y ${all.length - MAX_LINES} más.`] : all };
  };

  const columns: EuiBasicTableColumn<ControlRow>[] = [
    {
      field: 'id',
      name: 'Control',
      width: '40%',
      sortable: true,
      render: (id: string, row: ControlRow) =>
        row.control ? (
          <EuiLink onClick={() => onNavigate({ view: 'controls', controlId: id })}>
            {id} · {row.catalog.controlName}
          </EuiLink>
        ) : (
          <EuiText size='s'><span>{id} · {row.catalog.controlName}</span></EuiText>
        ),
    },
    {
      field: 'catalog',
      name: 'Estado',
      render: (_catalog: unknown, row: ControlRow) => {
        const state = stateOf(row);
        return (
          <div>
            <EuiBadge color={STATES[state.key].color}>{STATES[state.key].label}</EuiBadge>
            {state.lines.map(line => (
              <EuiText key={line} size='xs' color='subdued'><p>{line}</p></EuiText>
            ))}
          </div>
        );
      },
    },
    {
      field: 'control',
      name: 'Plantillas',
      width: '200px',
      render: (_control: unknown, row: ControlRow) => {
        const builtins = getBuiltinTemplates(row.id).length;
        if (!builtins) return <EuiText size='xs' color='subdued'><span>—</span></EuiText>;
        const own = getCustomTemplates(configuration, row.id).length;
        const assigned = rows.filter(agent => {
          const templateId = configuration.agents?.[agent.id]?.controls?.[row.id]?.templateId;
          return typeof templateId === 'string' && templateId !== ENS_NO_TEMPLATE;
        }).length;
        return (
          <EuiText size='xs'>
            <span title={`${builtins} de serie · ${own} propias`}>{`${builtins + own}${assigned ? ` · ${plural(assigned, 'activo asignado', 'activos asignados')}` : ''}`}</span>
          </EuiText>
        );
      },
    },
    {
      field: 'id',
      name: '',
      width: '120px',
      align: 'right',
      render: (id: string, row: ControlRow) =>
        row.control ? null : (
          <EuiButton size='s' fill={id === target.controlId} isLoading={adding === id} isDisabled={!!adding} onClick={() => add([id], id)}>
            Añadir
          </EuiButton>
        ),
    },
  ];

  return (
    <>
      {target.controlId && !configuration.controls.some(control => control.controlId === target.controlId) && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${target.controlId} no está en la configuración`}>
            <p>
              {getENSControlConfiguration(target.controlId) ? 'Fuera de la configuración' : `${target.controlId} no está en el catálogo.`}
            </p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem style={{ maxWidth: 360 }}>
          <EuiFieldSearch compressed placeholder='Buscar control' value={query} onChange={e => setQuery(e.target.value)} isClearable />
        </EuiFlexItem>
        <EuiFlexItem />
        {missing.length > 1 && (
          <EuiFlexItem grow={false}>
            <EuiButton size='s' isLoading={adding === '*'} isDisabled={!!adding} onClick={() => add(missing.map(control => control.controlId), '*')}>
              {`Añadir los ${missing.length} que faltan`}
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo añadir'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiInMemoryTable
        items={items}
        itemId='id'
        columns={columns}
        loading={data.loading}
        pagination={{ initialPageSize: 25, pageSizeOptions: [25, 50] }}
        message='Ningún control coincide.'
      />
    </>
  );
};
