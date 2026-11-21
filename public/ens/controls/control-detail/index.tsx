import { useActiveENSScopeAgents } from '../../scope/use-active-scope-agents';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEnsEvaluation } from '../../../evaluation/use-evaluation';
import { fetchTraceabilityPage } from '../../../evaluation/evaluation-client';
import { FactsReadErrorCallOut } from '../../../platform/facts-read-error-callout';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControl } from '../../types';
// Import from the types file, never from the `../../core` barrel: it avoids the transitive TDZ cycle of Settings.
import { compliantRequirementLabel } from './general-view';
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../../../../common/ens/configuration/services';
import { ControlEvolutionChart } from './evolution-chart';
import type { MotiveViewHandlers } from './motive-view';
import { describeParameterForMachine } from '../parameter-origins';
import { useHostParameters } from '../use-host-parameters';
import { statusBadgeColor } from '../../status-colors';
import type { ENSTraceabilityResult } from '../../../../common/ens/core/evaluation/types';
import type { ENSControlEvaluationResponse } from '../../../../common/ens/evaluation/types';
import { traceabilityPageSource } from '../../../evaluation/traceability-paging';
import { EvaluationLoading, EvaluationStatusLine } from '../../../evaluation/evaluation-status';
import { useSetRouterSearch } from '../../../routing/use-router-search';
import { detailConfigurationChanges } from '../../../routing/configuration-link';
import { AddControlWithDefaultsButton } from '../add-control-button';
import { isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { ENS_PROPOSAL_TEXT_PROVENANCE } from '../../../../common/ens/catalog/support/provenance';
import { getControlRelation } from '../../../../common/ens/catalog/guide';
import { describeApplicableLevelLabel } from '../../../../common/ens/core/control-level';
import { ControlGuideFlyout, ControlRelationPanel, GuideCode } from './control-guide';
import type { GuideTarget } from './control-guide';
import { ProvenancedText, RequirementTextsPanel, TemplateCorrespondencePanel } from './requirement-texts';
import { InfoTip } from '../../ui/info-tip';
import { AttestationLinks } from './attestation-links';
import { MaturitySeal } from '../../ui/maturity-seal';
import { ControlMaturity } from './control-maturity';
import { EvidenceSeal } from './evidence-seal';
import { scaleFor } from '../../../../common/ens/maturity/scale';
import { DocumentaryEvidences } from './documentary-evidences';
import { documentaryRequirements } from '../../../../common/ens/core/documentary';
import { EvidenceMotiveFlyout, scopedEvidence } from './evidence-motive';
import { NonConformityList } from './nonconformity-list';
import { groupNonConformities } from '../../../../common/ens/core/nonconformity-groups';
import { EvidenceMotiveCell } from './evidence-motive-cell';
import { describeNotMeasuredOnAgent } from '../../../../common/ens/core/scope/measurement-planes';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  describePendingMeasurement,
  describeRequiredSource,
  isPendingMeasurement,
} from '../../../../common/ens/catalog/support/measurement-plan';
import {
  ENSRetainedEvaluation,
  decideDetailView,
  describeComputedAt,
  isFromAnotherMachine,
  nextRetained,
} from './detail-view-state';
import { statusLabel } from '../../../../common/ens/core/status-label';
import { dateLabel, dateTimeLabel } from '../../../../common/ens/core/date-label';
import { ExclusionButton, ExclusionNotice, useExclusion } from '../../exclusions/exclusion-controls';
import { useOrganizationMaturity } from '../../maturity/maturity-client';
import { MeasureMaturity } from '../../maturity/measure-maturity';

interface ControlDetailENSProps {
  control: ENSControl;
  agentId?: string;
  onBack: () => void;
}

const getBadgeColor = (status: string) => statusBadgeColor(status);

const getStatusIcon = (status: string) =>
  status === 'CUMPLE'
    ? 'check'
    : status === 'NO_CUMPLE'
    ? 'cross'
    : status === 'NO_EVALUABLE'
    ? 'clock'
    : 'minus';

const formatTraceabilityTimestamp = (timestamp?: string) => {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? timestamp : dateTimeLabel(date);
};

