import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHealth,
  EuiInMemoryTable,
  EuiLink,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { useSetRouterSearch } from '../../routing/use-router-search';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../../app/tabs';
import type { ENSOverviewEvaluationResponse, ENSSummaryEvaluationResponse } from '../../../common/ens/evaluation/types';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { describeNotMeasuredOnAgent, isManagerOnlyControl } from '../../../common/ens/core/scope/measurement-planes';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  describePendingMeasurement,
  isPendingMeasurement,
} from '../../../common/ens/catalog/support/measurement-plan';
import { getActiveControlConfiguration } from '../../../common/ens/configuration/services';
import { ENS_STATUS_COLORS, ENS_STATUS_ORDER, statusBadgeColor } from '../status-colors';
import { ENS_NO_RESULT_PATTERN, ENS_THEME } from '../theme-colors';
import {
  buildMachineSummaries,
  buildMatrix,
  buildTrend,
  buildWorkQueue,
  CONTROL_BAR_STATUSES,
  controlBar,
  describeAge,
  describeOverviewPending,
  FleetFilter,
  fleetFigures,
  inFleetFilter,
  MachineSummary,
  machineLabel,
  MatrixRow,
  matrixCsv,
  overviewMachines,
} from './overview-model';
import { statusLabel } from '../../../common/ens/core/status-label';
import { dateTimeLabel } from '../../../common/ens/core/date-label';
import { OPERATIONAL_INDICATOR_NOTE } from '../../../common/ens/catalog/support/provenance';
import { downloadCsv } from '../download-csv';
import { InfoTip } from '../ui/info-tip';
import { ExplainedText } from '../ui/explained-text';

const PAGE_SIZE = 25;

interface ControlFilter {
  controlId: string;
  status: string;
  agents: string[];
}

const Figure = ({ title, value, active, color, onClick }: { title: string; value: number; active: boolean; color?: string; onClick: () => void }) => (
  <EuiPanel hasBorder paddingSize='s' onClick={onClick} style={active ? { borderColor: ENS_THEME.primary } : undefined}>
    <EuiStat title={value} description={title} titleSize='s' titleColor={color} reverse />
  </EuiPanel>
);

const ControlBar = ({ row, total, onPick }: { row: MatrixRow; total: number; onPick: (status: string, agents: string[]) => void }) => {
  const bar = controlBar(row);
  const measured = CONTROL_BAR_STATUSES.reduce((n, s) => n + bar[s].length, 0);
  if (row.pendingMeasurement) return <EuiText size='xs' color='subdued'><span title={row.pendingMeasurement}>{ENS_PENDING_MEASUREMENT_LABEL}</span></EuiText>;
  if (row.pending) return <EuiText size='xs' color='subdued'>Calculando…</EuiText>;
  if (!measured) return <EuiText size='xs' color='subdued'>Sin datos</EuiText>;
  return (
    <div style={{ display: 'flex', height: 18, borderRadius: 3, overflow: 'hidden', background: ENS_NO_RESULT_PATTERN }}>
      {CONTROL_BAR_STATUSES.filter(s => bar[s].length).map(s => (
        // A tooltip anchor would wrap the segment in an inline box and leave its percentage width at zero.
        <button
          key={s}
          type='button'
          title={`${statusLabel(s)}: ${bar[s].length}`}
          aria-label={`${statusLabel(s)}: ${bar[s].length} máquinas`}
          onClick={() => onPick(s, bar[s])}
          style={{ width: `${(bar[s].length / Math.max(total, measured)) * 100}%`, height: 18, background: ENS_STATUS_COLORS[s], border: 0, padding: 0, cursor: 'pointer' }}
        />
      ))}
    </div>
  );
};

