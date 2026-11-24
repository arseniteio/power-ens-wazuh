import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiCallOut,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiPage,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { IncoherentLevelsNotice } from '../configuration/components/incoherent-levels-notice';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../../app/tabs';
import { ENSCatalog } from '../../../common/ens/catalog';
import { statusLabel } from '../../../common/ens/core/status-label';
import type { ENSControlSummaryEntry, ENSEvaluationMeta, ENSEvaluationTimelinePoint, ENSMachineScore } from '../../../common/ens/evaluation/types';
import type { ENSComplianceSummary } from '../../../common/ens/core/compliance-state/types';
import type { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import { statusBadgeColor } from '../status-colors';
import { ENS_THEME } from '../theme-colors';
import { ComplianceTrend } from './compliance-trend';
import { ControlMap } from './control-map';
import { IndexRing, primaryShade, SectionTitle, Segment, SegmentLegend, StackedBar, statusSegments } from './dashboard-parts';
import { AttentionRow, buildAttentionRows, buildControlMap, buildFamilyRows, CatalogEntry, countControls, FamilyRow, trendDelta } from './dashboard-model';
import { useOrganizationMaturity } from '../maturity/maturity-client';
import { OrganizationMaturityPanel } from '../maturity/organization-maturity-panel';
import { downloadCsv } from '../download-csv';
import { metricsCsv } from '../../../common/ens/maturity/metrics-export';
import { assessmentsOf } from '../../../common/ens/maturity/assessments';
import { categoryLabel } from '../../../common/ens/core/control-level';
import { judgeCompliance } from '../../../common/ens/maturity/compliance-level';
import { MaturitySeal } from '../ui/maturity-seal';

interface DashboardResponse {
  dashboard: ReturnType<typeof buildENSDashboardModel>;
  meta: ENSEvaluationMeta;
  requirementSummary: ENSComplianceSummary;
  controls?: ENSControlSummaryEntry[];
  machines?: ENSMachineScore[];
  timeline?: ENSEvaluationTimelinePoint[];
}

const CATALOG: CatalogEntry[] = ENSCatalog.map(control => ({ id: control.id, title: control.name, family: control.category }));

const PAGE_SIZE = 10;

const REVIEW_PANEL_ID = 'ens-controles-revision';

const ATTENTION_FILTERS = ['NO_CUMPLE', 'PARCIAL', 'NO_EVALUABLE'];


const percent = (score?: number): string => (typeof score === 'number' ? `${score} %` : '—');

const joinParts = (parts: Array<[number, string]>): string =>
  parts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(' · ');

const ScoreCell = ({ score }: { score?: number }) =>
  typeof score === 'number' ? (
    <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} style={{ width: '100%' }}>
      <EuiFlexItem grow={false} style={{ width: 40, textAlign: 'right' }}>
        {`${score} %`}
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiProgress value={score} max={100} size='s' color='primary' />
      </EuiFlexItem>
    </EuiFlexGroup>
  ) : (
    <span>—</span>
  );

const ControlsTable = ({
  rows,
  pending,
  onOpen,
}: {
  rows: Array<AttentionRow & { pending?: boolean }>;
  pending?: boolean;
  onOpen: (controlId: string) => void;
}) => (
  <EuiInMemoryTable
    items={rows}
    itemId='controlId'
    pagination={rows.length > PAGE_SIZE ? { initialPageSize: PAGE_SIZE, hidePerPageOptions: true } : false}
    sorting={!pending}
    message='Ningún control coincide.'
    rowProps={(row: AttentionRow) => ({ onClick: () => onOpen(row.controlId), style: { cursor: 'pointer' }, title: `Abrir ${row.controlId}` })}
    columns={[
      {
        field: 'controlId',
        name: 'Control',
        width: '110px',
        render: (controlId: string) => <EuiLink>{controlId}</EuiLink>,
      },
      { field: 'title', name: 'Título', truncateText: true },
      {
        field: 'status',
        name: 'Estado',
        width: '130px',
        render: (status: string, row: AttentionRow & { pending?: boolean }) =>
          row.pending ? <EuiBadge iconType='clock'>Calculando…</EuiBadge> : <EuiBadge color={statusBadgeColor(status)}>{statusLabel(status)}</EuiBadge>,
      },
      { field: 'score', name: 'Índice', width: '180px', sortable: true, render: (score?: number) => <ScoreCell score={score} /> },
      { field: 'requirementsNotMet', name: 'Requisitos fallando', width: '150px', align: 'right', sortable: true, render: (count: number) => count || '—' },
      { field: 'requirementsNotEvidenced', name: 'Sin evidencia', width: '120px', align: 'right', sortable: true, render: (count: number) => count || '—' },
    ]}
  />
);

