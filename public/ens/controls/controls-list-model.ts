import type { ENSControlSummaryEntry, ENSAgentControlsRow } from '../../../common/ens/evaluation/types';
import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';
import { describePendingMeasurement, getENSCatalogControl, isPendingMeasurement } from '../../../common/ens/catalog';
import { describeLevelSource } from '../../../common/ens/core/control-level';

interface ENSListControl {
  id: string;
  title: string;
  activeLevels: string[];
}

export interface ENSMachineTally {
  compliant: number;
  partial: number;
  nonCompliant: number;
  noData: number;
  notApplicable: number;
  total: number;
}

export interface ENSControlListEntry {
  id: string;
  title: string;
  levels: string;
  measured: boolean;
  notMeasured?: ENSNotMeasuredReason;
  pendingMeasurement?: string;
  configured: boolean;
  appliesAtLevel: boolean;
  summary?: ENSControlSummaryEntry;
  machines?: ENSMachineTally;
}

interface ENSControlListOptions {
  agentId?: string;
  summaries: Map<string, ENSControlSummaryEntry>;
  agentRows?: ENSAgentControlsRow[];
  isConfigured: (controlId: string) => boolean;
  notMeasured: (controlId: string) => ENSNotMeasuredReason | undefined;
  levelOf: (controlId: string) => string;
}

export const tallyMachines = (controlId: string, agentRows: ENSAgentControlsRow[] = []): ENSMachineTally | undefined => {
  const tally: ENSMachineTally = { compliant: 0, partial: 0, nonCompliant: 0, noData: 0, notApplicable: 0, total: 0 };
  agentRows.forEach(row => {
    const entry = row.controls.find(control => control.controlId === controlId);
    if (!entry) return;
    tally.total += 1;
    if (entry.status === 'CUMPLE') tally.compliant += 1;
    else if (entry.status === 'PARCIAL') tally.partial += 1;
    else if (entry.status === 'NO_CUMPLE') tally.nonCompliant += 1;
    else if (entry.status === 'NO_APLICA') tally.notApplicable += 1;
    else tally.noData += 1;
  });
  return tally.total ? tally : undefined;
};

export const describeTally = (tally: ENSMachineTally): string =>
  [
    tally.compliant ? `${tally.compliant} ${tally.compliant === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.partial ? `${tally.partial} parcial${tally.partial === 1 ? '' : 'es'}` : '',
    tally.nonCompliant ? `${tally.nonCompliant} no ${tally.nonCompliant === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.noData ? `${tally.noData} sin datos` : '',
    tally.notApplicable ? `${tally.notApplicable} no aplica${tally.notApplicable === 1 ? '' : 'n'}` : '',
  ]
    .filter(Boolean)
    .join(' · ') + ` (de ${tally.total} activo${tally.total === 1 ? '' : 's'})`;

export const buildControlListEntries = (controls: ENSListControl[], options: ENSControlListOptions): ENSControlListEntry[] => {
  const entries = controls.map(control => {
    const catalogControl = getENSCatalogControl(control.id);
    const pendingMeasurement =
      catalogControl && isPendingMeasurement(catalogControl) ? describePendingMeasurement(catalogControl) : undefined;
    const notMeasured = options.agentId && !pendingMeasurement ? options.notMeasured(control.id) : undefined;
    return {
      id: control.id,
      title: control.title,
      levels: control.activeLevels.join(', '),
      measured: !notMeasured,
      ...(notMeasured ? { notMeasured } : {}),
      ...(pendingMeasurement ? { pendingMeasurement } : {}),
      configured: options.isConfigured(control.id),
      appliesAtLevel: control.activeLevels.includes(options.levelOf(control.id)),
      summary: notMeasured || pendingMeasurement ? undefined : options.summaries.get(control.id),
      ...(!options.agentId && options.agentRows && !pendingMeasurement ? { machines: tallyMachines(control.id, options.agentRows) } : {}),
    };
  });
  return [...entries.filter(entry => entry.measured), ...entries.filter(entry => !entry.measured)];
};

export const describeLevelExclusions = (
  entries: (Pick<ENSControlListEntry, 'id' | 'appliesAtLevel'> & Partial<Pick<ENSControlListEntry, 'pendingMeasurement'>>)[],
  globalLevel: string,
  levelOf?: (controlId: string) => string
): { count: number; ids: string[]; text: string } | undefined => {
  const ids = entries.filter(entry => !entry.appliesAtLevel && !entry.pendingMeasurement).map(entry => entry.id);
  if (!ids.length) return undefined;
  const named = ids.map(id => {
    const level = levelOf ? levelOf(id) : globalLevel;
    const source = describeLevelSource(getENSCatalogControl(id) || {});
    return level !== globalLevel && source ? `${id}: nivel aplicable ${level} por ${source}` : id;
  });
  return {
    count: ids.length,
    ids,
    text: `Nivel ${globalLevel}: ${ids.length} control${ids.length === 1 ? ' no aplica' : 'es no aplican'} (${named.join(', ')})`,
  };
};