const Trend = ({ agentId, onOpen }: { agentId: string; onOpen: (controlId: string) => void }) => {
  const trend = useEnsEvaluation<ENSSummaryEvaluationResponse>({ include: 'summary', timelineDays: 30, timelineControls: true, agentId });
  const series = useMemo(() => buildTrend(trend.data?.timeline, ENSControls.map(c => c.id)), [trend.data]);
  const pending = Boolean(trend.data?.meta?.pending) || (Boolean(trend.data?.meta?.seriesPending) && !(trend.data?.timeline || []).length);
  if (trend.error) return <FactsReadErrorCallOut error={trend.error} onRetry={trend.retry} />;
  if (!trend.data || pending) return <EvaluationLoading message='Calculando…' />;
  if (!series.points.length) return <EuiText size='s' color='subdued'><p>Sin datos en los últimos 30 días.</p></EuiText>;
  return (
    <>
      <EuiText size='xs' color='subdued'>
        <p>{`Índice medio diario${series.delta !== undefined ? ` · ${series.delta >= 0 ? '+' : ''}${series.delta} puntos` : ''}`}</p>
      </EuiText>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, paddingLeft: 92 }}>
        {series.points.map(p => (
          <EuiToolTip key={p.date} content={`${p.label}: ${typeof p.score === 'number' ? `${p.score}%` : 'sin datos'}`}>
            <div style={{ width: 10, height: `${Math.max(2, ((p.score as number) || 0) * 0.45)}px`, background: ENS_THEME.primary, opacity: p.isCurrent ? 1 : 0.55 }} />
          </EuiToolTip>
        ))}
      </div>
      <EuiSpacer size='s' />
      {series.rows.map(row => (
        <div key={row.controlId} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
          <EuiLink onClick={() => onOpen(row.controlId)} style={{ width: 90, fontSize: 12, fontWeight: row.changed ? 700 : 400 }}>
            {row.controlId}
          </EuiLink>
          {row.cells.map(c => (
            <span
              key={c.date}
              title={`${c.label}: ${statusLabel(c.status) || 'sin resultado'}${typeof c.score === 'number' ? ` ${c.score}%` : ''}`}
              style={{ width: 10, height: 12, display: 'inline-block', background: c.status ? ENS_STATUS_COLORS[c.status] || ENS_STATUS_COLORS.NO_EVALUABLE : ENS_NO_RESULT_PATTERN }}
            />
          ))}
        </div>
      ))}
    </>
  );
};

