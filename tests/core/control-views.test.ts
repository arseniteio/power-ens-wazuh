import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleState, consolidateRows, resultStatusStub } from '../../common/ens/core/control-views';

const row = (agentId: string, status: string, score?: number) => ({ agentId, agentName: `host-${agentId}`, result: resultStatusStub('op.acc.1', status, score) });

describe('a control seen over several machines', () => {
  test('has no result without machines', () => {
    assert.equal(consolidateRows('op.acc.1', []), undefined);
  });

  test('judges the fleet by the CMM level of its average score', () => {
    const half = consolidateRows('op.acc.1', [row('001', 'CUMPLE', 100), row('002', 'NO_CUMPLE', 0)]);
    assert.equal(half?.score, 50);
    assert.equal(half?.compliance?.level, 2);
    assert.equal(half?.status, 'PARCIAL');
  });

  test('complies when 9 of 10 machines do: one machine does not sink the fleet', () => {
    const rows = Array.from({ length: 10 }, (_, i) => (i === 9 ? row('010', 'NO_CUMPLE', 0) : row(`00${i}`, 'CUMPLE', 100)));
    const consolidated = consolidateRows('op.acc.1', rows);
    assert.equal(consolidated?.score, 90);
    assert.equal(consolidated?.status, 'CUMPLE');
    assert.deepEqual(consolidated?.compliance && { level: consolidated.compliance.level, required: consolidated.compliance.required }, { level: 4, required: 3 });
    assert.equal(consolidated?.machineResults?.filter(machine => machine.status !== 'CUMPLE').length, 1);
  });

  test('names the machines it summarises', () => {
    const consolidated = consolidateRows('op.acc.1', [row('001', 'CUMPLE', 100), row('002', 'CUMPLE', 100)]);
    assert.deepEqual(consolidated?.consolidatedAgents?.map(agent => agent.agentId), ['001', '002']);
  });
});

describe('the panel state', () => {
  test('gives each scope machine the results of its rows, in catalog order', () => {
    const state = assembleState(
      [
        { controlId: 'op.acc.2', result: resultStatusStub('op.acc.2', 'CUMPLE', 100), rows: [{ agentId: '001', result: resultStatusStub('op.acc.2', 'CUMPLE', 100) }] },
        { controlId: 'op.acc.1', result: resultStatusStub('op.acc.1', 'NO_CUMPLE', 0), rows: [{ agentId: '001', result: resultStatusStub('op.acc.1', 'NO_CUMPLE', 0) }] },
      ],
      [{ id: '001', name: 'lab-agent-01', groups: [] } as any, { id: '002', name: 'idle', groups: [] } as any]
    );
    assert.deepEqual(state.results.map(result => result.control.id), ['op.acc.1', 'op.acc.2']);
    assert.deepEqual(state.agents?.find(agent => agent.agentId === '001')?.results.map(result => result.control.id), ['op.acc.1', 'op.acc.2']);
    assert.equal(state.agents?.find(agent => agent.agentId === '002')?.results.length, 0);
    assert.equal(state.controlSummary.totalControls, 2);
  });
});
