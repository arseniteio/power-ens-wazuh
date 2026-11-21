import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import table from '../../common/ens/catalog/maturity.json';
import { CCN_SCALE, judgeCompliance } from '../../common/ens/maturity/compliance-level';

const STATUS: Record<string, string> = { COMPLIANT: 'CUMPLE', PARTIAL: 'PARCIAL', NON_COMPLIANT: 'NO_CUMPLE' };

describe('the CMM compliance rule', () => {
  test('matches the engine on every shared case', () => {
    for (const c of table.cases as { percent: number; level: string; scale?: number[]; expectLevel: number; expectStatus: string }[]) {
      const got = judgeCompliance(c.percent, c.level, c.scale || CCN_SCALE);
      assert.equal(got?.level, c.expectLevel, `${c.percent} % at ${c.level}`);
      assert.equal(got?.status, STATUS[c.expectStatus], `${c.percent} % at ${c.level}`);
    }
  });

  test('uses the CCN table by default', () => {
    assert.deepEqual(CCN_SCALE, [10, 50, 80, 90, 100]);
  });
});
