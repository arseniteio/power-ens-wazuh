import type {
  ENSAgentControlsRow,
  ENSControlSummaryEntry,
  ENSEvaluationTimelinePoint,
  ENSFreshness,
  ENSOverviewNonConformity,
} from '../../../common/ens/evaluation/types';
import { ENSMachineTally, tallyMachines } from '../controls/controls-list-model';
import { classifyNonConformity, NonConformityClass } from '../controls/control-detail/nonconformity-class';
import { statusLabel as statusLabelOf } from '../../../common/ens/core/status-label';

const HOUR = 60 * 60 * 1000;
const STALE_AFTER_MS = 26 * HOUR;

interface OverviewMachine {
  agentId: string;
  agentName?: string;
  status?: string;
  isManager: boolean;
}

export const overviewMachines = (scope: { id: string; name?: string; status?: string }[]): OverviewMachine[] =>
  [...scope]
    .map(agent => ({ agentId: agent.id, agentName: agent.name, status: agent.status, isManager: agent.id === '000' }))
    .sort((a, b) => (a.isManager === b.isManager ? a.agentId.localeCompare(b.agentId) : a.isManager ? 1 : -1));

export const machineLabel = (m: Pick<OverviewMachine, 'agentId' | 'agentName'>) => (m.agentName ? `${m.agentId} · ${m.agentName}` : m.agentId);

