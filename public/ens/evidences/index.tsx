import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useMemo, useState } from 'react';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import type { ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiLink,
} from '@elastic/eui';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { compareENSControlIdsByAnnex, getENSCatalogControl } from '../../../common/ens/catalog';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  isPendingMeasurement,
} from '../../../common/ens/catalog/support/measurement-plan';
// Import from the types file, never from the `../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type { ENSComplianceResult, ENSGapCause, ENSObservationGroup } from '../../../common/ens/core/evaluation/types';
import { filterByENSPrefix, listENSFamilies, resolveENSSectionOpenState } from '../control-filter/prefix';
import { MotiveCell } from '../controls/control-detail/motive-cell';
import type { MotiveLine } from '../controls/control-detail/motive-cell';
import { machinesLabel, summarizeMotives } from '../controls/control-detail/general-view';
import { statusLabel } from '../../../common/ens/core/status-label';
import { ENS_STATUS_COLORS } from '../status-colors';
import { ENS_THEME } from '../theme-colors';
import { useOpenControl } from '../open-control';
import { FilterBar } from '../ui/filter-bar';
import { ExplainedControl } from '../ui/explained-text';

interface EvidenceRow {
  evidenceId: string;
  category: string;
  description: string;

  requirements: string[];
  levels: string[];
  ruleIds: string[];

  status: string;

  pending: boolean;

  gapCauses: ENSGapCause[];

  lastValidation: string;
  agent: string;

  observations: string[];

  observationGroups: ENSObservationGroup[];

  auditQuestion: string;
}

interface ControlEvidenceGroup {
  controlId: string;
  title: string;

  filterableIds: string[];

  rows: EvidenceRow[];

  hasResult: boolean;

  passing: number;
  failing: number;
  partial: number;
  unmeasured: number;
  notApplicable: number;
  pendingMeasurement: number;
}

const statusColorOf = (status: string): string => {
  if (status === 'CUMPLE') {
    return 'success';
  }

  if (status === 'PARCIAL') {
    return 'warning';
  }

  if (status === 'NO_CUMPLE') {
    return 'danger';
  }

  if (status === 'NO_APLICA') {
    return 'hollow';
  }

  return 'default';
};

const statusIcon = (status: string): string | undefined =>
  status === 'NO_EVALUABLE' ? 'questionInCircle' : undefined;

const StatusBadge = ({ status }: { status: string }) => (
  <EuiBadge color={statusColorOf(status)} iconType={statusIcon(status)}>
    {statusLabel(status)}
  </EuiBadge>
);

const STATUS_LEGEND: { status: string; gloss: string }[] = [
  { status: 'CUMPLE', gloss: 'demostrado' },
  { status: 'NO_CUMPLE', gloss: 'medido · resta · se corrige el activo' },
  { status: 'PARCIAL', gloss: 'conforma en parte · resta' },
  {
    status: 'NO_EVALUABLE',
    gloss: 'no demostrado · resta igual · se habilita la prueba',
  },
  { status: 'NO_APLICA', gloss: 'fuera del nivel activo · no resta' },
  { status: ENS_PENDING_MEASUREMENT_LABEL, gloss: 'sin recolector · fuera del índice' },
];

const PendingBadge = () => (
  <EuiBadge color='hollow' iconType='clock'>
    {ENS_PENDING_MEASUREMENT_LABEL}
  </EuiBadge>
);

