import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupNonConformities } from '../../common/ens/core/nonconformity-groups';

const nc = (fields: Record<string, unknown>) =>
  ({ id: 'x', evidenceId: 'EV-04', requirementId: 'op.acc.1.4', finding: '', impact: '', requiredAction: '', parameterIds: [], evidenceIds: ['EV-04'], ...fields }) as any;

describe('non-conformity groups', () => {
  test('join the machines of the same failure', () => {
    const groups = groupNonConformities([
      nc({ origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', agents: [{ agentId: '001' }] }),
      nc({ origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', agents: [{ agentId: '000' }] }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].machines.map(m => m.agentId), ['001', '000']);
    assert.equal(groups[0].kind, 'configuration');
  });

  test('put measured failures first and documentary requirements last', () => {
    const groups = groupNonConformities([
      nc({ origin: 'NO_EVIDENCIADA', cause: 'CATALOG', evidenceIds: [], requirementId: 'op.acc.1.5', agents: [] }),
      nc({ origin: 'MEDIDA', evidenceIds: ['EV-06'], requirementIds: ['op.acc.1.2', 'op.acc.1.r1.2'], agents: [{ agentId: '001' }] }),
    ]);
    assert.deepEqual(groups.map(g => g.kind), ['measure', 'documentary']);
    assert.deepEqual(groups[0].requirementIds, ['op.acc.1.2', 'op.acc.1.r1.2']);
  });
});