const MachineFlyout = ({
  machine,
  matrix,
  data,
  nameOf,
  now,
  onOpen,
  onClose,
}: {
  machine: MachineSummary;
  matrix: MatrixRow[];
  data: ENSOverviewEvaluationResponse;
  nameOf: (id: string) => string | undefined;
  now: number;
  onOpen: (controlId: string) => void;
  onClose: () => void;
}) => {
  const controls = matrix
    .map(row => ({ row, cell: row.cells[machine.agentId] }))
    .filter(({ cell }) => cell?.kind === 'result')
    .map(({ row, cell }) => ({ id: row.controlId, title: row.title, ...(cell as Extract<typeof cell, { kind: 'result' }>) }))
    .sort((a, b) => ENS_STATUS_ORDER.indexOf(b.status) - ENS_STATUS_ORDER.indexOf(a.status) || a.id.localeCompare(b.id));
  const queue = buildWorkQueue(data.nonConformities, machine.agentId, id => Boolean(getActiveControlConfiguration(id)), nameOf);

  return (
    <EuiFlyout onClose={onClose} size='m' ownFocus aria-labelledby='machine-flyout-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size='s'>
          <h2 id='machine-flyout-title'>{machineLabel(machine)}</h2>
        </EuiTitle>
        <EuiText size='xs' color={machine.stale ? 'danger' : 'subdued'}>
          <p>{`Último dato: ${describeAge(machine.newest, now)}`}</p>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTitle size='xs'>
          <h3>Controles</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        <EuiBasicTable
          compressed
          items={controls}
          noItemsMessage='Ningún control medido.'
          columns={[
            { field: 'id', name: 'Control', width: '110px', render: (id: string, c: any) => <EuiLink onClick={() => onOpen(id)} title={c.title}>{id}</EuiLink> },
            { field: 'title', name: 'Título', truncateText: true },
            {
              field: 'status',
              name: 'Estado',
              width: '130px',
              render: (s: string, c: any) => <EuiBadge color={statusBadgeColor(s)}>{`${statusLabel(s)}${typeof c.score === 'number' ? ` ${c.score}%` : ''}`}</EuiBadge>,
            },
            { field: 'notMet', name: 'Requisitos fallando', width: '150px', render: (n: number) => n || '—' },
          ]}
        />
        <EuiSpacer size='l' />
        <EuiTitle size='xs'>
          <h3>Cola de trabajo</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        {!queue.length && (
          <EuiText size='s' color='subdued'>
            <p>Sin no conformidades abiertas.</p>
          </EuiText>
        )}
        {queue.map(group => (
          <EuiAccordion
            key={group.owner}
            id={`queue-${machine.agentId}-${group.owner}`}
            initialIsOpen={group.classification.order <= 1}
            paddingSize='s'
            buttonContent={
              <span>
                <EuiBadge color={group.classification.badgeColor} iconType={group.classification.icon}>
                  {group.classification.action}
                </EuiBadge>{' '}
                {`${group.owner} · ${group.items.length}`}
              </span>
            }
          >
            <EuiInMemoryTable
              compressed
              items={group.items.map((it, i) => ({ ...it, id: `${it.nc.controlId}-${it.nc.id}-${i}` }))}
              pagination={group.items.length > 10 ? { initialPageSize: 10, hidePerPageOptions: true } : false}
              columns={[
                { field: 'controlId', name: 'Control', width: '110px', render: (id: string) => <EuiLink onClick={() => onOpen(id)}>{id}</EuiLink> },
                { field: 'nc', name: 'Requisito', width: '120px', render: (nc: any) => (nc.requirementIds || [nc.requirementId]).join(', ') },
                {
                  field: 'title',
                  name: 'Qué falla',
                  render: (title: string, it: any) => (
                    <EuiText size='xs'>
                      <span>
                        {it.evidenceId && <EuiBadge color='hollow'>{it.evidenceId}</EuiBadge>} <ExplainedText controlId={it.controlId} text={title} />
                      </span>
                    </EuiText>
                  ),
                },
              ]}
            />
          </EuiAccordion>
        ))}
        <EuiSpacer size='l' />
        <EuiTitle size='xs'>
          <h3>Últimos 30 días</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        <Trend agentId={machine.agentId} onOpen={onOpen} />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

export const OverviewENS = () => {
  const updateUrl = useSetRouterSearch();
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('all');
  const [controlFilter, setControlFilter] = useState<ControlFilter | undefined>();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | undefined>();

  const general = useEnsEvaluation<ENSOverviewEvaluationResponse>({ include: 'overview' });
  const data = general.data;
  const now = data ? Date.parse(data.meta.evaluatedAt) || Date.now() : Date.now();
  const machines = useMemo(() => overviewMachines(data?.meta.scope || []), [data]);
  const nameOf = (id: string) => machines.find(m => m.agentId === id)?.agentName;

  const matrix = useMemo(
    () =>
      data
        ? buildMatrix(ENSControls.map(c => ({ id: c.id, title: c.title })), machines, data.controls, data.agents || [], {
            isManagerOnly: id => {
              const catalog = getENSCatalogControl(id);
              return Boolean(catalog && isManagerOnlyControl(catalog));
            },
            pendingMeasurement: id => {
              const catalog = getENSCatalogControl(id);
              return catalog && isPendingMeasurement(catalog) ? describePendingMeasurement(catalog) : undefined;
            },
            notMeasuredReason: (id, agent) => {
              const catalog = getENSCatalogControl(id);
              return catalog ? describeNotMeasuredOnAgent(catalog, agent, nameOf(agent), getActiveControlConfiguration(id, agent))?.text : undefined;
            },
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, machines]
  );
  const summaries = useMemo(
    () => (data ? buildMachineSummaries(machines, data.agents || [], data.freshness, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, machines]
  );
  const figures = fleetFigures(summaries);
  const inProgress = describeOverviewPending(data?.meta.pending);

  const q = query.trim().toLowerCase();
  const listed = summaries.filter(
    m =>
      inFleetFilter(m, fleetFilter) &&
      (!controlFilter || controlFilter.agents.includes(m.agentId)) &&
      (!q || m.agentId.includes(q) || (m.agentName || '').toLowerCase().includes(q))
  );
  const selectedMachine = summaries.find(m => m.agentId === selected);

  const openDetail = (controlId: string, agent?: string) => updateUrl({ tabView: ENS_CONTROL_DETAIL_TAB_ID, control: controlId, agentId: agent });
  const pickFleet = (f: FleetFilter) => setFleetFilter(fleetFilter === f ? 'all' : f);

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size='m'>
              <h2>Vista general</h2>
            </EuiTitle>
          </EuiFlexItem>
          {data && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size='s'
                iconType='exportAction'
                onClick={() => downloadCsv(`power-ens-matriz-${dateTimeLabel(now).replace(/[ ,:]+/g, '-')}.csv`, matrixCsv(matrix, machines))}
              >
                Exportar matriz
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size='s' />
        {general.error ? (
          <FactsReadErrorCallOut error={general.error} onRetry={general.retry} />
        ) : !data ? (
          <EvaluationLoading message='Calculando…' />
        ) : (
          <>
            <EvaluationStatusLine meta={data.meta} refreshing={general.isRefreshing} onRetry={general.retry} />
            {inProgress && (
              <>
                <EuiSpacer size='s' />
                <EuiCallOut size='s' color='primary' iconType='clock' title={inProgress.title} />
              </>
            )}
            <EuiSpacer size='m' />

            <EuiFlexGroup gutterSize='s' responsive={false} wrap>
              <EuiFlexItem><Figure title='Máquinas' value={figures.all} active={fleetFilter === 'all'} onClick={() => setFleetFilter('all')} /></EuiFlexItem>
              <EuiFlexItem><Figure title='Cumplimiento total' value={figures.ok} color='success' active={fleetFilter === 'ok'} onClick={() => pickFleet('ok')} /></EuiFlexItem>
              <EuiFlexItem><Figure title='Con incumplimientos' value={figures.failing} color='danger' active={fleetFilter === 'failing'} onClick={() => pickFleet('failing')} /></EuiFlexItem>
              <EuiFlexItem><Figure title='Sin datos en 24 h' value={figures.stale} color='subdued' active={fleetFilter === 'stale'} onClick={() => pickFleet('stale')} /></EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size='l' />
            <EuiTitle size='s'>
              <h3>
                Estado por control <InfoTip content={OPERATIONAL_INDICATOR_NOTE} />
              </h3>
            </EuiTitle>
            <EuiSpacer size='s' />
            <EuiFlexGroup gutterSize='s' wrap responsive={false}>
              {ENS_STATUS_ORDER.map(s => (
                <EuiFlexItem grow={false} key={s}>
                  <EuiHealth color={ENS_STATUS_COLORS[s]}>{statusLabel(s)}</EuiHealth>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
            <EuiSpacer size='s' />
            {matrix.map(row => (
              <EuiFlexGroup key={row.controlId} gutterSize='s' alignItems='center' responsive={false} style={{ marginBottom: 4 }}>
                <EuiFlexItem grow={false} style={{ width: 90 }}>
                  <EuiLink onClick={() => openDetail(row.controlId)}>{row.controlId}</EuiLink>
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ width: 260 }}>
                  <EuiText size='xs' color='subdued'>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title}>
                      {row.title}
                    </span>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <ControlBar row={row} total={machines.length} onPick={(status, agents) => setControlFilter({ controlId: row.controlId, status, agents })} />
                </EuiFlexItem>
              </EuiFlexGroup>
            ))}

            <EuiSpacer size='l' />
            <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiTitle size='s'>
                  <h3>Máquinas</h3>
                </EuiTitle>
              </EuiFlexItem>
              {controlFilter && (
                <EuiFlexItem grow={false}>
                  <EuiBadge
                    color={statusBadgeColor(controlFilter.status)}
                    iconType='cross'
                    iconSide='right'
                    iconOnClick={() => setControlFilter(undefined)}
                    iconOnClickAriaLabel='Quitar filtro'
                  >
                    {`${controlFilter.controlId}: ${statusLabel(controlFilter.status)}`}
                  </EuiBadge>
                </EuiFlexItem>
              )}
              <EuiFlexItem />
              <EuiFlexItem grow={false} style={{ minWidth: 260 }}>
                <EuiFieldSearch compressed placeholder='Buscar por nombre o ID' value={query} onChange={e => setQuery(e.target.value)} isClearable />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size='s' />
            <EuiInMemoryTable
              compressed
              items={listed.map(m => ({ ...m, id: m.agentId, failing: m.counts.NO_CUMPLE + m.counts.PARCIAL }))}
              itemId='agentId'
              pagination={{ initialPageSize: PAGE_SIZE, pageSizeOptions: [PAGE_SIZE, 50, 100] }}
              sorting={{ sort: { field: 'notMet', direction: 'desc' } }}
              message='Ninguna máquina coincide.'
              rowProps={(m: any) => ({ onClick: () => setSelected(m.agentId), style: { cursor: 'pointer' } })}
              columns={[
                {
                  field: 'agentName',
                  name: 'Máquina',
                  sortable: (m: any) => m.agentName || m.agentId,
                  render: (_: string, m: any) => (
                    <EuiHealth color={m.stale ? 'danger' : m.status === 'active' ? 'success' : 'subdued'}>{machineLabel(m)}</EuiHealth>
                  ),
                },
                {
                  field: 'counts',
                  name: 'Controles cumpliendo',
                  width: '170px',
                  sortable: (m: any) => m.counts.CUMPLE,
                  render: (_: any, m: any) => (inProgress ? 'Calculando…' : m.measured ? `${m.counts.CUMPLE} de ${m.measured}` : '—'),
                },
                {
                  field: 'failing',
                  name: 'Controles fallando',
                  width: '160px',
                  sortable: true,
                  render: (n: number) => (inProgress ? '…' : n ? <EuiBadge color='danger'>{n}</EuiBadge> : '—'),
                },
                { field: 'notMet', name: 'Requisitos fallando', width: '170px', sortable: true, render: (n: number) => (inProgress ? '…' : n || '—') },
                {
                  field: 'newest',
                  name: 'Último dato',
                  width: '130px',
                  sortable: true,
                  render: (iso: string, m: any) => (
                    <EuiText size='xs' color={m.stale ? 'danger' : 'default'}>
                      <span title={dateTimeLabel(iso)}>{describeAge(iso, now)}</span>
                    </EuiText>
                  ),
                },
              ]}
            />
            {selectedMachine && (
              <MachineFlyout
                machine={selectedMachine}
                matrix={matrix}
                data={data}
                nameOf={nameOf}
                now={now}
                onOpen={id => openDetail(id, selectedMachine.agentId)}
                onClose={() => setSelected(undefined)}
              />
            )}
          </>
        )}
      </EuiPanel>
    </EuiPage>
  );
};