const StatusLegend = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    {STATUS_LEGEND.map(({ status, gloss }) => (
      <EuiFlexItem grow={false} key={status}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            {status === ENS_PENDING_MEASUREMENT_LABEL ? <PendingBadge /> : <StatusBadge status={status} />}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {gloss}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

const GAP_CAUSES: ENSGapCause[] = [
  'COLLECTION',
  'CONFIGURATION',
  'CATALOG',
  'EVIDENCE',
];

const CAUSE_GLOSS: Record<ENSGapCause, string> = {
  COLLECTION: 'no llegó nada · agente o recolector',
  CONFIGURATION: 'falta parámetro · pestaña Configuración',
  CATALOG: 'no declarado · producto',
  EVIDENCE: 'llegó incompleta · productor de la evidencia',
};

const CauseBadge = ({ cause }: { cause: ENSGapCause }) => (
  <EuiBadge color='hollow' title={CAUSE_GLOSS[cause]}>
    {cause}
  </EuiBadge>
);

const CauseLegend = () => (
  <EuiFlexGroup gutterSize='m' alignItems='center' wrap responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiText size='xs' color='subdued'>
        Causa del NO_EVALUABLE
      </EuiText>
    </EuiFlexItem>
    {GAP_CAUSES.map(cause => (
      <EuiFlexItem grow={false} key={cause}>
        <EuiFlexGroup gutterSize='xs' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <CauseBadge cause={cause} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              {CAUSE_GLOSS[cause]}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

const BadgeList = ({
  values,
  color = 'hollow',
}: {
  values: string[];
  color?: string;
}) => {
  if (!values || values.length === 0) {
    return (
      <EuiText size='xs' color='subdued'>
        —
      </EuiText>
    );
  }

  return (
    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
      {values.map(value => (
        <EuiFlexItem grow={false} key={value}>
          <EuiBadge color={color}>{value}</EuiBadge>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

const shortDate = (iso: string): string => {
  if (!iso || iso === '-') {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const QUESTION_PREFIX = 'Pregunta de auditoría:';

const motiveLines = (
  row: EvidenceRow,
  totalMachines: number,
): { visibles: MotiveLine[]; hidden: number } => {
  let lines: MotiveLine[];
  let hidden = 0;

  if (row.observationGroups.length > 0) {
    const question = row.observationGroups.find(group =>
      group.text.startsWith(QUESTION_PREFIX),
    );

    const summary = summarizeMotives(
      row.observationGroups.filter(
        group => !group.text.startsWith(QUESTION_PREFIX),
      ),
    );

    hidden = summary.hidden;
    lines = summary.visibles.map(group => ({
      text: group.text,
      label: machinesLabel(group.agents, totalMachines),
    }));

    if (question) {
      lines.push({ text: question.text });
    }
  } else {
    lines = row.observations.map(text => ({ text }));
  }

  const hasQuestion = lines.some(line =>
    line.text.startsWith(QUESTION_PREFIX),
  );

  return {
    visibles:
      hasQuestion || !row.auditQuestion
        ? lines
        : [...lines, { text: `${QUESTION_PREFIX} ${row.auditQuestion}` }],
    hidden,
  };
};

const buildColumns = (totalMachines: number) => [
  {
    field: 'evidenceId',
    name: 'ID',
    render: (value: string) => <EuiBadge color='primary'>{value}</EuiBadge>,
  },
  {
    field: 'status',
    name: 'Estado',
    render: (value: string, item: EvidenceRow) => (
      <EuiFlexGroup
        gutterSize='xs'
        direction='column'
        alignItems='flexStart'
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          {item.pending ? <PendingBadge /> : <StatusBadge status={value} />}
        </EuiFlexItem>
        {item.gapCauses.map(cause => (
          <EuiFlexItem grow={false} key={cause}>
            <CauseBadge cause={cause} />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    ),
  },
  {
    field: 'description',
    name: 'Descripción',
    render: (value: string, item: EvidenceRow) => (
      <>
        <EuiText size='xs'>{value}</EuiText>
        <EuiText size='xs' color='subdued'>
          {[
            item.category,
            item.levels.join(' · '),
            item.agent && item.agent !== '—' ? item.agent : '',
            shortDate(item.lastValidation),
          ]
            .filter(Boolean)
            .join(' · ')}
        </EuiText>
      </>
    ),
  },
  {
    field: 'requirements',
    name: 'Requisitos ENS',
    render: (value: string[]) => <BadgeList values={value} />,
  },
  {
    field: 'ruleIds',
    name: 'Rule ID',
    render: (value: string[]) => <BadgeList values={value} />,
  },
  {
    field: 'observations',
    name: 'Motivo',
    render: (_value: string[], item: EvidenceRow) => {
      const { visibles: visibleItems, hidden } = motiveLines(item, totalMachines);

      return (
          <MotiveCell
            lines={visibleItems}
            hidden={hidden}
            title={`Motivo · ${item.evidenceId}`}
          />
        );
    },
  },
];

const CountBadge = ({
  value,
  color,
  label,
  icon,
}: {
  value: number;
  color: string;
  label: string;
  icon?: string;
}) =>
  value > 0 ? (
    <EuiFlexItem grow={false}>
      <EuiBadge color={color} iconType={icon}>
        {value} {label}
      </EuiBadge>
    </EuiFlexItem>
  ) : null;

const EvidenceBar = ({ group }: { group: ControlEvidenceGroup }) => {
  const spans = [
    { status: 'CUMPLE', n: group.passing },
    { status: 'PARCIAL', n: group.partial },
    { status: 'NO_CUMPLE', n: group.failing },
    { status: 'NO_EVALUABLE', n: group.unmeasured },
    { status: 'NO_APLICA', n: group.notApplicable },
  ].filter(span => span.n > 0);
  const total = group.rows.length;
  if (group.pendingMeasurement > 0 || !group.hasResult) {
    return (
      <EuiText size='xs' color='subdued'>
        <span>{group.pendingMeasurement > 0 ? ENS_PENDING_MEASUREMENT_LABEL : 'Sin datos en el periodo'}</span>
      </EuiText>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={spans.map(span => `${span.n} ${statusLabel(span.status).toLowerCase()}`).join(' · ')}>
      <span style={{ display: 'inline-flex', width: 120, height: 6, borderRadius: 3, overflow: 'hidden', background: ENS_THEME.track, flexShrink: 0 }}>
        {spans.map(span => (
          <span key={span.status} style={{ width: `${(span.n / Math.max(total, 1)) * 100}%`, background: ENS_STATUS_COLORS[span.status] }} />
        ))}
      </span>
      <EuiText size='xs' color='subdued'>
        <span>{`${group.passing} de ${total} cumplen`}</span>
      </EuiText>
    </div>
  );
};

export const EvidencesENS = () => {
  const openControl = useOpenControl();
  const { agentId, evidenceControl } = useRouterSearch();
  const updateUrl = useSetRouterSearch();

  const [prefix, setPrefix] = useState<string>(() => evidenceControl || '');

  const [openControlIds, setOpenControlIds] = useState<
    Record<string, boolean | undefined>
  >({});

  const applyPrefix = (value: string) => {
    setPrefix(value);
    if (evidenceControl) updateUrl({ evidenceControl: undefined });
    setOpenControlIds({});
  };

  const scopeAgents = useActiveENSScopeAgents();

  const allControlIds = useMemo(
    () => ENSControls.map(control => control.id),
    [],
  );

  const families = useMemo(
    () => listENSFamilies(allControlIds),
    [allControlIds],
  );

  const columns = useMemo(
    () => buildColumns(scopeAgents.length),
    [scopeAgents.length],
  );

  const evaluation = useEnsEvaluation<{ results: ENSComplianceResult[]; meta: ENSEvaluationMeta }>({
    include: 'results',
    agentId,
  });
  const { error } = evaluation;

  const results = useMemo(
    () => new Map((evaluation.data?.results || []).map(result => [result.control.id, result])),
    [evaluation.data],
  );

  const groups: ControlEvidenceGroup[] = useMemo(() => {
    return ENSControls.map(control => {
      const complianceResult = results.get(control.id);

      const evidences = complianceResult?.evidences || [];
      const pending = isPendingMeasurement(getENSCatalogControl(control.id));

      const countByStatus = (status: string) =>
        pending ? 0 : evidences.filter(evidence => evidence.status === status).length;

      const causesByEvidence = new Map<string, ENSGapCause[]>();

      (complianceResult?.nonConformities || []).forEach(nonConformity => {
        const cause = nonConformity.cause;

        if (nonConformity.origin !== 'NO_EVIDENCIADA' || !cause) {
          return;
        }

        (nonConformity.evidenceIds || []).forEach(evidenceId => {
          const accumulated = causesByEvidence.get(evidenceId) || [];

          if (!accumulated.includes(cause)) {
            causesByEvidence.set(evidenceId, [...accumulated, cause]);
          }
        });
      });

      return {
        controlId: control.id,
        title: control.title,
        filterableIds: [
          control.id,
          ...control.requirements.map(requirement => requirement.id),
        ],
        rows: evidences.map(evidence => ({
          evidenceId: evidence.id,
          category: evidence.category,
          description: evidence.description,
          requirements: evidence.requirements || [],
          levels: evidence.levels || [],
          ruleIds: evidence.relatedRules || [],
          status: evidence.status,
          pending,
          gapCauses:
            evidence.status === 'NO_EVALUABLE'
              ? causesByEvidence.get(evidence.id) || []
              : [],
          lastValidation: evidence.lastSeen || '-',
          agent: evidence.agentName || evidence.agentId || '—',
          observations: evidence.observations || [],
          observationGroups: evidence.observationGroups || [],
          auditQuestion: evidence.auditQuestion,
        })),
        hasResult: !!complianceResult,
        passing: countByStatus('CUMPLE'),
        failing: countByStatus('NO_CUMPLE'),
        partial: countByStatus('PARCIAL'),
        unmeasured: countByStatus('NO_EVALUABLE'),
        notApplicable: countByStatus('NO_APLICA'),
        pendingMeasurement: pending ? evidences.length : 0,
      };
    }).sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId));
  }, [results]);

  const filtered = useMemo(
    () => filterByENSPrefix(groups, prefix, group => group.filterableIds),
    [groups, prefix],
  );

  const countEvidences = (list: ControlEvidenceGroup[]) =>
    list.reduce((total, group) => total + group.rows.length, 0);

  const shownEvidences = countEvidences(filtered.matched);
  const totalEvidences = countEvidences(groups);

  const hiddenFailing = filtered.hidden.reduce(
    (total, group) => total + group.failing + group.partial,
    0,
  );

  const hiddenUnmeasured = filtered.hidden.reduce(
    (total, group) => total + group.unmeasured,
    0,
  );

  const hasNonEvaluable = groups.some(group => group.unmeasured > 0);

  const isOpen = (controlId: string): boolean =>
    resolveENSSectionOpenState(
      openControlIds,
      controlId,
      filtered.matched.length,
    );

  const toggleControl = (controlId: string, nextIsOpen: boolean) =>
    setOpenControlIds(current => ({
      ...current,
      [controlId]: nextIsOpen,
    }));

  if (error) {
    return (
      <EuiPanel paddingSize='l'>
        <EuiTitle size='s'>
          <h2>Evidencias</h2>
        </EuiTitle>
        <EuiSpacer size='m' />
        <FactsReadErrorCallOut error={error} onRetry={evaluation.retry} />
      </EuiPanel>
    );
  }

  if (!evaluation.data) {
    return (
      <EuiPanel paddingSize='l'>
        <EuiTitle size='s'>
          <h2>Evidencias</h2>
        </EuiTitle>
        <EvaluationLoading message='Calculando…' />
      </EuiPanel>
    );
  }

  return (
    <EuiPanel paddingSize='l'>
      <EuiTitle size='s'>
        <h2>Evidencias</h2>
      </EuiTitle>
      <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />

      <EuiSpacer size='s' />

      <EuiAccordion
        id='leyenda-evidencias'
        buttonContent={
          <EuiText size='xs' color='subdued'>
            Qué significa cada estado
          </EuiText>
        }
        paddingSize='s'
      >
        <StatusLegend />

        {hasNonEvaluable && (
          <>
            <EuiSpacer size='xs' />
            <CauseLegend />
          </>
        )}
      </EuiAccordion>

      <EuiSpacer size='m' />

      <FilterBar
        allLabel='Todos'
        options={families.map(family => ({ value: family, label: family }))}
        active={families.includes(filtered.query) ? filtered.query : ''}
        onFilter={applyPrefix}
        query={prefix}
        onQuery={applyPrefix}
        placeholder='Filtrar: op.acc, op.acc.1…'
        ariaLabel='Filtrar controles por prefijo del identificador ENS'
      />

      <EuiSpacer size='s' />

      <EuiFlexGroup gutterSize='s' alignItems='center' wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${filtered.matched.length} de ${groups.length} controles`
              : `${groups.length} controles`}
          </EuiBadge>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiBadge color='hollow'>
            {filtered.isActive
              ? `${shownEvidences} de ${totalEvidences} evidencias`
              : `${totalEvidences} evidencias`}
          </EuiBadge>
        </EuiFlexItem>

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiBadge color='accent'>
              {`Filtro: ${filtered.query}${evidenceControl && prefix === evidenceControl ? ' (desde el Detalle del control)' : ''}`}
            </EuiBadge>
          </EuiFlexItem>
        )}

        {filtered.isActive && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size='xs'
              iconType='cross'
              onClick={() => applyPrefix('')}
            >
              Quitar filtro
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {filtered.isActive && (hiddenFailing > 0 || hiddenUnmeasured > 0) && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color={hiddenFailing > 0 ? 'danger' : 'primary'}
            iconType={hiddenFailing > 0 ? 'alert' : 'iInCircle'}
            title={`Fuera del filtro «${filtered.query}»`}
          >
            <EuiFlexGroup
              gutterSize='s'
              alignItems='center'
              wrap
              responsive={false}
            >
              <CountBadge
                value={hiddenFailing}
                color='danger'
                label='no cumplen o parciales'
              />
              <CountBadge
                value={hiddenUnmeasured}
                color='default'
                label='no evaluables'
                icon='questionInCircle'
              />
            </EuiFlexGroup>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size='m' />

      {filtered.matched.length === 0 ? (
        <EuiCallOut
          size='s'
          color='warning'
          iconType='search'
          title={`Ningún control coincide con «${filtered.query}»`}
        >
          <EuiText size='xs'>
            <p>
              Sin filtro: {groups.length} controles, {totalEvidences}{' '}
              evidencias.
            </p>
          </EuiText>
          <EuiButtonEmpty
            size='s'
            iconType='cross'
            onClick={() => applyPrefix('')}
          >
            Quitar filtro
          </EuiButtonEmpty>
        </EuiCallOut>
      ) : (
        <EuiBasicTable noItemsMessage='No hay datos.'
          items={filtered.matched}
          itemId='controlId'
          isExpandable
          itemIdToExpandedRowMap={Object.fromEntries(
            filtered.matched
              .filter(group => isOpen(group.controlId))
              .map(group => [
                group.controlId,
                group.rows.length > 0 ? (
                  <ExplainedControl.Provider value={group.controlId}>
                    <EuiBasicTable noItemsMessage='No hay datos.' items={group.rows} columns={columns} compressed />
                  </ExplainedControl.Provider>
                ) : (
                  <EuiText size='xs' color='subdued'>
                    <span>Sin evidencias en el periodo</span>
                  </EuiText>
                ),
              ])
          )}
          rowProps={(group: ControlEvidenceGroup) => ({
            onClick: () => toggleControl(group.controlId, !isOpen(group.controlId)),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              field: 'controlId',
              name: 'Control',
              width: '110px',
              render: (id: string) => (
                <EuiLink
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    openControl(id);
                  }}
                  title={`Ver ${id} en Detalle del control`}
                >
                  <strong>{id}</strong>
                </EuiLink>
              ),
            },
            { field: 'title', name: 'Título' },
            {
              field: 'rows',
              name: 'Evidencias',
              width: '260px',
              render: (_rows: unknown, group: ControlEvidenceGroup) => <EvidenceBar group={group} />,
            },
            {
              field: 'failing',
              name: 'No cumplen',
              width: '110px',
              align: 'right',
              render: (_failing: number, group: ControlEvidenceGroup) => (
                <EuiText size='s' color={group.failing + group.partial ? 'danger' : 'subdued'}>
                  <strong>{group.failing + group.partial || '—'}</strong>
                </EuiText>
              ),
            },
            {
              width: '40px',
              isExpander: true,
              render: (group: ControlEvidenceGroup) => (
                <EuiButtonIcon
                  onClick={(event: React.MouseEvent) => {
                    event.stopPropagation();
                    toggleControl(group.controlId, !isOpen(group.controlId));
                  }}
                  aria-label={isOpen(group.controlId) ? 'Contraer' : 'Desplegar'}
                  iconType={isOpen(group.controlId) ? 'arrowUp' : 'arrowDown'}
                />
              ),
            },
          ]}
        />
      )}
    </EuiPanel>
  );
};
