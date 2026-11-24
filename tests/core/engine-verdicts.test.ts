import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../common/ens/configuration/repository';
import { buildENSResultFromVerdicts, verdictSeriesPoints } from '../../common/ens/core/engine-verdicts';
import type { ENSEngineVerdict } from '../../common/ens/core/engine-verdicts';

const NOW = new Date('2026-10-17T12:00:00Z');
const AT = '2026-10-17T11:00:00Z';
const agent = { id: '001', name: 'lab-agent-01' };

const verdict = (fields: Partial<ENSEngineVerdict>): ENSEngineVerdict =>
  ({ '@timestamp': AT, control: 'op.acc.1', agent, status: 'COMPLIANT', scope: 'evidence', ...fields } as ENSEngineVerdict);

const result = (verdicts: ENSEngineVerdict[]) => buildENSResultFromVerdicts('op.acc.1', 'MEDIO', '001', verdicts, NOW);

beforeEach(() => {
  ensConfigurationRepository.replaceActive(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
});

describe('a result built from engine verdicts', () => {
  test('takes status, score and coverage from the control verdict', () => {
    const built = result([verdict({ scope: 'control', status: 'PARTIAL', score: 75, coverage: 50 })]);
    assert.equal(built.status, 'PARCIAL');
    assert.equal(built.score, 75);
    assert.equal(built.coverage, 50);
    assert.equal(built.evaluatedAt, AT);
  });

  test('is NO_CUMPLE with score 0 when the engine has no verdict yet', () => {
    const built = result([]);
    assert.equal(built.status, 'NO_CUMPLE');
    assert.equal(built.score, 0);
    assert.equal(built.observations[0], 'Sin veredicto del motor para este activo.');
  });

  test('gives each requirement its verdict', () => {
    const built = result([
      verdict({ scope: 'requirement', requirement: 'op.acc.1.1', status: 'COMPLIANT', evidenced: true }),
      verdict({ scope: 'requirement', requirement: 'op.acc.1.2', status: 'NON_COMPLIANT', evidenced: true }),
    ]);
    assert.equal(built.requirements.find(r => r.id === 'op.acc.1.1')?.status, 'CUMPLE');
    assert.equal(built.requirements.find(r => r.id === 'op.acc.1.2')?.status, 'NO_CUMPLE');
  });

  test('marks a requirement of a higher level as not applicable', () => {
    const built = buildENSResultFromVerdicts('op.acc.1', 'BAJO', '001', [], NOW);
    assert.equal(built.requirements.find(r => r.id === 'op.acc.1.r1.1')?.status, 'NO_APLICA');
  });

  test('shows a coded reason in Spanish and an uncoded one as the engine wrote it', () => {
    const built = result([
      verdict({ evidence: 'EV-01', status: 'NOT_APPLICABLE', reason: 'op.acc.1 is disabled', reason_code: 'evidence.control_disabled', reason_args: { control: 'op.acc.1' } }),
      verdict({ evidence: 'EV-02', reason: 'plain text' }),
    ]);
    assert.equal(built.evidences.find(e => e.id === 'EV-01')?.observations[0], 'op.acc.1 está desactivado en la configuración');
    assert.equal(built.evidences.find(e => e.id === 'EV-02')?.observations[0], 'plain text');
  });

  test('opens a measured non-conformity on the evidence that failed', () => {
    const built = result([
      verdict({ scope: 'requirement', requirement: 'op.acc.1.2', status: 'NON_COMPLIANT', evidenced: true }),
      verdict({ evidence: 'EV-06', status: 'NON_COMPLIANT', reason: 'ubuntu (sudo)' }),
    ]);
    const finding = built.nonConformities.find(nc => nc.requirementId === 'op.acc.1.2');
    assert.equal(finding?.origin, 'MEDIDA');
    assert.deepEqual(finding?.evidenceIds, ['EV-06']);
    assert.match(finding?.finding || '', /EV-06: ubuntu \(sudo\)/);
  });

  test('opens a configuration gap naming the missing parameter', () => {
    const built = result([
      verdict({ scope: 'requirement', requirement: 'op.acc.1.r1.3', status: 'NON_COMPLIANT', evidenced: false }),
      verdict({ evidence: 'EV-07', status: 'NOT_EVALUABLE', cause: 'CONFIGURATION', reason: 'P-07: not set' }),
    ]);
    const gap = built.nonConformities.find(nc => nc.requirementId === 'op.acc.1.r1.3');
    assert.equal(gap?.origin, 'NO_EVIDENCIADA');
    assert.equal(gap?.cause, 'CONFIGURATION');
    assert.deepEqual(gap?.parameterIds, ['P-07']);
  });

  test('traces every evidence verdict with its machine and time', () => {
    const built = result([verdict({ evidence: 'EV-03', reason: 'ok' })]);
    const trace = built.traceability.find(entry => entry.evidenceId === 'EV-03');
    assert.equal(trace?.agentId, '001');
    assert.equal(trace?.timestamp, AT);
  });
});

describe('the daily series of a control', () => {
  const dayEnd = (day: number) => new Date(Date.UTC(2026, 9, day, 23, 59, 59, 999));

  test('takes the last control verdict of each day', () => {
    const points = verdictSeriesPoints([dayEnd(15)], [
      verdict({ scope: 'control', '@timestamp': '2026-10-15T08:00:00Z', status: 'NON_COMPLIANT', score: 10 }),
      verdict({ scope: 'control', '@timestamp': '2026-10-15T20:00:00Z', status: 'COMPLIANT', score: 100 }),
    ]);
    assert.deepEqual(points[dayEnd(15).toISOString()], { status: 'CUMPLE', score: 100 });
  });

  test('has no point on a day without verdicts', () => {
    const points = verdictSeriesPoints([dayEnd(14), dayEnd(15)], [verdict({ scope: 'control', '@timestamp': '2026-10-15T08:00:00Z' })]);
    assert.equal(points[dayEnd(14).toISOString()], undefined);
    assert.ok(points[dayEnd(15).toISOString()]);
  });
});

describe('a non-conformity of one machine', () => {
  test('names that machine', () => {
    const built = result([
      verdict({ evidence: 'EV-05', status: 'NOT_EVALUABLE', cause: 'CONFIGURATION', reason: 'configuration missing on lab-agent-01 (001): P-03 has no value' }),
      verdict({ scope: 'requirement', requirement: 'op.acc.1.2', status: 'NON_COMPLIANT', evidenced: false }),
    ]);
    const card = built.nonConformities.find(nc => nc.requirementId === 'op.acc.1.2');
    assert.deepEqual(card?.agents, [{ agentId: '001', agentName: 'lab-agent-01' }]);
    assert.deepEqual(card?.parameterIds, ['P-03']);
  });
});

describe('non-conformities', () => {
  test('come once per failed evidence with every requirement it breaks', () => {
    const built = result([
      verdict({ evidence: 'EV-01', status: 'NON_COMPLIANT', reason: 'UID 1001 compartido' }),
      verdict({ scope: 'requirement', requirement: 'op.acc.1.3', status: 'NON_COMPLIANT', evidenced: true }),
      verdict({ scope: 'requirement', requirement: 'op.acc.1.4', status: 'NON_COMPLIANT', evidenced: true }),
    ]);
    const cards = built.nonConformities.filter(nc => nc.origin === 'MEDIDA' && nc.evidenceIds.includes('EV-01'));
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0].requirementIds, ['op.acc.1.3', 'op.acc.1.4']);
    assert.equal(cards[0].finding, 'EV-01: UID 1001 compartido');
  });
});
