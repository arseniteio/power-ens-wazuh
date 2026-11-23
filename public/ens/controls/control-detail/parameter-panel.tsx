import React, { useMemo, useState } from 'react';
import { EuiBadge, EuiButtonEmpty, EuiFieldSearch, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSParameterColumn } from '../../../../common/ens/configuration/types';
import { TableRows } from '../../ui/table-rows';
import { resolveControlConfigurationWithOrigins } from '../../../../common/ens/configuration/agents/configuration-resolver';
import { describeValueOrigin } from '../parameter-origins';

const VALUES_PREVIEW = 24;
const SEARCH_FROM = 25;
const MACHINES_PREVIEW = 6;

export interface MachineRef {
  agentId: string;
  agentName?: string;
}

interface ParameterValueGroup {
  rows: string[];
  regex: boolean;
  origin: string;
  machines: MachineRef[];
}

export interface ParameterView {
  id: string;
  label: string;
  description: string;
  columns?: ENSParameterColumn[];
  groups: ParameterValueGroup[];
}

const rowsOf = (value: unknown): string[] => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)];
};

export const machineName = (machine: MachineRef): string =>
  machine.agentName && machine.agentName !== machine.agentId ? `${machine.agentName} (${machine.agentId})` : machine.agentId;

export const resolveParameterViews = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  parameterIds: string[],
  machines: MachineRef[]
): ParameterView[] =>
  parameterIds.flatMap(id => {
    const groups = new Map<string, ParameterValueGroup>();
    let label = id;
    let description = '';
    let columns: ENSParameterColumn[] | undefined;
    for (const machine of machines.length ? machines : [{ agentId: '' }]) {
      const resolved = resolveControlConfigurationWithOrigins(configuration, controlId, machine.agentId || undefined);
      const parameter = resolved?.configuration.parameters.find(p => p.id === id);
      if (!resolved || !parameter) continue;
      label = parameter.label || parameter.name;
      description = parameter.description;
      columns = parameter.type === 'table' ? parameter.columns : undefined;
      const rows = rowsOf(parameter.value);
      const origin = describeValueOrigin(resolved.origins[id], rows.length === 0);
      const regex = parameter.matchMode === 'regex';
      const key = JSON.stringify([rows, regex, origin]);
      const group = groups.get(key) || { rows, regex, origin, machines: [] };
      if (machine.agentId) group.machines.push(machine);
      groups.set(key, group);
    }
    return groups.size ? [{ id, label, description, columns, groups: [...groups.values()] }] : [];
  });

const MachineList = ({ machines }: { machines: MachineRef[] }) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? machines : machines.slice(0, MACHINES_PREVIEW);
  return (
    <EuiText size='xs' color='subdued'>
      <span>{visible.map(machineName).join(', ')}</span>
      {!showAll && machines.length > MACHINES_PREVIEW && (
        <EuiButtonEmpty size='xs' onClick={() => setShowAll(true)}>
          {`y ${machines.length - MACHINES_PREVIEW} más`}
        </EuiButtonEmpty>
      )}
    </EuiText>
  );
};

const ValueRows = ({ rows, regex, columns }: { rows: string[]; regex: boolean; columns?: ENSParameterColumn[] }) => {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? rows.filter(row => row.toLowerCase().includes(needle)) : rows;
  }, [rows, filter]);
  const visible = showAll || filter ? filtered : filtered.slice(0, VALUES_PREVIEW);

  if (!rows.length) {
    return <EuiBadge color='warning'>Sin valor</EuiBadge>;
  }
  if (regex) {
    return (
      <EuiText size='s'>
        <span>Expresión regular </span>
        <code>{rows[0]}</code>
      </EuiText>
    );
  }
  if (columns?.length) {
    return <TableRows rows={filtered} columns={columns} preview={showAll || filter ? filtered.length : VALUES_PREVIEW} />;
  }
  return (
    <>
      {rows.length >= SEARCH_FROM && (
        <>
          <EuiFieldSearch compressed placeholder={`Buscar en ${rows.length} valores`} value={filter} onChange={e => setFilter(e.target.value)} />
          <EuiSpacer size='xs' />
        </>
      )}
      <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
        {visible.map(row => (
          <EuiFlexItem grow={false} key={row}>
            <EuiBadge color='hollow'>{row}</EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
      {!showAll && !filter && filtered.length > VALUES_PREVIEW && (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => setShowAll(true)}>
          {`Mostrar los ${filtered.length}`}
        </EuiButtonEmpty>
      )}
    </>
  );
};

export const ParameterPanel = ({ view, onConfigure }: { view: ParameterView; onConfigure?: (id: string) => void }) => (
  <EuiPanel hasBorder paddingSize='s'>
    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiBadge color='hollow' iconType='gear'>
          {view.id}
        </EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size='s'>
          <strong>{view.label}</strong>
        </EuiText>
      </EuiFlexItem>
      {onConfigure && (
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size='xs' onClick={() => onConfigure(view.id)}>
            Configurar
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
    {view.description && (
      <EuiText size='xs' color='subdued'>
        <p style={{ margin: '4px 0 8px' }}>{view.description}</p>
      </EuiText>
    )}
    {view.groups.map((group, i) => (
      <div key={i} style={{ marginTop: i ? 10 : 0 }}>
        <EuiText size='xs' color='subdued'>
          <span>
            {`Valor${group.rows.length > 1 ? ` · ${group.rows.length} entradas` : ''} · ${group.origin}`}
          </span>
        </EuiText>
        {view.groups.length > 1 && group.machines.length > 0 && <MachineList machines={group.machines} />}
        <EuiSpacer size='xs' />
        <ValueRows rows={group.rows} regex={group.regex} columns={view.columns} />
      </div>
    ))}
  </EuiPanel>
);