export const describeAge = (iso: string | undefined, nowMs: number): string => {
  if (!iso) return 'nunca';
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < HOUR) return `hace ${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < 48 * HOUR) return `hace ${Math.round(ms / HOUR)} h`;
  return `hace ${Math.round(ms / (24 * HOUR))} d`;
};

export type MatrixCell =
  | { kind: 'result'; status: string; score?: number; notMet: number; notEvidenced: number }
  | { kind: 'manager' }
  | { kind: 'not-measured'; reason?: string }
  | { kind: 'pending' };

export interface MatrixRow {
  controlId: string;
  title: string;
  overall?: ENSControlSummaryEntry;
  cells: Record<string, MatrixCell>;
  tally?: ENSMachineTally;
  pending?: boolean;
  pendingMeasurement?: string;
}

interface MatrixOptions {
  isManagerOnly: (controlId: string) => boolean;
  notMeasuredReason: (controlId: string, agentId: string) => string | undefined;
  pendingMeasurement?: (controlId: string) => string | undefined;
}

export const buildMatrix = (
  controls: { id: string; title: string }[],
  machines: OverviewMachine[],
  overall: ENSControlSummaryEntry[],
  agentRows: ENSAgentControlsRow[],
  options: MatrixOptions
): MatrixRow[] =>
  controls.map(control => {
    const cells: Record<string, MatrixCell> = {};
    const general = overall.find(entry => entry.controlId === control.id);
    const pendingMeasurement = options.pendingMeasurement?.(control.id);
    if (pendingMeasurement) {
      machines.forEach(machine => {
        cells[machine.agentId] = { kind: 'not-measured', reason: pendingMeasurement };
      });
      return { controlId: control.id, title: control.title, overall: general, cells, pendingMeasurement };
    }
    const pending = Boolean(general?.pending);
    machines.forEach(machine => {
      const rowData = agentRows.find(row => row.agentId === machine.agentId);
      const entry = rowData?.controls.find(c => c.controlId === control.id);
      if (pending) {
        cells[machine.agentId] = !machine.isManager && options.isManagerOnly(control.id) ? { kind: 'manager' } : { kind: 'pending' };
      } else if (entry) {
        cells[machine.agentId] = {
          kind: 'result',
          status: entry.status,
          score: entry.score,
          notMet: entry.requirementsNotMet,
          notEvidenced: entry.requirementsNotEvidenced,
        };
      } else if (!machine.isManager && options.isManagerOnly(control.id)) {
        cells[machine.agentId] = { kind: 'manager' };
      } else {
        cells[machine.agentId] = { kind: 'not-measured', reason: options.notMeasuredReason(control.id, machine.agentId) };
      }
    });
    return {
      controlId: control.id,
      title: control.title,
      overall: general,
      cells,
      tally: pending ? undefined : tallyMachines(control.id, agentRows),
      ...(pending ? { pending: true } : {}),
    };
  });

export const describeOverviewPending = (
  pending: { rows: number; controls: string[]; total: number } | undefined
): { title: string; text: string; controls: string[] } | undefined =>
  pending
    ? {
        title: `Calculando la evaluación: ${pending.total - pending.rows} de ${pending.total} filas (control × activo) listas`,
        text:
          `Faltan ${pending.controls.length} control${pending.controls.length === 1 ? '' : 'es'} (${pending.controls.join(', ')}). ` +
          'Calculando el resto de controles…',
        controls: pending.controls,
      }
    : undefined;

type FreshnessCell =
  | { kind: 'fresh' | 'stale'; newest: string; count: number }
  | { kind: 'never'; count: 0 }
  | { kind: 'not-expected' };

export const freshnessCell = (
  freshness: Pick<ENSFreshness, 'cells'>,
  controlId: string,
  agentId: string,
  expected: boolean,
  nowMs: number
): FreshnessCell => {
  if (!expected) return { kind: 'not-expected' };
  const cell = freshness.cells.find(c => c.controlId === controlId && c.agentId === agentId);
  if (!cell || !cell.newest || !cell.count) return { kind: 'never', count: 0 };
  return { kind: nowMs - Date.parse(cell.newest) > STALE_AFTER_MS ? 'stale' : 'fresh', newest: cell.newest, count: cell.count };
};

const SEVERITY_RANK: Record<string, number> = { NO_CUMPLE: 0, PARCIAL: 1, NO_EVALUABLE: 2, CUMPLE: 3, NO_APLICA: 4 };

export interface MachineSummary {
  agentId: string;
  agentName?: string;
  status?: string;
  isManager: boolean;
  measured: number;
  counts: Record<'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE' | 'NO_EVALUABLE' | 'NO_APLICA', number>;
  notMet: number;
  notEvidenced: number;
  newest?: string;
  stale: boolean;
  worst: { controlId: string; status: string; score?: number }[];
}

export const buildMachineSummaries = (
  machines: OverviewMachine[],
  agentRows: ENSAgentControlsRow[],
  freshness: Pick<ENSFreshness, 'agents'>,
  nowMs: number
): MachineSummary[] =>
  machines.map(machine => {
    const controls = agentRows.find(row => row.agentId === machine.agentId)?.controls || [];
    const counts = { CUMPLE: 0, PARCIAL: 0, NO_CUMPLE: 0, NO_EVALUABLE: 0, NO_APLICA: 0 };
    controls.forEach(c => {
      const key = (c.status in counts ? c.status : 'NO_EVALUABLE') as keyof typeof counts;
      counts[key] += 1;
    });
    const fresh = freshness.agents.find(a => a.agentId === machine.agentId);
    return {
      ...machine,
      measured: controls.length,
      counts,
      notMet: controls.reduce((n, c) => n + (c.requirementsNotMet || 0), 0),
      notEvidenced: controls.reduce((n, c) => n + (c.requirementsNotEvidenced || 0), 0),
      newest: fresh?.newest,
      stale: !fresh?.newest || nowMs - Date.parse(fresh.newest) > STALE_AFTER_MS,
      worst: controls
        .filter(c => c.status !== 'CUMPLE' && c.status !== 'NO_APLICA')
        .sort(
          (a, b) =>
            (SEVERITY_RANK[a.status] ?? 2) - (SEVERITY_RANK[b.status] ?? 2) ||
            (a.score ?? 0) - (b.score ?? 0) ||
            (b.requirementsNotMet || 0) - (a.requirementsNotMet || 0) ||
            a.controlId.localeCompare(b.controlId)
        )
        .slice(0, 3)
        .map(c => ({ controlId: c.controlId, status: c.status, score: c.score })),
    };
  });

interface WorkItem {
  controlId: string;
  nc: ENSOverviewNonConformity;
  title: string;
  evidenceId?: string;
  status?: string;
  machines: string;
}

interface WorkGroup {
  owner: string;
  classification: NonConformityClass;
  items: WorkItem[];
  controls: number;
}

const describeMachines = (agentIds: string[], nameOf: (agentId: string) => string | undefined) =>
  !agentIds.length
    ? 'todos los activos'
    : agentIds.length <= 3
    ? agentIds.map(id => (nameOf(id) ? `${nameOf(id)} (${id})` : id)).join(', ')
    : `${agentIds.length} activos`;

export const buildWorkQueue = (
  ncs: ENSOverviewNonConformity[],
  agentId?: string,
  isConfigured: (controlId: string) => boolean = () => true,
  nameOf: (agentId: string) => string | undefined = () => undefined
): WorkGroup[] => {
  const groups = new Map<string, WorkGroup>();
  ncs
    .filter(nc => !agentId || !nc.agentIds.length || nc.agentIds.includes(agentId))
    .forEach(nc => {
      const kind = classifyNonConformity(nc, { controlConfigured: isConfigured(nc.controlId) });
      const group = groups.get(kind.owner) || { owner: kind.owner, classification: kind, items: [], controls: 0 };
      group.items.push({
        controlId: nc.controlId,
        nc,
        title: nc.title,
        ...(nc.titleEvidenceId ? { evidenceId: nc.titleEvidenceId, status: nc.titleStatus } : {}),
        machines: describeMachines(nc.agentIds, nameOf),
      });
      groups.set(kind.owner, group);
    });
  return Array.from(groups.values())
    .map(g => ({ ...g, controls: new Set(g.items.map(i => i.controlId)).size }))
    .sort((a, b) => a.classification.order - b.classification.order);
};

interface TrendControlRow {
  controlId: string;
  cells: { date: string; label: string; status?: string; score?: number }[];
  changed: boolean;
  first?: string;
  last?: string;
}

export const buildTrend = (timeline: ENSEvaluationTimelinePoint[] = [], controlIds: string[]) => {
  const points = timeline.map(p => ({ date: p.date, label: p.label, score: p.score, isCurrent: p.isCurrent }));
  const rows: TrendControlRow[] = controlIds.map(controlId => {
    const cells = timeline.map(p => ({ date: p.date, label: p.label, ...(p.controls?.[controlId] || {}) }));
    const statuses = cells.map(c => c.status).filter(Boolean) as string[];
    return {
      controlId,
      cells,
      changed: new Set(statuses).size > 1,
      first: statuses[0],
      last: statuses[statuses.length - 1],
    };
  });
  const withValue = points.filter(p => typeof p.score === 'number') as { score: number }[];
  return {
    points,
    rows,
    delta: withValue.length > 1 ? withValue[withValue.length - 1].score - withValue[0].score : undefined,
    hasControls: timeline.some(p => p.controls && Object.keys(p.controls).length > 0),
  };
};

export type FleetFilter = 'all' | 'ok' | 'failing' | 'stale';

const failing = (m: MachineSummary) => m.counts.NO_CUMPLE + m.counts.PARCIAL > 0;

export const fleetFigures = (machines: MachineSummary[]) => ({
  all: machines.length,
  ok: machines.filter(m => m.measured > 0 && !failing(m) && m.counts.NO_EVALUABLE === 0).length,
  failing: machines.filter(failing).length,
  stale: machines.filter(m => m.stale).length,
});

export const inFleetFilter = (m: MachineSummary, filter: FleetFilter) =>
  filter === 'ok'
    ? m.measured > 0 && !failing(m) && m.counts.NO_EVALUABLE === 0
    : filter === 'failing'
    ? failing(m)
    : filter === 'stale'
    ? m.stale
    : true;

export const CONTROL_BAR_STATUSES = ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'] as const;

export const controlBar = (row: Pick<MatrixRow, 'cells'>): Record<string, string[]> => {
  const out: Record<string, string[]> = Object.fromEntries(CONTROL_BAR_STATUSES.map(s => [s, [] as string[]]));
  Object.entries(row.cells).forEach(([agentId, cell]) => {
    if (cell.kind !== 'result') return;
    (out[cell.status] || out.NO_EVALUABLE).push(agentId);
  });
  return out;
};

const csvField = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const matrixCsv = (rows: Pick<MatrixRow, 'controlId' | 'cells'>[], machines: OverviewMachine[]): string => {
  const header = ['agente', 'nombre', ...rows.map(r => r.controlId)];
  const lines = machines.map(m => [
    m.agentId,
    m.agentName || '',
    ...rows.map(r => {
      const cell = r.cells[m.agentId];
      if (!cell || cell.kind === 'pending') return '';
      if (cell.kind === 'manager') return 'manager';
      if (cell.kind === 'not-measured') return 'no se mide';
      return typeof cell.score === 'number' ? `${statusLabelOf(cell.status)} ${cell.score}%` : statusLabelOf(cell.status);
    }),
  ]);
  return [header, ...lines].map(l => l.map(csvField).join(',')).join('\n');
};
