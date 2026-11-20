import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTally, sumTallies } from '../../common/ens/core/tally';
import { categoryLabel, describeApplicableLevelLabel } from '../../common/ens/core/control-level';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../../common/ens/configuration/repository';
import { buildENSResultFromVerdicts } from '../../common/ens/core/engine-verdicts';
import type { ENSEngineVerdict } from '../../common/ens/core/engine-verdicts';
import { renderEngineMessage } from '../../common/ens/catalog/engine-messages';

beforeEach(() => {
  ensConfigurationRepository.replaceActive(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
});

describe('tallies', () => {
  test('format count, percent and the level the engine set', () => {
    assert.equal(formatTally({ met: 36, total: 40, percent: 90, level: 4 }), '36/40 · 90 % · L4');
    assert.equal(formatTally({ met: 36, total: 40, percent: 90 }), '36/40 · 90 %');
  });

  test('add up over machines without inventing a level', () => {
    assert.deepEqual(sumTallies([{ met: 18, total: 20, percent: 90, level: 4 }, { met: 9, total: 20, percent: 45, level: 2 }, undefined]), { met: 27, total: 40, percent: 67 });
    assert.deepEqual(sumTallies([{ met: 36, total: 40, percent: 90, level: 4 }]), { met: 36, total: 40, percent: 90, level: 4 });
    assert.equal(sumTallies([undefined]), undefined);
  });

  test('reach an evidence result with its short title', () => {
    const verdicts = [
      { '@timestamp': '2026-11-20T10:00:00Z', control: 'mp.info.6', agent: { id: '001' }, scope: 'evidence', evidence: 'EV-01', status: 'NON_COMPLIANT', tally: { met: 36, total: 40, percent: 90, level: 4 } },
    ] as ENSEngineVerdict[];
    const evidence = buildENSResultFromVerdicts('mp.info.6', 'MEDIO', '001', verdicts, new Date()).evidences.find(e => e.id === 'EV-01');
    assert.deepEqual(evidence?.tally, { met: 36, total: 40, percent: 90, level: 4 });
    assert.ok(evidence?.title && evidence.title !== evidence.description);
  });
});

describe('configuration gaps', () => {
  test('name the machine and the parameter', () => {
    assert.equal(
      renderEngineMessage('configuration.parameter_unset', { machine: 'web01 (001)', param: 'P-03' }),
      'falta configuración en web01 (001): P-03 sin valor'
    );
  });

  test('show the configured value and where it comes from', () => {
    const text = renderEngineMessage('configuration.parameter_value', {
      machine: 'web01 (001)',
      param: 'P-03',
      value: { code: 'configuration.value', args: { value: 'svc_.*(' } },
      source: [{ code: 'configuration.source_template', args: { id: 'linux-ubuntu' } }],
      detail: { code: 'param.not_set', args: { param: 'P-03' } },
    });
    assert.match(text || '', /P-03 = «svc_\.\*\(» \(plantilla linux-ubuntu\)/);
  });
});

describe('system category', () => {
  test('is BÁSICO, MEDIO or ALTO', () => {
    assert.equal(categoryLabel('BAJO'), 'BÁSICO');
    assert.equal(categoryLabel('ALTO'), 'ALTO');
    assert.equal(describeApplicableLevelLabel({}), 'Categoría del sistema');
  });
});

describe('a requirement over several machines', () => {
  test('counts the machines where it complies', async () => {
    const { consolidateAgentComplianceResultByControl } = await import('../../common/ens/core/compliance-state/consolidation');
    const verdictsOf = (id: string, status: string) =>
      [{ '@timestamp': '2026-11-20T10:00:00Z', control: 'op.acc.1', agent: { id }, scope: 'requirement', requirement: 'op.acc.1.1', status, evidenced: true }] as ENSEngineVerdict[];
    const agents = [['001', 'COMPLIANT'], ['002', 'COMPLIANT'], ['003', 'NON_COMPLIANT']].map(([id, status]) => ({
      agentId: id,
      results: [buildENSResultFromVerdicts('op.acc.1', 'MEDIO', id, verdictsOf(id, status), new Date())],
    })) as any;

    const requirement = consolidateAgentComplianceResultByControl(agents, 'op.acc.1')?.requirements.find(r => r.id === 'op.acc.1.1');

    assert.deepEqual(requirement?.machines, { met: 2, total: 3, percent: 66 });
    assert.equal(requirement?.status, 'NO_CUMPLE');
  });
});
