import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustedLevel, validateLevelAdjustmentsShape } from '../../common/ens/configuration/levels/level-adjustments';
import type { ENSLevelAdjustment } from '../../common/ens/configuration/levels/level-adjustments';

const adjustments: ENSLevelAdjustment[] = [
  { controlId: 'op.acc.1', level: 'MEDIO', reason: 'acta 12' },
  { controlId: 'op.acc.1', agentId: '001', level: 'BAJO', reason: 'laboratorio' },
  { controlId: 'op.acc.2', level: 'ALTO', reason: 'raises' },
];

describe('level adjustments', () => {
  test('prefer the machine over the control', () => {
    assert.equal(adjustedLevel('op.acc.1', '001', 'ALTO', adjustments).level, 'BAJO');
    assert.equal(adjustedLevel('op.acc.1', '002', 'ALTO', adjustments).level, 'MEDIO');
    assert.equal(adjustedLevel('op.acc.1', undefined, 'ALTO', adjustments).level, 'MEDIO');
  });

  test('never raise the level', () => {
    assert.deepEqual(adjustedLevel('op.acc.2', '001', 'MEDIO', adjustments), { level: 'MEDIO' });
  });

  test('need a control, a level and a reason', () => {
    assert.deepEqual(validateLevelAdjustmentsShape(adjustments), []);
    assert.equal(validateLevelAdjustmentsShape([{ controlId: 'op.acc.1', level: 'BAJO' }]).length, 1);
    assert.equal(validateLevelAdjustmentsShape([{ controlId: 'op.acc.1', level: 'BÁSICO', reason: 'x' }]).length, 1);
    assert.equal(validateLevelAdjustmentsShape([adjustments[0], adjustments[0]]).length, 1);
    assert.equal(validateLevelAdjustmentsShape({}).length, 1);
  });
});

describe('editing level adjustments', () => {
  test('replaces the one for the same control and machine and keeps the rest sorted', async () => {
    const { setLevelAdjustment, removeLevelAdjustment } = await import('../../common/ens/configuration/levels/level-adjustments');
    let configuration: { levelAdjustments?: ENSLevelAdjustment[] } = {};
    configuration = setLevelAdjustment(configuration, { controlId: 'op.exp.2', level: 'MEDIO', reason: ' acta ' });
    configuration = setLevelAdjustment(configuration, { controlId: 'op.acc.1', agentId: ' 001 ', level: 'BAJO', reason: 'lab' });
    configuration = setLevelAdjustment(configuration, { controlId: 'op.exp.2', level: 'BAJO', reason: 'acta 2' });
    assert.deepEqual(configuration.levelAdjustments, [
      { controlId: 'op.acc.1', agentId: '001', level: 'BAJO', reason: 'lab' },
      { controlId: 'op.exp.2', level: 'BAJO', reason: 'acta 2' },
    ]);
    const moved = setLevelAdjustment(configuration, { controlId: 'op.acc.2', level: 'BAJO', reason: 'x' }, { controlId: 'op.exp.2', level: 'BAJO', reason: '' });
    assert.deepEqual(moved.levelAdjustments?.map(a => a.controlId), ['op.acc.1', 'op.acc.2']);
    assert.equal(removeLevelAdjustment(configuration, { controlId: 'op.acc.1', agentId: '001', level: 'BAJO', reason: '' }).levelAdjustments?.length, 1);
  });
});
