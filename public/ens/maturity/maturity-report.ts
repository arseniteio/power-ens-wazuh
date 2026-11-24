import { ENS_MATURITY_NOTE, ENSEngineMaturity, ENSMaturityAssessment, incoherenceText, maturityLabel } from '../../../common/ens/maturity/types';
import { dateTimeLabel } from '../../../common/ens/core/date-label';

export interface ENSMaturityReportRow {
  label: string;
  value: string;
}

export const maturityReportRows = (engine: ENSEngineMaturity | undefined, declared: ENSMaturityAssessment | undefined): ENSMaturityReportRow[] => [
  {
    label: 'Continuidad de la evidencia (30 días)',
    value:
      engine?.accredited === undefined
        ? 'sin medición'
        : `${maturityLabel(engine.accredited)}${engine.machines ? ` (nivel más bajo de ${engine.machines} activos, ${engine.period_days || 30} días)` : ''}`,
  },
  { label: 'Valorado', value: declared?.level === undefined ? 'sin valorar' : maturityLabel(declared.level) },
  { label: 'Objetivo', value: declared?.target === undefined ? 'sin objetivo' : maturityLabel(declared.target) },
  {
    label: 'Valoración',
    value: declared?.assessedBy
      ? `${declared.assessedBy}${declared.assessedAt ? `, ${dateTimeLabel(declared.assessedAt)}` : ''}${declared.references ? ` · ${declared.references}` : ''}`
      : '—',
  },
  ...(engine?.incoherent ? [{ label: 'Coherencia', value: incoherenceText(declared?.level, engine.accredited) }] : []),
];

export const maturityPdf = (rows: ENSMaturityReportRow[]): object[] => [
  { text: 'Nivel de madurez (CMM, Anexo II, apdo. 6)', style: 'h3' },
  {
    table: {
      widths: ['auto', '*'],
      body: rows.map(row => [
        { text: row.label, style: 'td', bold: true },
        { text: row.value, style: 'td' },
      ]),
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 4],
  },
  { text: ENS_MATURITY_NOTE, style: 'sub', margin: [0, 0, 0, 16] },
];
