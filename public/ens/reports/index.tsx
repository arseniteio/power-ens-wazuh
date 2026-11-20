import React, { useMemo, useState } from 'react';
import {
  EuiPanel,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiHealth,
  EuiBasicTable,
  EuiButton,
  EuiHorizontalRule,
  EuiButtonIcon,
  EuiAccordion,
  EuiButtonEmpty,
  EuiCallOut,
  EuiStat,
} from '@elastic/eui';
import { useRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { EvaluationStatusLine, EvaluationLoading } from '../../evaluation/evaluation-status';
import { getActiveControlConfiguration, getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { compareENSControlIdsByAnnex, getENSCatalogControl } from '../../../common/ens/catalog';
import { describeApplicableLevelLabel } from '../../../common/ens/core/control-level';
import { describeNotMeasuredOnAgent } from '../../../common/ens/core/scope/measurement-planes';
import { canExportReport, reportViewState } from './report-view-state';
import { describeParameterForMachine } from '../controls/parameter-origins';
import { useHostParameters } from '../controls/use-host-parameters';
// Import from the types file, never from the `../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type { ENSComplianceResult, ENSRequirementResult } from '../../../common/ens/core/evaluation/types';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { getENSReportModelDefinition, listENSControlsWithoutReportModel } from './registry';
import type { ENSReportModelDefinition } from './registry';
import type { ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
import {
  buildENSReportEvidencePdfCell,
  buildENSReportRows,
  ensReportStatusBadgeColor,
  ensReportStatusPdfColor,
  ensRequirementProofLabel,
  ENS_REPORT_EVIDENCE_FIELD,
  ENS_REPORT_NO_EVIDENCE,
} from './report-rows';
import type { ENSReportRow } from './report-rows';
import { MotiveCell } from '../controls/control-detail/motive-cell';
import {
  ProvenanceLabel,
  ProvenancedText,
  TemplateCorrespondencePanel,
} from '../controls/control-detail/requirement-texts';
import { ENS_PROPOSAL_TEXT_PROVENANCE, OPERATIONAL_INDICATOR_NOTE } from '../../../common/ens/catalog/support/provenance';
import {
  REPORT_CRITERION_NOTE,
  buildTemplateCorrespondencePdf,
  describeReportControlLine,
  describeReportPendingMeasurement,
  pdfProvenanceRuns,
  pdfRowLabel,
  reportRequirementTexts,
} from './report-provenance';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { filterByENSPrefix, listENSFamilies, resolveENSSectionOpenState } from '../control-filter/prefix';
import { statusLabel } from '../../../common/ens/core/status-label';
import { dateTimeLabel } from '../../../common/ens/core/date-label';
import { useOrganizationMaturity } from '../maturity/maturity-client';
import { maturityPdf, maturityReportRows } from '../maturity/maturity-report';
import { assessmentOf } from '../../../common/ens/maturity/assessments';
import { ENS_MATURITY_NOTE } from '../../../common/ens/maturity/types';
import { useOpenControl } from '../open-control';
import { FilterBar } from '../ui/filter-bar';
import { InfoTip } from '../ui/info-tip';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

const fmt = (iso?: string) => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return dateTimeLabel(d);
};

const OBSERVATION_PREVIEW_LENGTH = 90;

const PDF_SECONDARY_COLOR = '#69707d';

const CAUSE_LABEL: Record<string, string> = {
  CATALOG: 'catálogo',
  CONFIGURATION: 'sin configurar',
  COLLECTION: 'sin recogida',
  EVIDENCE: 'evidencia insuficiente',
};

const ControlReport = ({
  controlId,
  definition,
}: {
  controlId: string;
  definition: ENSReportModelDefinition;
}) => {
  const { agentId } = useRouterSearch();
  const openControl = useOpenControl();
  const hostParameter = useHostParameters(agentId);
  const [expandedReqIds, setExpandedReqIds] = useState<string[]>([]);

  const toggleRequirementDetail = (id: string) =>
    setExpandedReqIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    );

  const activeConfiguration = getActiveENSConfiguration();
  const maturity = useOrganizationMaturity();
  const maturityRows = maturityReportRows(maturity.data?.measures[controlId], assessmentOf(activeConfiguration, controlId));
  const evaluationPeriod = activeConfiguration.global.evaluationPeriod;
  const evaluationPeriodText = evaluationPeriod || 'sin configurar';

  const evaluation = useEnsEvaluation<{ result?: ENSComplianceResult; meta?: ENSEvaluationMeta }>({
    include: 'control',
    controlId,
    agentId,
  });
  const { error } = evaluation;
  const complianceResult = evaluation.data?.result;
  const ensLevel = evaluation.data?.meta?.level || activeConfiguration.global.ensLevel;
  const machine = agentId ? evaluation.data?.meta?.scope?.find(agent => agent.id === agentId) : undefined;
  const view = reportViewState({
    controlId,
    agentId,
    agentLabel: agentId ? (machine?.name ? `${agentId} · ${machine.name}` : agentId) : undefined,
    error,
    hasData: Boolean(evaluation.data),
    hasResult: Boolean(complianceResult),
    notMeasured: () => {
      const catalog = getENSCatalogControl(controlId);
      return catalog && agentId
        ? describeNotMeasuredOnAgent(catalog, agentId, machine?.name, getActiveControlConfiguration(controlId, agentId))
        : undefined;
    },
  });
  const exportable = canExportReport(view);

  const reportModel = useMemo(
    () => definition.build(complianceResult),
    [definition, complianceResult],
  );

  const engineScore = complianceResult ? complianceResult.score ?? null : null;
  const engineCoverage = complianceResult ? complianceResult.coverage : null;
  const engineLevel = complianceResult?.level || ensLevel;
  const levelLabel = describeApplicableLevelLabel(getENSCatalogControl(controlId) || {});
  const engineEvaluatedAt = complianceResult?.evaluatedAt || '-';

  const engineApplicable = complianceResult?.applicableRequirements ?? null;
  const engineMeasured = complianceResult?.measuredRequirements ?? null;

  const statusValue = complianceResult?.status || 'NO_EVALUABLE';

  const trafficLight =
    statusValue === 'CUMPLE'
      ? { health: 'success', stat: 'success', pdf: '#4caf50' }
      : statusValue === 'PARCIAL'
      ? { health: 'warning', stat: 'warning', pdf: '#f5a700' }
      : statusValue === 'NO_CUMPLE'
      ? { health: 'danger', stat: 'danger', pdf: '#e53935' }
      : { health: 'subdued', stat: 'default', pdf: PDF_SECONDARY_COLOR };

  const evidenceResults = complianceResult?.evidences || [];
  const requirementResults = complianceResult?.requirements || [];
  const parameterResults = complianceResult?.parameters || [];
  const nonConformities = complianceResult?.nonConformities || [];

  const evidenceAgent = evidenceResults.find(
    evidence => evidence.agentName || evidence.agentId,
  );

  const agentValue = agentId
    ? (evidenceAgent?.agentName || evidenceAgent?.agentId || `Agente ${agentId}`)
    : 'Todos los agentes';

  const formatPercent = (value: number | null) => (value !== null ? value + '%' : 'N/A');

  const provenText =
    engineApplicable === null
      ? 'N/A'
      : `${engineMeasured ?? 0}/${engineApplicable}`;

  const rows: ENSReportRow[] = buildENSReportRows(reportModel);

  const requirementCauses = (requirementId: string): string[] => {
    const causes: string[] = [];

    nonConformities.forEach(nonConformity => {
      if (
        !(nonConformity.requirementIds || [nonConformity.requirementId]).includes(requirementId) ||
        nonConformity.origin !== 'NO_EVIDENCIADA' ||
        !nonConformity.cause
      ) {
        return;
      }

      const label =
        CAUSE_LABEL[nonConformity.cause] || nonConformity.cause;

      if (causes.indexOf(label) < 0) {
        causes.push(label);
      }
    });

    return causes;
  };

  const testLabel = (requirement: ENSRequirementResult): string =>
    ensRequirementProofLabel(
      requirement,
      requirementCauses(requirement.id)
    );

  const evidenceTrace = (evidenceIds: string[]): string[] =>
    (evidenceIds || []).map(id => {
      const evidence = evidenceResults.find(item => item.id === id);

      const parts = [
        evidence?.resolvedRuleId ? `regla ${evidence.resolvedRuleId}` : null,
        evidence?.resolvedEventId ? `evento ${evidence.resolvedEventId}` : null,
        evidence?.lastSeen ? fmt(evidence.lastSeen) : null,
      ].filter(Boolean);

      return `${id} · ${parts.length > 0 ? parts.join(' · ') : 'sin evento'}`;
    });

  const requirementRows = requirementResults.map(requirement => ({
    id: requirement.id,
    title: requirement.title,
    status: requirement.status,
    test: testLabel(requirement),
    level: requirement.level.join(', ') || '-',
    evidences: (requirement.evidenceIds || []).join(', ') || '-',
    observationList: requirement.observations || [],
    observations: (requirement.observations || []).join(' · '),
    trace: evidenceTrace(requirement.evidenceIds || []),
    texts: reportRequirementTexts(controlId, requirement.id),
  }));

  const formatParameterValue = (value: unknown, matchMode?: string) => {
    if (matchMode === 'regex' && typeof value === 'string' && value) {
      return `Expresión regular: ${value}`;
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : '—';
    }

    if (value === undefined || value === null || value === '') {
      return '—';
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    return String(value);
  };

  const parameterRows = parameterResults.map(parameter => ({
    parameter: `${parameter.id} · ${parameter.label}`,
    status: parameter.status,
    value: hostParameter(controlId, parameter.id)?.value ?? formatParameterValue(parameter.value, describeParameterForMachine(activeConfiguration, controlId, agentId, parameter.id)?.matchMode),
    origin: hostParameter(controlId, parameter.id)?.origin ?? describeParameterForMachine(activeConfiguration, controlId, agentId, parameter.id)?.origin ?? '',
    required: parameter.required ? 'Sí' : 'No',
    requirements: parameter.requirements.join(', ') || '-',
    ifNotConfigured:
      parameter.status === 'NOT_CONFIGURED' || parameter.status === 'INVALID'
        ? parameter.ifNotConfigured || ''
        : '',
  }));

  const parameterBadgeColor = (status: string) =>
    status === 'CONFIGURED'
      ? 'success'
      : status === 'NOT_APPLICABLE'
      ? 'hollow'
      : status === 'INVALID'
      ? 'danger'
      : 'warning';

  const parameterPdfColor = (status: string) =>
    status === 'CONFIGURED'
      ? '#4caf50'
      : status === 'INVALID'
      ? '#e53935'
      : status === 'NOT_CONFIGURED'
      ? '#f5a700'
      : PDF_SECONDARY_COLOR;

  const hasDetail = (item: { observations: string; trace: string[]; texts?: unknown[] }) =>
    (item.observations || '').length > OBSERVATION_PREVIEW_LENGTH ||
    item.trace.length > 0 ||
    (item.texts || []).length > 0;

  const requirementColumns = [
    {
      field: 'id',
      name: 'Requisito',
      width: '130px',
    },
    {
      field: 'title',
      name: 'Descripción',
    },
    {
      field: 'level',
      name: 'Nivel',
      width: '90px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '190px',
      render: (status: string, item: { test: string }) => (
        <>
          <EuiBadge color={ensReportStatusBadgeColor(status)}>{statusLabel(status)}</EuiBadge>
          {item.test ? (
            <EuiText size='xs' color='subdued'>
              {item.test}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'evidences',
      name: 'Evidencias',
      width: '130px',
    },
    {
      field: 'observations',
      name: 'Observaciones',
      render: (value: string) => {
        const text = value || '—';

        return (
          <EuiText size='xs'>
            {text.length <= OBSERVATION_PREVIEW_LENGTH
              ? text
              : text.slice(0, OBSERVATION_PREVIEW_LENGTH).trimEnd() + '…'}
          </EuiText>
        );
      },
    },
    {
      align: 'right' as const,
      width: '40px',
      isExpander: true,
      render: (item: { id: string; observations: string; trace: string[] }) =>
        hasDetail(item) ? (
          <EuiButtonIcon
            onClick={() => toggleRequirementDetail(item.id)}
            aria-label={
              expandedReqIds.includes(item.id)
                ? 'Contraer detalle'
                : 'Ver observaciones y trazabilidad'
            }
            iconType={
              expandedReqIds.includes(item.id) ? 'arrowUp' : 'arrowDown'
            }
          />
        ) : null,
    },
  ];

  const requirementExpandedRowMap = expandedReqIds.reduce(
    (acc: Record<string, React.ReactNode>, id) => {
      const row = requirementRows.find(item => item.id === id);

      if (row && hasDetail(row)) {
        acc[id] = (
          <EuiText size='xs'>
            {row.texts.map(text => (
              <ProvenancedText key={text.provenance} provenance={text.provenance} text={text.text} />
            ))}

            {row.observationList.length > 0 ? (
              <>
                <strong>Observaciones</strong>
                <ul>
                  {row.observationList.map((observation, index) => (
                    <li key={index}>{observation}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {row.trace.length > 0 ? (
              <>
                <strong>Trazabilidad</strong>
                <ul>
                  {row.trace.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </EuiText>
        );
      }

      return acc;
    },
    {},
  );

  const parameterColumns = [
    {
      field: 'parameter',
      name: 'Parámetro',
      render: (parameter: string, item: { ifNotConfigured: string }) => (
        <>
          <EuiText size='xs'>
            {parameter} <ProvenanceLabel provenance={ENS_PROPOSAL_TEXT_PROVENANCE} />
          </EuiText>
          {item.ifNotConfigured ? (
            <EuiText size='xs' color='subdued'>
              Si falta: {item.ifNotConfigured}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'value',
      name: 'Valor aplicado',
      render: (value: string, item: { origin: string }) => (
        <>
          <EuiText size='xs'>{value}</EuiText>
          {item.origin ? (
            <EuiText size='xs' color='subdued'>
              {item.origin}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'required',
      name: 'Obligatorio',
      width: '110px',
    },
    {
      field: 'requirements',
      name: 'Requisitos',
      width: '160px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '210px',
      render: (status: string) => (
        <EuiBadge color={parameterBadgeColor(status)}>{statusLabel(status)}</EuiBadge>
      ),
    },
  ];

  const columns = [
    {
      field: 'field',
      name: 'Campo',
      width: '28%',
      render: (field: string) => (
        <EuiText size='s'>
          {field} <ProvenanceLabel provenance={ENS_PROPOSAL_TEXT_PROVENANCE} />
        </EuiText>
      ),
    },
    {
      field: 'value',
      name: 'Valor',
      render: (value: string, item: ENSReportRow) => (
        <>
          <MotiveCell
            lines={value
              .split(' · ')
              .map(text => text.trim())
              .filter(Boolean)
              .map(text => ({ text }))}
            title={item.field}
          />
          {item.context ? (
            <EuiText size='xs' color='subdued'>
              {item.context}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: ENS_REPORT_EVIDENCE_FIELD,
      name: 'Evidencia',
      width: '190px',
      render: (evidence: string, item: ENSReportRow) => (
        <EuiFlexGroup direction='column' gutterSize='xs' responsive={false} alignItems='flexStart'>
          <EuiFlexItem grow={false}>
            <EuiBadge color={ensReportStatusBadgeColor(item.status)}>{statusLabel(item.status)}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color={evidence === ENS_REPORT_NO_EVIDENCE ? 'subdued' : 'default'}>
              <span>{evidence}</span>
            </EuiText>
          </EuiFlexItem>
          {item.pendingData ? (
            <EuiFlexItem grow={false}>
              <EuiText size='xs' color='subdued'>
                <span>{item.pendingData}</span>
              </EuiText>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      ),
    },
  ];

  const exportPdf = () => {
    if (!exportable || !complianceResult) return;
    const now = new Date();
    const issueDate = dateTimeLabel(now);

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'Power ENS sobre Wazuh', alignment: 'left', fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: '#999', margin: [0, 0, 40, 0] },
        ],
      }),
      content: [
        { text: 'INFORME DE CUMPLIMIENTO ENS', style: 'h1' },
        { text: definition.name, style: 'h2' },
        { text: ['RD 311/2022', describeReportControlLine(controlId)].filter(Boolean).join(' · '), style: 'sub' },
        ...(describeReportPendingMeasurement(controlId)
          ? [{ text: describeReportPendingMeasurement(controlId), style: 'sub', italics: true, margin: [0, 2, 0, 0] }]
          : []),
        { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }], margin: [0, 4, 0, 12] },

        {
          columns: [
            { width: '50%', stack: [
              { text: 'Activo evaluado', style: 'metaLabel' },
              { text: agentValue, style: 'metaValue' },
              { text: 'Periodo evaluado', style: 'metaLabel' },
              { text: evaluationPeriodText, style: 'metaValue' },
            ]},
            { width: '50%', stack: [
              { text: 'Fecha de emision', style: 'metaLabel' },
              { text: issueDate, style: 'metaValue' },
              { text: 'Estado del control', style: 'metaLabel' },
              { text: statusValue, style: 'metaValue', color: trafficLight.pdf, bold: true },
            ]},
          ],
          margin: [0, 0, 0, 16],
        },

        { text: 'Resultado', style: 'h3' },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*'],
            body: [
              [
                { text: levelLabel, style: 'th' },
                { text: 'Cumplimiento', style: 'th' },
                { text: 'Cobertura', style: 'th' },
                { text: 'Requisitos demostrados', style: 'th' },
              ],
              [
                { text: String(engineLevel), style: 'scoreCell', color: '#006bb4' },
                { text: formatPercent(engineScore), style: 'scoreCell', color: trafficLight.pdf },
                {
                  text: formatPercent(engineCoverage),
                  style: 'scoreCell',
                  color: engineCoverage === null ? PDF_SECONDARY_COLOR : '#006bb4',
                },
                {
                  text: provenText,
                  style: 'scoreCell',
                  color:
                    engineApplicable !== null &&
                    engineApplicable > 0 &&
                    engineMeasured === engineApplicable
                      ? '#4caf50'
                      : PDF_SECONDARY_COLOR,
                },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 4],
        },
        { text: OPERATIONAL_INDICATOR_NOTE, style: 'sub', margin: [0, 0, 0, 16] },
        ...maturityPdf(maturityRows),

        { text: 'Campos del informe', style: 'h3' },
        { text: REPORT_CRITERION_NOTE, style: 'sub', margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['38%', '*', '18%'],
            body: [
              [
                { text: 'Campo', style: 'th' },
                { text: 'Valor', style: 'th' },
                { text: 'Evidencia', style: 'th' },
              ],
              ...rows.map((r) => [
                { text: [pdfRowLabel(), r.field], style: 'td' },
                {
                  text: r.context
                    ? [
                        r.value,
                        {
                          text: `\n${r.context}`,
                          fontSize: 7,
                          color: '#69707D',
                        },
                      ]
                    : r.value,
                  style: 'td',
                },
                buildENSReportEvidencePdfCell(r),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },

        { text: 'Requisitos', style: 'h3', margin: [0, 16, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 105],
            body: [
              [
                { text: 'Requisito', style: 'th' },
                { text: 'Descripción, trazabilidad y observaciones', style: 'th' },
                { text: 'Nivel', style: 'th' },
                { text: 'Estado', style: 'th' },
              ],
              ...requirementRows.map(requirement => [
                { text: requirement.id, style: 'td' },
                {
                  text: [
                    { text: requirement.title, bold: true },
                    ...pdfProvenanceRuns(requirement.texts),
                    ...[...requirement.trace, requirement.observations || undefined]
                      .filter(Boolean)
                      .map(line => ({ text: `\n${line}` })),
                  ],
                  style: 'td',
                },
                { text: requirement.level, style: 'td' },
                {
                  style: 'td',
                  text: [
                    {
                      text: requirement.status,
                      color: ensReportStatusPdfColor(requirement.status),
                      bold: true,
                    },
                    ...(requirement.test
                      ? [{ text: `\n${requirement.test}`, color: PDF_SECONDARY_COLOR }]
                      : []),
                  ],
                },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16],
        },

        { text: 'Parámetros', style: 'h3' },
        { text: REPORT_CRITERION_NOTE, style: 'sub', margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Parámetro y valor', style: 'th' },
                { text: 'Obligatorio', style: 'th' },
                { text: 'Requisitos', style: 'th' },
                { text: 'Estado', style: 'th' },
              ],
              ...parameterRows.map(parameter => [
                {
                  text: [pdfRowLabel(), `${parameter.parameter}: ${parameter.value}${parameter.origin ? ` (${parameter.origin})` : ''}`],
                  style: 'td',
                },
                { text: parameter.required, style: 'td' },
                { text: parameter.requirements, style: 'td' },
                {
                  style: 'td',
                  text: [
                    {
                      text: parameter.status,
                      color: parameterPdfColor(parameter.status),
                      bold: true,
                    },
                    ...(parameter.ifNotConfigured
                      ? [
                          {
                            text: `\nSi falta: ${parameter.ifNotConfigured}`,
                            color: PDF_SECONDARY_COLOR,
                          },
                        ]
                      : []),
                  ],
                },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },

        ...buildTemplateCorrespondencePdf(controlId),
      ],
      styles: {
        h1: { fontSize: 16, bold: true, color: '#1a1c21' },
        h2: { fontSize: 13, bold: true, color: '#006bb4', margin: [0, 2, 0, 0] },
        h3: { fontSize: 11, bold: true, color: '#1a1c21', margin: [0, 0, 0, 6] },
        sub: { fontSize: 9, color: '#69707d', margin: [0, 2, 0, 0] },
        metaLabel: { fontSize: 8, color: '#69707d', margin: [0, 6, 0, 0] },
        metaValue: { fontSize: 10, color: '#1a1c21', bold: false },
        th: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#006bb4', margin: [2, 4, 2, 4] },
        td: { fontSize: 9, color: '#1a1c21', margin: [2, 3, 2, 3] },
        scoreCell: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 6, 0, 6] },
      },
      defaultStyle: { fontSize: 10 },
    };

    const name = 'Informe_ENS_' + controlId + '_' + (agentId ? agentValue.replace(/[^a-zA-Z0-9]/g, '_') : 'general') + '.pdf';
    (pdfMake as any).createPdf(docDefinition).download(name);
  };

  if (error) {
    return (
      <>
        <FactsReadErrorCallOut error={error} onRetry={evaluation.retry} />
        <EuiSpacer size='m' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  if (view.kind === 'not-measured') {
    return (
      <>
        <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
        <EuiCallOut size='s' color='primary' iconType='iInCircle' title={view.title}>
          <EuiText size='xs'>
            <p>{view.text}</p>
            <p>Sin informe</p>
          </EuiText>
        </EuiCallOut>
        <EuiSpacer size='m' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  if (view.kind === 'loading') {
    return (
      <>
        <EvaluationLoading message='Leyendo los veredictos del motor…' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  return (
    <>
      <EuiButtonEmpty size='s' flush='left' iconType='arrowRight' iconSide='right' onClick={() => openControl(controlId)}>
        {`Ver ${controlId} en Detalle del control`}
      </EuiButtonEmpty>
      <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
      <EuiFlexGroup justifyContent='spaceBetween' alignItems='center'>
        <EuiFlexItem>
          <EuiText size='xs' color='subdued'>
            <p>
              {agentValue} · periodo {evaluationPeriodText} · evaluado{' '}
              {fmt(engineEvaluatedAt)}
            </p>
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiHealth color={trafficLight.health}>{statusLabel(statusValue)}</EuiHealth>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin='m' />

      <EuiFlexGroup gutterSize='m' responsive={false} wrap>
        {[
          { title: String(engineLevel), description: levelLabel },
          { title: formatPercent(engineScore), description: 'Cumplimiento', color: trafficLight.stat },
          { title: formatPercent(engineCoverage), description: 'Cobertura' },
          { title: provenText, description: 'Requisitos demostrados' },
        ].map(kpi => (
          <EuiFlexItem key={kpi.description} style={{ minWidth: 160 }}>
            <EuiPanel hasBorder paddingSize='m'>
              <EuiStat title={kpi.title} description={kpi.description} titleSize='m' titleColor={kpi.color as any} reverse />
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>
          Nivel de madurez <InfoTip content={ENS_MATURITY_NOTE} />
        </h3>
      </EuiTitle>
      <EuiSpacer size='s' />
      <EuiBasicTable noItemsMessage='No hay datos.' items={maturityRows} columns={[{ field: 'label', name: 'Campo', width: '220px' }, { field: 'value', name: 'Valor' }]} tableLayout='fixed' />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Campos del informe</h3>
      </EuiTitle>

      <EuiText size='xs' color='subdued'>
        <p>{REPORT_CRITERION_NOTE}</p>
      </EuiText>

      <EuiSpacer size='s' />

      <EuiBasicTable noItemsMessage='No hay datos.' items={rows} columns={columns} tableLayout='fixed' />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Requisitos</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiBasicTable noItemsMessage='No hay datos.'
        items={requirementRows}
        itemId='id'
        itemIdToExpandedRowMap={requirementExpandedRowMap}
        isExpandable={true}
        compressed={true}
        columns={requirementColumns}
      />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Parámetros</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiBasicTable noItemsMessage='No hay datos.'
        items={parameterRows}
        compressed={true}
        columns={parameterColumns}
      />

      <EuiSpacer size='l' />

      <TemplateCorrespondencePanel controlId={controlId} />

      <EuiSpacer size='l' />

      <EuiButton iconType='download' size='s' fill onClick={exportPdf} isDisabled={!exportable}>
        Exportar PDF
      </EuiButton>
    </>
  );
};

interface ControlReportEntry {
  controlId: string;
  title: string;
  levels: string;
  requirementCount: number;
  evidenceCount: number;

  filterableIds: string[];

  reportModelDefinition?: ENSReportModelDefinition;
}

const ControlReportHeader = ({ entry }: { entry: ControlReportEntry }) => (
  <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiText size='s'>
        <strong>{entry.controlId}</strong> — {entry.title}
      </EuiText>
    </EuiFlexItem>

    {describeReportControlLine(entry.controlId) && (
      <EuiFlexItem grow={false}>
        <EuiText size='xs' color='subdued'>
          {describeReportControlLine(entry.controlId)}
        </EuiText>
      </EuiFlexItem>
    )}

    {describeReportPendingMeasurement(entry.controlId) && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='hollow' iconType='clock' title={describeReportPendingMeasurement(entry.controlId)}>
          Sin medición todavía
        </EuiBadge>
      </EuiFlexItem>
    )}

    <EuiFlexItem grow={false}>
      <EuiBadge color='hollow'>{entry.levels}</EuiBadge>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='default'>
        {`${entry.requirementCount} ${entry.requirementCount === 1 ? 'requisito' : 'requisitos'} · ${entry.evidenceCount} ${entry.evidenceCount === 1 ? 'evidencia' : 'evidencias'}`}
      </EuiBadge>
    </EuiFlexItem>

    {!entry.reportModelDefinition && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='warning' iconType='alert'>
          Sin modelo de informe
        </EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

const ControlWithoutReportModel = ({
  entry,
}: {
  entry: ControlReportEntry;
}) => (
  <EuiCallOut
    size='s'
    color='warning'
    iconType='documentEdit'
    title={`${entry.controlId} no tiene modelo de informe`}
  >
    <EuiText size='xs'>
      <p>
        Sin modelo de informe en{' '}
        <code>public/ens/reports/registry.ts</code>.
      </p>
    </EuiText>
  </EuiCallOut>
);

export const ReportsENS = () => {
  const [prefix, setPrefix] = React.useState<string>('');

  const [openControlIds, setOpenControlIds] = React.useState<
    Record<string, boolean | undefined>
  >({});

  const applyPrefix = (value: string) => {
    setPrefix(value);
    setOpenControlIds({});
  };

  const entries: ControlReportEntry[] = React.useMemo(
    () =>
      ENSControls.map(control => ({
        controlId: control.id,
        title: control.title,
        levels: control.scope.activeLevels.join(', '),
        requirementCount: control.requirements.length,
        evidenceCount: control.evidences.length,
        filterableIds: [
          control.id,
          ...control.requirements.map(requirement => requirement.id),
        ],
        reportModelDefinition: getENSReportModelDefinition(control.id),
      })).sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId)),
    [],
  );

  const withoutReportModel = React.useMemo(
    () =>
      listENSControlsWithoutReportModel(
        entries.map(entry => entry.controlId),
      ),
    [entries],
  );

  const families = React.useMemo(
    () => listENSFamilies(entries.map(entry => entry.controlId)),
    [entries],
  );

  const filtered = React.useMemo(
    () => filterByENSPrefix(entries, prefix, entry => entry.filterableIds),
    [entries, prefix],
  );

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

  return (
    <>
      <EuiPanel paddingSize='m'>
        <EuiTitle size='xs'>
          <h3>Informes</h3>
        </EuiTitle>

        <EuiSpacer size='s' />

        <FilterBar
          allLabel='Todos'
          options={families.map(family => ({ value: family, label: family }))}
          active={families.includes(filtered.query) ? filtered.query : ''}
          onFilter={applyPrefix}
          query={prefix}
          onQuery={applyPrefix}
          placeholder='Filtrar por prefijo: op.acc, op.acc.1, op.acc.1.2…'
          ariaLabel='Filtrar controles por prefijo del identificador ENS'
        />

        <EuiSpacer size='s' />

        <EuiFlexGroup
          gutterSize='s'
          alignItems='center'
          wrap
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              <p>
                {filtered.isActive
                  ? `${filtered.matched.length} de ${entries.length} controles`
                  : `${entries.length} controles`}
              </p>
            </EuiText>
          </EuiFlexItem>

          {filtered.isActive && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='accent'>Filtro: {filtered.query}</EuiBadge>
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

        {withoutReportModel.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut
              size='s'
              color='warning'
              iconType='alert'
              title={`Sin modelo de informe: ${withoutReportModel.join(', ')}`}
            />
          </>
        )}
      </EuiPanel>

      <EuiSpacer size='m' />

      {filtered.matched.length === 0 ? (
        <EuiPanel paddingSize='m'>
          <EuiCallOut
            size='s'
            color='warning'
            iconType='search'
            title={`Ningún control coincide con «${filtered.query}»`}
          >
            <EuiButtonEmpty
              size='s'
              iconType='cross'
              onClick={() => applyPrefix('')}
            >
              Quitar filtro
            </EuiButtonEmpty>
          </EuiCallOut>
        </EuiPanel>
      ) : (
        filtered.matched.map(entry => (
          <React.Fragment key={entry.controlId}>
            <EuiPanel paddingSize='m'>
              <EuiAccordion
                id={`ens-informe-${entry.controlId.replace(/\./g, '-')}`}
                buttonContent={<ControlReportHeader entry={entry} />}
                forceState={isOpen(entry.controlId) ? 'open' : 'closed'}
                onToggle={(nextIsOpen: boolean) =>
                  toggleControl(entry.controlId, nextIsOpen)
                }
                paddingSize='m'
              >
                {isOpen(entry.controlId) ? (
                  entry.reportModelDefinition ? (
                    <ControlReport
                      controlId={entry.controlId}
                      definition={entry.reportModelDefinition}
                    />
                  ) : (
                    <ControlWithoutReportModel entry={entry} />
                  )
                ) : null}
              </EuiAccordion>
            </EuiPanel>
            <EuiSpacer size='m' />
          </React.Fragment>
        ))
      )}
    </>
  );
};