const InProgress = ({ data, onOpen }: { data: DashboardResponse; onOpen: (controlId: string) => void }) => {
  const pending = data.meta.pending!;
  const rows = (data.controls || []).map(control => ({
    controlId: control.controlId,
    title: CATALOG.find(entry => entry.id === control.controlId)?.title || control.controlId,
    status: control.status,
    score: control.score,
    requirementsNotMet: control.requirementsNotMet,
    requirementsNotEvidenced: control.requirementsNotEvidenced,
    pending: control.pending,
  }));

  return (
    <>
      <EuiCallOut size='s' color='primary' iconType='clock' title='Calculando la evaluación'>
        <p>{`${pending.total - pending.rows} de ${pending.total} filas listas. Las cifras aparecen cuando terminen todos los controles.`}</p>
      </EuiCallOut>
      <EuiSpacer size='m' />
      <EuiPanel hasBorder>
        <SectionTitle>Controles</SectionTitle>
        <EuiSpacer size='s' />
        <ControlsTable rows={rows} pending onOpen={onOpen} />
      </EuiPanel>
    </>
  );
};

const IndexPanel = ({ data, counts, delta }: { data: DashboardResponse; counts: Record<string, number>; delta?: number }) => {
  const { compliance } = data.dashboard;
  const segments = statusSegments(counts);
  const requirements = data.requirementSummary;
  const requirementSegments = statusSegments({
    CUMPLE: requirements.compliant,
    PARCIAL: requirements.partial,
    NO_CUMPLE: requirements.nonCompliant,
    NO_EVALUABLE: requirements.notEvaluable,
    NO_APLICA: requirements.notApplicable,
  });
  const level = getActiveENSConfiguration()?.global?.ensLevel;
  const organization = compliance.measured && level ? judgeCompliance(compliance.score, level) : undefined;

  return (
    <EuiPanel hasBorder paddingSize='l' style={{ height: '100%' }}>
      <EuiFlexGroup gutterSize='xl' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <IndexRing score={compliance.measured ? compliance.score : undefined} />
          {organization && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <MaturitySeal status={organization.status} compliance={organization} />
              <EuiText size='xs' color='subdued'>
                <p>Nivel del índice</p>
              </EuiText>
            </div>
          )}
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiTitle size='xs'>
            <h3>Índice de cumplimiento</h3>
          </EuiTitle>
          <EuiSpacer size='xs' />
          <EuiText size='s' color='subdued'>
            <p>
              {compliance.measured ? `${compliance.measured} de ${compliance.total} controles medidos` : 'Sin controles medidos'}
              {level ? ` · Categoría ${categoryLabel(level)}` : ''}
            </p>
          </EuiText>
          {typeof delta === 'number' && (
            <EuiText size='s'>
              <p>
                <EuiIcon type={delta > 0 ? 'sortUp' : delta < 0 ? 'sortDown' : 'minus'} color={ENS_THEME.primary} />{' '}
                {delta === 0 ? 'Sin cambios en 7 días' : `${delta > 0 ? '+' : ''}${delta} puntos en 7 días`}
              </p>
            </EuiText>
          )}
          <EuiHorizontalRule margin='m' />
          <EuiText size='xs' color='subdued'>
            <p>{`Controles por estado · ${compliance.total} en total`}</p>
          </EuiText>
          <EuiSpacer size='s' />
          <StackedBar segments={segments} total={compliance.total} height={14} />
          <EuiSpacer size='s' />
          <SegmentLegend segments={segments} withCounts />
          <EuiSpacer size='l' />
          <EuiText size='xs' color='subdued'>
            <p>{`Requisitos por estado · ${requirements.totalControls} en total`}</p>
          </EuiText>
          <EuiSpacer size='s' />
          <StackedBar segments={requirementSegments} total={requirements.totalControls} height={14} />
          <EuiSpacer size='s' />
          <SegmentLegend segments={requirementSegments} withCounts />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const FigurePanel = ({ value, title, children }: { value: React.ReactNode; title: string; children: React.ReactNode }) => (
  <EuiPanel hasBorder paddingSize='m' style={{ height: '100%' }}>
    <EuiStat title={value} description={title} titleSize='m' reverse />
    <EuiSpacer size='s' />
    {children}
  </EuiPanel>
);

const AttentionFigure = ({ data }: { data: DashboardResponse }) => {
  const { findings } = data.dashboard;
  const segments: Segment[] = [
    { key: 'measured', label: 'Por medida', count: findings.measuredFindings, color: ENS_THEME.primary },
    { key: 'unevidenced', label: 'Sin evidencia', count: findings.unevidencedFindings, color: primaryShade(55) },
    { key: 'mixed', label: 'Mixtos', count: findings.mixedFindings, color: primaryShade(25) },
    { key: 'unclassified', label: 'Sin clasificar', count: findings.unclassifiedFindings, color: ENS_THEME.track },
  ].filter(segment => segment.count);

  return (
    <FigurePanel value={findings.total} title='Requisitos sujetos a revisión'>
      <StackedBar segments={segments} total={findings.total} empty={ENS_THEME.track} />
      <EuiSpacer size='s' />
      <SegmentLegend segments={segments} withCounts />
    </FigurePanel>
  );
};

const EvidenceFigure = ({ data }: { data: DashboardResponse }) => {
  const { coverage } = data.dashboard;
  const applicable = Math.max(coverage.totalEvidences - coverage.noApplicableEvidences, 0);

  return (
    <FigurePanel
      value={
        <span>
          {coverage.verifiedEvidences}
          <span style={{ fontSize: '0.55em', fontWeight: 400, color: ENS_THEME.subduedText }}>{` de ${applicable}`}</span>
        </span>
      }
      title='Evidencias con resultado'
    >
      <EuiProgress value={coverage.verifiedEvidences} max={Math.max(applicable, 1)} size='m' color='primary' />
      <EuiSpacer size='s' />
      <EuiText size='xs' color='subdued'>
        <p>{coverage.noEvaluableEvidences ? `${coverage.noEvaluableEvidences} sin resultado` : 'Todas tienen resultado'}</p>
      </EuiText>
    </FigurePanel>
  );
};

const FamiliesPanel = ({ families, selected, onSelect }: { families: FamilyRow[]; selected?: string; onSelect: (family?: string) => void }) => (
  <EuiPanel hasBorder>
    <SectionTitle aside={<SegmentLegend segments={statusSegments({})} />}>Cumplimiento por familia</SectionTitle>
    <EuiSpacer size='s' />
    <EuiBasicTable noItemsMessage='No hay datos.'
      items={families}
      itemId='family'
      rowProps={(row: FamilyRow) => ({
        onClick: () => onSelect(selected === row.family ? undefined : row.family),
        style: { cursor: 'pointer', background: selected === row.family ? ENS_THEME.highlight : undefined },
      })}
      columns={[
        {
          field: 'family',
          name: 'Familia',
          render: (code: string, row: FamilyRow) => (
            <div>
              <EuiText size='s'>
                <strong>{code}</strong>
              </EuiText>
              <EuiText size='xs' color='subdued'>
                <span>{row.name}</span>
              </EuiText>
            </div>
          ),
        },
        {
          field: 'counts',
          name: 'Estado de los controles',
          width: '38%',
          render: (_: unknown, row: FamilyRow) => <StackedBar segments={statusSegments(row.counts)} total={row.total} />,
        },
        { field: 'total', name: 'Controles', width: '90px', align: 'right' },
        { field: 'score', name: 'Índice', width: '80px', align: 'right', render: (score?: number) => <strong>{percent(score)}</strong> },
      ]}
    />
  </EuiPanel>
);

const MachinesPanel = ({ machines, onOpen }: { machines: ENSMachineScore[]; onOpen: (agentId: string) => void }) => (
  <EuiPanel hasBorder>
    <SectionTitle>Activos con menor índice</SectionTitle>
    <EuiSpacer size='xs' />
    {machines.map((machine, index) => (
      <div key={machine.agentId} style={{ padding: '10px 0', borderTop: index ? `1px solid ${ENS_THEME.border}` : undefined }}>
        <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false}>
          <EuiFlexItem style={{ minWidth: 0 }}>
            <EuiLink onClick={() => onOpen(machine.agentId)}>{machine.agentName ? `${machine.agentName} (${machine.agentId})` : machine.agentId}</EuiLink>
            <EuiText size='xs' color='subdued'>
              <span>{joinParts([[machine.nonCompliant, 'no cumplen'], [machine.partial, machine.partial === 1 ? 'parcial' : 'parciales']]) || 'Sin incumplimientos'}</span>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false} style={{ width: 170 }}>
            <ScoreCell score={machine.score} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    ))}
  </EuiPanel>
);