export const ControlDetailENS = ({
   control,
   agentId,
   onBack,
 }: ControlDetailENSProps) => {
  const [tracePageIndex, setTracePageIndex] = useState(0);
  const [tracePageSize, setTracePageSize] = useState(10);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);
  const [detailTab, setDetailTab] = useState('evidences');
  const [guideTarget, setGuideTarget] = useState<GuideTarget | undefined>();
  const [motive, setMotive] = useState<{ evidenceId: string; agentIds?: string[] } | undefined>();

  const scopeAgents = useActiveENSScopeAgents();
  const maturity = useOrganizationMaturity();
  const [, setAssessed] = useState(0);

  const evaluation = useEnsEvaluation<ENSControlEvaluationResponse>({
    include: 'control',
    controlId: control.id,
    agentId,
    timelineDays: 30,
  });
  const updateUrl = useSetRouterSearch();

  const request = { controlId: control.id, agentId };
  const computedAt = (data: ENSControlEvaluationResponse) => data?.meta?.computedAt || data?.meta?.evaluatedAt;
  const retained = useRef<ENSRetainedEvaluation<ENSControlEvaluationResponse> | undefined>(undefined);
  const view = decideDetailView(request, evaluation, retained.current, computedAt);
  retained.current = nextRetained(request, evaluation, retained.current, computedAt);
  const data = view.kind === 'shown' ? view.data : undefined;
  const displayedAgent = view.kind === 'shown' ? view.agentId : agentId;
  const hostParameter = useHostParameters(displayedAgent);

  const ensLevel = data?.meta?.level || getActiveENSConfiguration().global.ensLevel;
  const complianceResult = data?.result;
  const traceabilityTotal = data?.traceabilityTotal || 0;

  const controlTimeline = useMemo(
    () =>
      (data?.timeline || []).map(point => ({
        ...point,
        status: point.status || 'NO_EVALUABLE',
        date: new Date(point.date),
      })),
    [data],
  );

  useEffect(() => {
    setTracePageIndex(0);
    setGuideTarget(undefined);
  }, [control.id, agentId]);

  const newestVerdict = data?.meta?.verdicts?.newest;
  const latestEvaluationDate = newestVerdict
    ? dateLabel(newestVerdict)
    : 'Sin datos';

  const totalMachines = (complianceResult?.consolidatedAgents || []).length;

  const nameOf = (id?: string) => (id ? scopeAgents.find(agent => agent.id === id)?.name : undefined);
  const labelOf = (id?: string) => (id ? `${id} · ${nameOf(id) || 'sin nombre'}` : 'todas las máquinas');

  const agentName = displayedAgent
    ? (nameOf(displayedAgent) ||
       ('Agente ' + displayedAgent))
    : totalMachines > 0
    ? `Todos los agentes (vista general · ${totalMachines} máquina${
        totalMachines === 1 ? '' : 's'
      })`
    : 'Todos los agentes (vista general)';

  const engineStatus = complianceResult?.status || 'NO_EVALUABLE';

  const engineScore =
    typeof complianceResult?.score === 'number'
      ? complianceResult.score
      : undefined;

  const engineScoreText =
    engineScore !== undefined
      ? `${engineScore}%`
      : engineStatus === 'NO_APLICA'
      ? 'no aplica'
      : 'sin datos';

  const applicableRequirements = complianceResult?.applicableRequirements ?? 0;

  const compliantRequirements = (complianceResult?.requirements || []).filter(
    (requirement: any) => requirement.status === 'CUMPLE'
  ).length;
  const measuredRequirements = complianceResult?.measuredRequirements ?? 0;

  const consolidatedRequirements = (complianceResult?.requirements || []).filter(
    (requirement: any) => requirement.status !== 'NO_APLICA'
  ).length;

  const isAggregatedView = !displayedAgent && totalMachines > 1;

  const denominatorRequirements = isAggregatedView
    ? consolidatedRequirements
    : applicableRequirements;

  const levelsText = String(complianceResult?.level || ensLevel);

  const evidenceStatusItems = (complianceResult?.evidences || []).map(evidence => ({
    id: evidence.id,
    evidence,
    title: evidence.title,
    description: evidence.description,
    tally: evidence.tally,
    requirement: evidence.requirements.join(', '),
    level: evidence.levels.join(', '),
    status: evidence.status,
    ruleId: evidence.relatedRules.join(', '),
    motive: (evidence.observations || []).join(' · '),
    motives: evidence.observationGroups || [],
  }));

  const nonConformityItems = (complianceResult?.nonConformities || []).map(
    nonConformity => ({
      id: nonConformity.id,
      evidence: nonConformity.evidenceId,
      evidenceIds: nonConformity.evidenceIds || [],
      requirement: nonConformity.requirementId,
      requirements: nonConformity.requirementIds || [nonConformity.requirementId],
      finding: nonConformity.finding,
      impact: nonConformity.impact,
      requiredAction: nonConformity.requiredAction,
      expected: nonConformity.expected,
      actual: nonConformity.actual,
      parameterIds: nonConformity.parameterIds || [],
      origin: nonConformity.origin,
      cause: nonConformity.cause,
      documental: nonConformity.documental === true,
      agents: nonConformity.agents || [],
      status: 'ABIERTA',
    }),
  );

  const nonConformityGroups = groupNonConformities(complianceResult?.nonConformities || []);
  const openNonConformitiesCount = nonConformityGroups.length;
  const groupsOf = (kind: string) => nonConformityGroups.filter(group => group.kind === kind).length;

  const machinesWithNonConformity = new Set(
    nonConformityItems.flatMap(item =>
      item.agents.map(agent => agent.agentId),
    ),
  ).size;

  const handlers: MotiveViewHandlers = {
    onParameter: parameterId =>
      updateUrl(
        detailConfigurationChanges({
          controlId: control.id,
          agentId,
          parameterId,
          parameterIsAgentLevel: isAgentLevelParameter(control.id, parameterId),
        })
      ),
    onEvidence: evidenceId => setGuideTarget({ kind: 'evidence', id: evidenceId }),
    parameterInfo: parameterId => {
      const info = describeParameterForMachine(getActiveENSConfiguration(), control.id, displayedAgent, parameterId);
      const fromHost = hostParameter(control.id, parameterId);
      return info && { id: info.id, label: info.label, value: fromHost?.value ?? info.value, origin: fromHost?.origin ?? info.origin };
    },
  };

  const findEvidence = (evidenceId: string) =>
    (complianceResult?.evidences || []).find(
      (item: any) => item.id === evidenceId,
    );

  const criticalityOf = (evidenceIds: string[]): string | undefined => {
    const order: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    const labels: Record<string, string> = {
      LOW: 'baja',
      MEDIUM: 'media',
      HIGH: 'alta',
    };

    let highest: string | undefined;

    evidenceIds.forEach(evidenceId => {
      const level = findEvidence(evidenceId)?.criticality;

      if (!level || !order[level]) {
        return;
      }

      if (!highest || order[level] > order[highest]) {
        highest = level;
      }
    });

    return highest ? labels[highest] : undefined;
  };

  const actionSummary =
    openNonConformitiesCount === 0
      ? 'Sin acciones pendientes'
      : [
          groupsOf('measure') ? `Corregir ${groupsOf('measure')}` : '',
          groupsOf('configuration') ? `Configurar ${groupsOf('configuration')}` : '',
          groupsOf('collection') ? `Revisar recogida ${groupsOf('collection')}` : '',
          groupsOf('documentary') ? `Registrar documento ${groupsOf('documentary')}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  const auditorSheet: { label: string; value: string }[] = [
    { label: 'Cumplimiento', value: `${engineScoreText}${complianceResult?.compliance ? ` · L${complianceResult.compliance.level}` : ''} · ${statusLabel(engineStatus)}` },
    {
      label: isAggregatedView
        ? 'Demostrados · requisito × máquina'
        : 'Requisitos demostrados',
      value: `${measuredRequirements}/${applicableRequirements}`,
    },
    {
      label: 'No conformidades',
      value: `${openNonConformitiesCount}${
        machinesWithNonConformity > 0
          ? ` · ${machinesWithNonConformity} máquina${
              machinesWithNonConformity === 1 ? '' : 's'
            }`
          : ''
      }`,
    },
    ...[
      { label: 'Incumplimientos', value: groupsOf('measure') },
      { label: 'Falta configuración', value: groupsOf('configuration') },
      { label: 'Sin datos', value: groupsOf('collection') },
      { label: 'Sin documento', value: groupsOf('documentary') },
    ]
      .filter(row => row.value > 0)
      .map(row => ({ label: row.label, value: String(row.value) })),
    { label: 'Acción', value: actionSummary },
  ];

  const toTraceItem = (item: ENSTraceabilityResult, index: number) => ({
      key: `${item.source}-${item.reference}-${index}`,
      source: item.source,
      reference: item.reference,
      controlId:
        item.controlId ||
        complianceResult?.control.id ||
        control.id,
      requirements:
        item.requirementIds && item.requirementIds.length > 0
          ? item.requirementIds.join(', ')
          : item.requirementId || '',
      evidenceId: item.evidenceId,
      status: item.status,
      eventId: item.eventId,
      eventType: item.eventType,
      ruleId: item.ruleId,
      ruleDescription: item.ruleDescription,
      agent: [item.agentId, item.agentName]
        .filter(Boolean)
        .join(' · '),
      origin: [item.eventSourceType, item.eventSource]
        .filter(Boolean)
        .join(' · '),
      timestamp: formatTraceabilityTimestamp(item.timestamp),
      auditAttributes: item.auditAttributes || {},
      auditorMeaning: item.description,
    });

  const initials = complianceResult?.traceability || [];
  const pageFrom = tracePageIndex * tracePageSize;
  const traceabilityAvailable = data?.traceabilityAvailable ?? initials.length;
  const [remotePage, setRemotePage] = useState<
    { key: string; items?: ENSTraceabilityResult[]; error?: Error } | undefined
  >();
  const [traceRetry, setTraceRetry] = useState(0);
  const remoteKey = `${control.id}|${displayedAgent || ''}|${pageFrom}|${tracePageSize}|${data?.meta?.fingerprint || ''}|${traceRetry}`;
  const needsRemote =
    Boolean(complianceResult) &&
    traceabilityPageSource({ initialCount: initials.length, available: traceabilityAvailable, pageFrom, pageSize: tracePageSize }) === 'remote';

  useEffect(() => {
    if (!needsRemote) return;
    const controller = new AbortController();
    let cancelled = false;
    fetchTraceabilityPage({ controlId: control.id, agentId: displayedAgent, from: pageFrom, size: tracePageSize }, controller)
      .then(page => {
        if (!cancelled) setRemotePage({ key: remoteKey, items: page.items || [] });
      })
      .catch(error => {
        if (!cancelled) setRemotePage({ key: remoteKey, error });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, needsRemote]);

  const remotePageIndex = remotePage?.key === remoteKey ? remotePage : undefined;
  const traceLoading = needsRemote && !remotePageIndex;
  const traceError = needsRemote ? remotePageIndex?.error : undefined;

  const traceabilityPageItems = (needsRemote
    ? remotePageIndex?.items || []
    : initials.slice(pageFrom, pageFrom + tracePageSize)
  ).map((item, index) => toTraceItem(item, pageFrom + index));

  const toggleTraceDetail = (key: string) =>
    setExpandedTraceIds(current =>
      current.includes(key)
        ? current.filter(id => id !== key)
        : [...current, key],
    );

  const renderTraceDetail = (item: (typeof traceabilityPageItems)[number]) => (
    <EuiText size='xs'>
      <p>
        <strong>Referencia:</strong> {item.reference}
      </p>

      {item.requirements && (
        <p>
          <strong>Requisito(s):</strong> {item.requirements}
        </p>
      )}

      {item.eventId && (
        <p>
          <strong>ID del evento:</strong> {item.eventId}
        </p>
      )}

      {item.ruleDescription && (
        <p>
          <strong>Descripción de la regla:</strong> {item.ruleDescription}
        </p>
      )}

      {item.agent && (
        <p>
          <strong>Agente:</strong> {item.agent}
        </p>
      )}

      {item.origin && (
        <p>
          <strong>Origen:</strong> {item.origin}
        </p>
      )}

      {Object.keys(item.auditAttributes).length > 0 && (
        <>
          <p>
            <strong>Atributos técnicos auditables:</strong>
          </p>

          <ul>
            {Object.entries(item.auditAttributes).map(
              ([attribute, value]) => (
                <li key={attribute}>
                  <strong>{attribute}:</strong> {String(value)}
                </li>
              ),
            )}
          </ul>
        </>
      )}

      {item.auditorMeaning && (
        <p style={{ color: '#69707D' }}>{item.auditorMeaning}</p>
      )}
    </EuiText>
  );

  const traceExpandedRowMap = expandedTraceIds.reduce(
    (acc: Record<string, React.ReactNode>, key) => {
      const item = traceabilityPageItems.find(trace => trace.key === key);

      if (item) {
        acc[key] = renderTraceDetail(item);
      }

      return acc;
    },
    {},
  );

  const traceabilityColumns = [
    {
      field: 'source',
      name: 'Fuente',
      width: '110px',
      render: (value: string) => <EuiBadge color='hollow'>{value}</EuiBadge>,
    },
    {
      field: 'evidenceId',
      name: 'Evidencia',
      width: '100px',
      render: (value?: string) =>
        value ? (
          <EuiBadge
            color='default'
            onClick={() => setGuideTarget({ kind: 'evidence', id: value })}
            onClickAriaLabel={`Ver la explicación de ${value}`}
          >
            {value}
          </EuiBadge>
        ) : (
          '-'
        ),
    },
    {
      field: 'eventType',
      name: 'Evento',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'ruleId',
      name: 'Regla',
      width: '110px',
      render: (value?: string) => value || '-',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '130px',
      render: (value?: string) =>
        value ? <EuiBadge color={getBadgeColor(value)}>{value}</EuiBadge> : '-',
    },
    {
      field: 'timestamp',
      name: 'Fecha',
      width: '160px',
      render: (value?: string) => value || '-',
    },
    {
      align: 'right' as const,
      width: '40px',
      isExpander: true,
      render: (item: (typeof traceabilityPageItems)[number]) => (
        <EuiButtonIcon
          onClick={() => toggleTraceDetail(item.key)}
          aria-label={
            expandedTraceIds.includes(item.key) ? 'Contraer' : 'Ver detalle'
          }
          iconType={
            expandedTraceIds.includes(item.key) ? 'arrowUp' : 'arrowDown'
          }
        />
      ),
    },
  ];

  const evidenceSummary = evidenceStatusItems.reduce(
    (acc, evidence) => {
      if (evidence.status === 'CUMPLE') {
        acc.compliant += 1;
      } else if (evidence.status === 'NO_EVALUABLE') {
        acc.notEvaluable += 1;
      } else if (evidence.status === 'NO_APLICA') {
        acc.notApplicable += 1;
      } else if (evidence.status === 'NO_CUMPLE') {
        acc.nonCompliant += 1;
      }

      return acc;
    },
    { compliant: 0, notEvaluable: 0, notApplicable: 0, nonCompliant: 0 },
  );

  const evaluableEvidences =
    evidenceSummary.compliant + evidenceSummary.nonCompliant + evidenceSummary.notEvaluable;

  const configureControl = () =>
    updateUrl(
      detailConfigurationChanges({
        controlId: control.id,
        agentId,
        hasAgentLevelParameters: (getActiveControlConfiguration(control.id)?.parameters || []).some(parameter =>
          isAgentLevelParameter(control.id, parameter.id)
        ),
      })
    );

  const headerCatalog = getENSCatalogControl(control.id);
  const relation = getControlRelation(control.id);

  const exclusionTarget = { agentId, agentLabel: labelOf(agentId), controlId: control.id };
  const exclusion = useExclusion(exclusionTarget);

  const header = (
    <div className='power-ens-control-header' style={{ padding: '4px 8px 12px' }}>
      <EuiButtonEmpty iconType='arrowLeft' size='s' flush='left' onClick={onBack}>
        Volver a controles
      </EuiButtonEmpty>
      <EuiSpacer size='m' />
      <EuiFlexGroup alignItems='flexStart' justifyContent='spaceBetween' gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>{control.id}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size='s' color='subdued'>
                {control.family} · {control.category}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size='s' />
          <EuiTitle size='l'>
            <h2>{control.title}</h2>
          </EuiTitle>
          {relation && (
            <EuiText size='s' color='subdued'>
              {relation.summary}
            </EuiText>
          )}
          <EuiSpacer size='s' />
          <EuiFlexGroup gutterSize='s' responsive={false} wrap alignItems='center'>
            {data?.result && (
              <EuiFlexItem grow={false}>
                <MaturitySeal status={data.result.status} compliance={data.result.compliance} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize='s' responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <ExclusionButton target={exclusionTarget} exclusion={exclusion} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton iconType='gear' onClick={configureControl}>
                Configurar este control
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <ExclusionNotice exclusion={exclusion} verdictStatus={view.kind === 'shown' && view.agentId === agentId ? data?.result?.status : undefined} />
    </div>
  );

  if (view.kind === 'error') {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          {header}
          <EuiSpacer size='m' />
          <FactsReadErrorCallOut error={view.error as Error} onRetry={evaluation.retry} />
        </EuiPanel>
      </EuiPage>
    );
  }

  if (view.kind === 'loading') {
    return (
      <EuiPage paddingSize='m'>
        <EuiPanel>
          {header}
          <EvaluationLoading message={'Calculando…'} />
        </EuiPanel>
      </EuiPage>
    );
  }

  const fromOtherMachine = isFromAnotherMachine(request, view);
  const displayedHour = describeComputedAt(view.computedAt);
  const validityNotice = !view.current ? (
    <>
      {view.loading && <EuiProgress size='xs' color='accent' position='absolute' />}
      {view.error ? (
        <>
          <FactsReadErrorCallOut error={view.error as Error} onRetry={evaluation.retry} />
          <EuiSpacer size='s' />
          <EuiCallOut
            size='s'
            color='warning'
            iconType='clock'
            title={`Resultado de ${labelOf(view.agentId)}${displayedHour ? ` · ${displayedHour}` : ''}`}
          >
            {fromOtherMachine && (
              <p>No es el de {labelOf(agentId)}: el de esa máquina no se ha podido calcular.</p>
            )}
          </EuiCallOut>
        </>
      ) : (
        <EuiCallOut
          size='s'
          color='primary'
          iconType='clock'
          title={
            fromOtherMachine
              ? `Cargando ${labelOf(agentId)}…`
              : 'Actualizando…'
          }
        />
      )}
      <EuiSpacer size='m' />
    </>
  ) : null;

  const unconfiguredNotice = !getActiveControlConfiguration(control.id) ? (
    <>
      <EuiCallOut color='warning' iconType='gear' title={`${control.id} fuera de la configuración activa`}>
        <AddControlWithDefaultsButton controlId={control.id} onAdded={() => evaluation.retry()} />
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  ) : null;

  const pendingMeasurement = isPendingMeasurement(headerCatalog);
  const pendingMeasurementNotice = pendingMeasurement && headerCatalog ? (
    <>
      <EuiCallOut color='primary' iconType='clock' title={`${ENS_PENDING_MEASUREMENT_LABEL}: ${control.id}`}>
        <p>{describePendingMeasurement(headerCatalog)}</p>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  ) : null;

  if (!complianceResult) {
    const catalog = getENSCatalogControl(control.id);
    const motive =
      displayedAgent && catalog
        ? describeNotMeasuredOnAgent(
            catalog,
            displayedAgent,
            nameOf(displayedAgent),
            getActiveControlConfiguration(control.id, displayedAgent)
          )
        : undefined;
    const scopeParameter = motive?.parameterId;

    return (
      <EuiPage paddingSize='m'>
        <EuiPanel style={{ position: 'relative' }}>
          {header}
          <EuiSpacer size='m' />
          {validityNotice}
          {unconfiguredNotice}
          {pendingMeasurementNotice}
          <ControlRelationPanel controlId={control.id} />
          <EuiSpacer size='m' />
          <EuiCallOut
            color='primary'
            iconType='iInCircle'
            title={
              displayedAgent
                ? `${control.id}: sin medición en ${labelOf(displayedAgent)}`
                : `${control.id}: sin resultado`
            }
          >
            <p>
              {motive?.text ||
                (displayedAgent
                  ? 'Sin medición en esta máquina'
                  : 'Sin medición')}
            </p>
                        <EuiFlexGroup gutterSize='s' responsive={false} wrap>
              {displayedAgent && (
                <EuiFlexItem grow={false}>
                  <EuiButton size='s' iconType='list' onClick={() => updateUrl({ agentId: undefined })}>
                    Ver todas las máquinas
                  </EuiButton>
                </EuiFlexItem>
              )}
              {scopeParameter && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size='s'
                    iconType='gear'
                    onClick={() =>
                      updateUrl(
                        detailConfigurationChanges({
                          controlId: control.id,
                          agentId,
                          parameterId: scopeParameter,
                          parameterIsAgentLevel: isAgentLevelParameter(control.id, scopeParameter),
                        })
                      )
                    }
                  >
                    Configurar {scopeParameter}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiCallOut>
          <EuiSpacer size='s' />
          <EvaluationStatusLine meta={data?.meta} refreshing={evaluation.isRefreshing} />
        </EuiPanel>
      </EuiPage>
    );
  }

  const kpis = [
    ...(complianceResult?.compliance ? [] : [{ title: engineScoreText, description: `Cumplimiento · ${statusLabel(engineStatus)}`, color: getBadgeColor(engineStatus) }]),
    { title: `${compliantRequirements}/${denominatorRequirements}`, description: 'Requisitos cumpliendo' },
    { title: `${evidenceSummary.compliant}/${evaluableEvidences}`, description: 'Evidencias conformes' },
    { title: String(openNonConformitiesCount), description: 'No conformidades abiertas', color: openNonConformitiesCount ? 'danger' : 'success' },
  ];
  const detailTabs = [
    { id: 'evidences', name: `Evidencias · ${evidenceStatusItems.length + documentaryRequirements(complianceResult?.requirements).length}` },
    { id: 'non-conformities', name: `No conformidades · ${openNonConformitiesCount}` },
    { id: 'evolution', name: 'Evolución' },
    { id: 'traceability', name: 'Trazabilidad' },
    { id: 'text', name: 'Texto ENS' },
  ];

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel style={{ position: 'relative' }}>
        {header}

        <EuiSpacer size='s' />

        {validityNotice}
        {unconfiguredNotice}
        {pendingMeasurementNotice}

        <ControlRelationPanel controlId={control.id} />

        <EuiSpacer size='m' />

        <EuiText size='xs' color='subdued'>
          <p>
            {[agentName, `${describeApplicableLevelLabel(headerCatalog || {})}: ${levelsText}`, `Último hecho: ${latestEvaluationDate}`].join(' · ')}
          </p>
        </EuiText>
        <EvaluationStatusLine meta={data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />

        <EuiSpacer size='m' />

        {complianceResult?.compliance && (
          <>
            <ControlMaturity
              result={complianceResult}
              thresholds={scaleFor(getActiveENSConfiguration(), control.id, displayedAgent)}
              onOpenMachine={machineId => updateUrl({ agentId: machineId })}
            />
            <EuiSpacer size='m' />
          </>
        )}

        <EuiFlexGroup gutterSize='m' responsive={false} wrap>
          {kpis.map(kpi => (
            <EuiFlexItem key={kpi.description} style={{ minWidth: 180 }}>
              <EuiPanel hasBorder paddingSize='m'>
                <EuiStat title={kpi.title} description={kpi.description} titleSize='m' titleColor={kpi.color as any} reverse />
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>

        <EuiSpacer size='m' />

        <EuiFlexGroup gutterSize='m' wrap>
          <EuiFlexItem grow={2} style={{ minWidth: 360 }}>
            <EuiPanel hasBorder>
              <EuiTitle size='xs'>
                <h3>Requisitos</h3>
              </EuiTitle>
              <EuiSpacer size='s' />
                {(complianceResult?.requirements || [])
                  .filter((requirement: any) => requirement.status !== 'NO_APLICA')
                  .map((requirement: any) => {
                    const culprits = (requirement.evidenceIds || [])
                      .map((evidenceId: string) => {
                        const evidence = findEvidence(evidenceId);

                        return evidence &&
                          evidence.status !== 'CUMPLE' &&
                          evidence.status !== 'NO_APLICA'
                          ? { id: evidenceId, status: evidence.status }
                          : undefined;
                      })
                      .filter(Boolean) as {
                      id: string;
                      status: string;
                    }[];

                    const isCompliant = requirement.status === 'CUMPLE';

                    return (
                      <EuiFlexGroup
                        key={requirement.id}
                        gutterSize='s'
                        alignItems='center'
                        responsive={false}
                        style={{
                          padding: '7px 0',
                          borderBottom: '1px solid #F1F4FA',
                        }}
                      >
                        <EuiFlexItem grow={false}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: isCompliant ? '#00A69B' : '#BD271E',
                              display: 'block',
                            }}
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false} style={{ minWidth: 96 }}>
                          <EuiText size='xs'>
                            <strong>
                              <GuideCode target={{ kind: 'requirement', id: requirement.id }} onOpen={setGuideTarget} />
                            </strong>
                          </EuiText>
                        </EuiFlexItem>

                        {isAggregatedView && requirement.machines && (
                          <EuiFlexItem grow={false} style={{ width: 210, flexShrink: 0 }}>
                            <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false}>
                              <EuiFlexItem grow={false}>
                                <MaturitySeal status={requirement.status} compliance={requirement.compliance} />
                              </EuiFlexItem>
                              <EuiFlexItem grow={false}>
                                <EuiText size='xs' color='subdued'>
                                  <span>{`${requirement.machines.met}/${requirement.machines.total} máquinas`}</span>
                                </EuiText>
                              </EuiFlexItem>
                            </EuiFlexGroup>
                          </EuiFlexItem>
                        )}

                        <EuiFlexItem>
                          {isCompliant && requirement.attestation ? (
                            <AttestationLinks attestation={requirement.attestation} />
                          ) : isCompliant ? (
                            isAggregatedView && requirement.compliance ? null : (
                              <EuiText size='xs' color='subdued'>
                                {compliantRequirementLabel(requirement)}
                              </EuiText>
                            )
                          ) : culprits.length ? (
                            <EuiFlexGroup
                              gutterSize='xs'
                              wrap
                              responsive={false}
                            >
                              {culprits.map(culprit => (
                                <EuiFlexItem grow={false} key={culprit.id}>
                                  <EuiBadge
                                    color={getBadgeColor(culprit.status)}
                                    iconType={getStatusIcon(culprit.status)}
                                    onClick={() => setGuideTarget({ kind: 'evidence', id: culprit.id })}
                                    onClickAriaLabel={`Ver la explicación de ${culprit.id}`}
                                  >
                                    {culprit.id}
                                  </EuiBadge>
                                </EuiFlexItem>
                              ))}
                            </EuiFlexGroup>
                          ) : (requirement.evidenceIds || []).length === 0 ? (
                            <EuiText size='xs' color='subdued'>
                              sin evidencia declarada
                            </EuiText>
                          ) : (
                            <EuiText size='xs' color='subdued'>
                              {requirement.evidenced === false
                                ? 'no demostrado'
                                : 'no cumple'}
                            </EuiText>
                          )}
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    );
                  })}

                <EuiSpacer size='s' />

                <EuiText size='xs' color='subdued'>
                  <strong>
                    {isAggregatedView
                      ? `Requisitos conformes en todas las máquinas: ${compliantRequirements}/${denominatorRequirements}`
                      : `Requisitos conformes: ${compliantRequirements}/${denominatorRequirements}`}
                  </strong>{' '}
                  ·{' '}
                  {isAggregatedView
                    ? `Cumplimiento medio de ${totalMachines} máquinas: ${engineScoreText}`
                    : `Cumplimiento: ${engineScoreText}`}
                </EuiText>
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem grow={1} style={{ minWidth: 280 }}>
            <EuiPanel hasBorder>
              <EuiTitle size='xs'>
                <h3>Detalle auditor</h3>
              </EuiTitle>
              <EuiSpacer size='s' />
                  {auditorSheet.map(pair => (
                    <EuiFlexGroup
                      key={pair.label}
                      gutterSize='m'
                      responsive={false}
                      style={{ padding: '4px 0' }}
                    >
                      <EuiFlexItem grow={false} style={{ width: 210, flexShrink: 0 }}>
                        <EuiText size='xs' color='subdued'>
                          {pair.label}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size='xs'>
                          <strong>{pair.value}</strong>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  ))}
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size='m' />

        <MeasureMaturity
          measureId={control.id}
          maturity={maturity.data?.measures[control.id]}
          onSaved={() => {
            setAssessed(count => count + 1);
            maturity.reload();
          }}
        />

        <EuiSpacer size='l' />

        <EuiTabs>
          {detailTabs.map(tab => (
            <EuiTab key={tab.id} isSelected={detailTab === tab.id} onClick={() => setDetailTab(tab.id)}>
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>

        <EuiSpacer size='m' />

        {detailTab === 'evidences' && (
          <>
        {!displayedAgent && totalMachines > 1 && (
          <>
            <EuiSpacer size='xs' />

          </>
        )}
        <EuiBasicTable noItemsMessage='No hay datos.'
          items={evidenceStatusItems}
          columns={[
            {
              field: 'id',
              name: 'Evidencia',
              width: '90px',
              render: (id: string) => (
                <strong>
                  <GuideCode target={{ kind: 'evidence', id }} onOpen={setGuideTarget} />
                </strong>
              ),
            },
            {
              field: 'title',
              name: 'Título',
              render: (title: string, item: (typeof evidenceStatusItems)[number]) => {
                const requiredSource = describeRequiredSource(control.id, item.id);

                return (
                  <EuiText size='s'>
                    {title}{' '}
                    <InfoTip
                      content={
                        <ProvenancedText provenance={ENS_PROPOSAL_TEXT_PROVENANCE} text={item.description} />
                      }
                    />
                    {requiredSource && (
                      <EuiText size='xs' color='subdued'>
                        Fuente necesaria: {requiredSource}
                      </EuiText>
                    )}
                  </EuiText>
                );
              },
            },
            {
              field: 'status',
              name: 'Estado',
              width: '150px',
              render: (status: string, item: (typeof evidenceStatusItems)[number]) =>
                pendingMeasurement ? (
                  <EuiBadge color='hollow' iconType='clock'>
                    {ENS_PENDING_MEASUREMENT_LABEL}
                  </EuiBadge>
                ) : (
                  <EvidenceSeal evidence={item.evidence} />
                ),
            },
            {
              field: 'requirement',
              name: 'Requisito ENS',
              width: '150px',
              render: (req: string) => (
                <EuiText size='xs'>
                  {req.split(', ').filter(Boolean).map((id, index) => (
                    <React.Fragment key={id}>
                      {index > 0 && ', '}
                      <GuideCode target={{ kind: 'requirement', id }} onOpen={setGuideTarget} />
                    </React.Fragment>
                  ))}
                </EuiText>
              ),
            },
            {
              field: 'level',
              name: 'Nivel',
              width: '110px',
              render: (level: string) => (
                <EuiText size='xs'>
                  <span>{level}</span>
                </EuiText>
              ),
            },
            {
              field: 'id',
              name: 'Motivo',
              render: (_: string, item: (typeof evidenceStatusItems)[number]) => (
                <EvidenceMotiveCell evidence={item.evidence} onOpen={() => setMotive({ evidenceId: item.id })} />
              ),
            },
          ]}
        />
        <DocumentaryEvidences
          requirements={documentaryRequirements(complianceResult?.requirements)}
          onConfigure={handlers.onParameter}
        />
          </>
        )}

        {detailTab === 'non-conformities' && (
          pendingMeasurement ? (
            <EuiCallOut title={ENS_PENDING_MEASUREMENT_LABEL} color='primary' iconType='clock' />
          ) : nonConformityItems.length === 0 ? (
            <EuiCallOut
              title={complianceResult.status === 'NO_APLICA' ? `${control.id} no aplica en el nivel ${levelsText}` : 'Sin no conformidades abiertas'}
              color='success'
              iconType='check'
            />
          ) : (
            <NonConformityList
              items={complianceResult?.nonConformities || []}
              controlId={control.id}
              configuration={getActiveENSConfiguration()}
              findEvidence={findEvidence}
              requirementTitle={id => (complianceResult?.requirements || []).find((r: any) => r.id === id)?.title}
              criticalityOf={criticalityOf}
              onConfigure={handlers.onParameter!}
              onOpenMotive={(evidenceId, agentIds) => setMotive({ evidenceId, agentIds })}
            />
          )
        )}

        {detailTab === 'evolution' && (
          <ControlEvolutionChart
            points={controlTimeline}
            controlId={control.id}
            pending={Boolean(data?.meta?.seriesPending)}
          />
        )}

        {detailTab === 'traceability' && (
          <>
          <EuiFlexGroup
            alignItems='center'
            justifyContent='spaceBetween'
            gutterSize='s'
          >
            <EuiFlexItem grow={false}>
              <EuiTitle size='s'>
                <h3>Trazabilidad ENS ↔ Wazuh</h3>
              </EuiTitle>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText size='xs' color='subdued'>
                {traceabilityTotal.toLocaleString('es-ES')} registro
                {traceabilityTotal === 1 ? '' : 's'}
                {traceabilityTotal > traceabilityAvailable
                  ? ` · se pueden recorrer los ${traceabilityAvailable.toLocaleString('es-ES')} primeros; todos los hechos están en Eventos`
                  : ''}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size='s' />

          {traceError ? (
            <>
              <FactsReadErrorCallOut error={traceError} onRetry={() => setTraceRetry(n => n + 1)} />
              <EuiSpacer size='s' />
            </>
          ) : null}

          {traceabilityTotal === 0 ? (
            <EuiText size='s' color='subdued'>
              <p>
                Sin trazabilidad
              </p>
            </EuiText>
          ) : (
            <EuiBasicTable
              items={traceabilityPageItems}
              loading={traceLoading}
              noItemsMessage={traceLoading ? 'Cargando la página…' : traceError ? 'No se pudo leer esta página.' : undefined}
              itemId='key'
              itemIdToExpandedRowMap={traceExpandedRowMap}
              isExpandable={true}
              compressed={true}
              columns={traceabilityColumns}
              pagination={{
                pageIndex: tracePageIndex,
                pageSize: tracePageSize,
                totalItemCount: traceabilityAvailable,
                pageSizeOptions: [5, 10, 25, 50],
              }}
              onChange={({ page }: { page?: { index: number; size: number } }) => {
                if (page) {
                  setTracePageIndex(page.index);
                  setTracePageSize(page.size);
                }
              }}
            />
          )}
          </>
        )}

        {detailTab === 'text' && (
          <>
          <RequirementTextsPanel controlId={control.id} />
          <TemplateCorrespondencePanel controlId={control.id} />
          </>
        )}

        {motive && findEvidence(motive.evidenceId) && (
          <EvidenceMotiveFlyout
            controlId={control.id}
            evidence={scopedEvidence(findEvidence(motive.evidenceId), motive.agentIds)}
            configuration={getActiveENSConfiguration()}
            onClose={() => setMotive(undefined)}
            onConfigure={handlers.onParameter}
          />
        )}

        {guideTarget && (
          <ControlGuideFlyout
            controlId={control.id}
            target={guideTarget}
            status={
              guideTarget.kind === 'requirement'
                ? (complianceResult?.requirements || []).find((item: any) => item.id === guideTarget.id)?.status
                : findEvidence(guideTarget.id)?.status
            }
            onOpen={setGuideTarget}
            onClose={() => setGuideTarget(undefined)}
            onShowFacts={() => updateUrl({ tabView: 'evidences', evidenceControl: control.id })}
          />
        )}
      </EuiPanel>
    </EuiPage>
  );
};