const AttentionPanel = ({
  rows,
  total,
  family,
  familyName,
  onClearFamily,
  onOpen,
}: {
  rows: AttentionRow[];
  total: number;
  family?: string;
  familyName?: string;
  onClearFamily: () => void;
  onOpen: (controlId: string) => void;
}) => {
  const [status, setStatus] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const inFamily = family ? rows.filter(row => row.controlId.startsWith(`${family}.`)) : rows;
  const listed = inFamily.filter(row => (!status || row.status === status) && (!q || row.controlId.includes(q) || row.title.toLowerCase().includes(q)));
  const countOf = (value: string) => inFamily.filter(row => row.status === value).length;

  return (
    <EuiPanel hasBorder id={REVIEW_PANEL_ID}>
      <SectionTitle aside={<EuiText size='xs' color='subdued'><span>{`${rows.length} de ${total} controles`}</span></EuiText>}>
        Controles sujetos a revisión
      </SectionTitle>
      <EuiSpacer size='m' />
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            <EuiFilterButton hasActiveFilters={!status} numFilters={inFamily.length} onClick={() => setStatus(undefined)}>
              Todos
            </EuiFilterButton>
            {ATTENTION_FILTERS.map(value => (
              <EuiFilterButton
                key={value}
                hasActiveFilters={status === value}
                numFilters={countOf(value)}
                isDisabled={!countOf(value)}
                onClick={() => setStatus(status === value ? undefined : value)}
              >
                {statusLabel(value)}
              </EuiFilterButton>
            ))}
          </EuiFilterGroup>
        </EuiFlexItem>
        {family && (
          <EuiFlexItem grow={false}>
            <EuiBadge iconType='cross' iconSide='right' iconOnClick={onClearFamily} iconOnClickAriaLabel='Quitar filtro'>
              {`${family} · ${familyName}`}
            </EuiBadge>
          </EuiFlexItem>
        )}
        <EuiFlexItem />
        <EuiFlexItem grow={false} style={{ minWidth: 260 }}>
          <EuiFieldSearch compressed placeholder='Buscar por control o título' value={query} onChange={e => setQuery(e.target.value)} isClearable />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <ControlsTable rows={listed} onOpen={onOpen} />
    </EuiPanel>
  );
};

const Dashboard = ({
  data,
  showMachines,
  onOpen,
  onOpenMachine,
}: {
  data: DashboardResponse;
  showMachines: boolean;
  onOpen: (controlId: string) => void;
  onOpenMachine: (agentId: string) => void;
}) => {
  const [family, setFamily] = useState<string | undefined>();
  const maturity = useOrganizationMaturity();
  const { evolution } = data.dashboard;
  const controls = data.controls || [];

  const counts = useMemo(() => countControls(controls), [controls]);
  const families = useMemo(() => buildFamilyRows(CATALOG, controls), [controls]);
  const attention = useMemo(() => buildAttentionRows(CATALOG, controls), [controls]);
  const controlMap = useMemo(() => buildControlMap(CATALOG, controls), [controls]);

  const seriesPending = Boolean(data.meta.seriesPending) && !(data.timeline || []).length;
  const trend = seriesPending ? [] : evolution.rows.map(row => ({ label: row.label, score: row.score, isCurrent: Boolean(row.isCurrent) }));
  const machines = showMachines ? data.machines || [] : [];

  return (
    <>
      <OrganizationMaturityPanel
        data={maturity.data}
        error={maturity.error}
        loading={maturity.loading}
        onOpen={onOpen}
        onExport={() =>
          downloadCsv(
            `power-ens-metricas-${new Date().toISOString().slice(0, 10)}.csv`,
            metricsCsv(
              CATALOG.map(entry => ({ id: entry.id, name: entry.title, family: entry.family })),
              controls,
              maturity.data,
              assessmentsOf(getActiveENSConfiguration()),
              new Date().toISOString()
            )
          )
        }
      />

      <EuiSpacer size='m' />

      <EuiFlexGroup gutterSize='m' wrap>
        <EuiFlexItem grow={3} style={{ minWidth: 520 }}>
          <IndexPanel data={data} counts={counts} delta={trendDelta(trend)} />
        </EuiFlexItem>
        <EuiFlexItem grow={2} style={{ minWidth: 340 }}>
          <EuiFlexGroup direction='column' gutterSize='m' style={{ height: '100%' }}>
            <EuiFlexItem>
              <AttentionFigure data={data} />
            </EuiFlexItem>
            <EuiFlexItem>
              <EvidenceFigure data={data} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='m' />

      <EuiFlexGroup gutterSize='m' wrap>
        <EuiFlexItem grow={3} style={{ minWidth: 520 }}>
          <EuiFlexGroup direction='column' gutterSize='m'>
            <EuiFlexItem grow={false}>
              <FamiliesPanel
                  families={families}
                  selected={family}
                  onSelect={next => {
                    setFamily(next);
                    if (next) document.getElementById(REVIEW_PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                />
            </EuiFlexItem>
            {machines.length > 0 && (
              <EuiFlexItem grow={false}>
                <MachinesPanel machines={machines} onOpen={onOpenMachine} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={2} style={{ minWidth: 340 }}>
          <EuiFlexGroup direction='column' gutterSize='m'>
            <EuiFlexItem grow={false}>
              <EuiPanel hasBorder>
                <SectionTitle>Evolución del índice</SectionTitle>
                <EuiText size='xs' color='subdued'>
                  <p>Últimos 7 días</p>
                </EuiText>
                <EuiSpacer size='m' />
                {trend.length || seriesPending ? (
                  <ComplianceTrend points={trend} pending={seriesPending} />
                ) : (
                  <EuiText size='s' color='subdued'>
                    <p>{evolution.description}</p>
                  </EuiText>
                )}
              </EuiPanel>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <ControlMap rows={controlMap} onOpen={onOpen} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='m' />

      <AttentionPanel
        rows={attention}
        total={controls.length}
        family={family}
        familyName={families.find(row => row.family === family)?.name}
        onClearFamily={() => setFamily(undefined)}
        onOpen={onOpen}
      />
    </>
  );
};

export const EnsDashboardMain = () => {
  const { agentId } = useRouterSearch();
  const updateUrl = useSetRouterSearch();
  const evaluation = useEnsEvaluation<DashboardResponse>({ include: 'dashboard', agentId, timelineDays: 7 });
  const data = evaluation.data;
  const openControl = (controlId: string) => updateUrl({ tabView: ENS_CONTROL_DETAIL_TAB_ID, control: controlId, agentId });
  const openMachine = (machine: string) => updateUrl({ agentId: machine });

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel paddingSize='l'>
        <EuiTitle size='m'>
          <h2>Panel</h2>
        </EuiTitle>
        <EuiSpacer size='s' />
        <IncoherentLevelsNotice global={getActiveENSConfiguration()?.global} />
        {evaluation.error && !data ? (
          <FactsReadErrorCallOut error={evaluation.error} onRetry={evaluation.retry} />
        ) : !data?.dashboard ? (
          <EvaluationLoading message='Calculando…' />
        ) : (
          <>
            <EvaluationStatusLine meta={data.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
            <EuiSpacer size='m' />
            {data.meta.pending ? (
              <InProgress data={data} onOpen={openControl} />
            ) : (
              <Dashboard data={data} showMachines={!agentId} onOpen={openControl} onOpenMachine={openMachine} />
            )}
          </>
        )}
      </EuiPanel>
    </EuiPage>
  );
};
