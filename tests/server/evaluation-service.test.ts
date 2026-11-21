import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ENS_CONFIGURATION_INDEX, ENS_VERDICTS_INDEX } from '../../common/constants';
import { ENGINE_CATALOG } from '../../common/ens/catalog/engine-catalog';
import { normalizeQuery, smallest } from '../../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../../server/lib/evaluation/responses';
import { activeConfiguration, AGENT, createClock, createLab, enginePass, inventoryDoc, MANAGER, waitUntil } from '../support/lab';

const control = (controlId: string) => ({ include: 'control' as const, controlId, timeZone: 'UTC' });

const labWithOnePass = () => {
  const clock = createClock();
  const docs = [
    activeConfiguration(),
    inventoryDoc(AGENT, clock),
    inventoryDoc(MANAGER, clock),
    ...enginePass({
      at: clock.hoursAgo(26),
      status: 'COMPLIANT',
      score: 100,
    }),
    ...enginePass({
      at: clock.hoursAgo(2),
      status: 'PARTIAL',
      score: 75,
      requirements: [{ requirement: 'op.acc.1.2', status: 'NON_COMPLIANT' }],
      evidences: [{ evidence: 'EV-06', status: 'NON_COMPLIANT', reason: 'ubuntu (sudo)' }],
    }),
    ...enginePass({ machine: MANAGER, at: clock.hoursAgo(2), status: 'COMPLIANT', score: 100 }),
  ];
  return { clock, ...createLab(docs, clock) };
};

describe('the evaluation of a control on a machine', () => {
  test('is the engine latest pass', async () => {
    const { clients, service } = labWithOnePass();
    const run = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    const result = run.views.get('op.acc.1')?.result;
    assert.equal(result?.status, 'PARCIAL');
    assert.equal(result?.score, 75);
    assert.equal(result?.requirements.find(r => r.id === 'op.acc.1.2')?.status, 'NO_CUMPLE');
  });

  test('keeps each machine apart', async () => {
    const { clients, service } = labWithOnePass();
    const run = await service.run(clients, { ...control('op.acc.1'), agentId: MANAGER.id });
    assert.equal(run.views.get('op.acc.1')?.result?.status, 'CUMPLE');
  });

  test('draws one series point per day with a verdict', async () => {
    const { clients, service } = labWithOnePass();
    const run = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id, timelineDays: 7 });
    const points = run.timeline || [];
    assert.equal(points[points.length - 1].isCurrent, true);
    assert.equal(points[points.length - 1].score, 75);
    assert.ok(points.some(point => !point.isCurrent && point.score === 100 && point.events === 1));
  });

  test('is not read again until the engine writes a new pass', async () => {
    const { clients, service, index } = labWithOnePass();
    await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    const reads = index.log.length;
    const again = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    assert.equal(again.meta.stats.computed, 0);
    assert.ok(!index.log.slice(reads).some(entry => entry.index === ENS_VERDICTS_INDEX && entry.body?.size > 0));
  });

  test('follows a new pass, showing the old one while it refreshes', async () => {
    const { clients, service, index, clock } = labWithOnePass();
    await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    clock.advance(1);
    index.docs.push(...enginePass({ at: clock.hoursAgo(0.5), status: 'COMPLIANT', score: 100 }));
    const stale = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id }, { allowStale: true });
    assert.equal(stale.meta.refreshing, true);
    assert.equal(stale.views.get('op.acc.1')?.result?.score, 75);
    await waitUntil(() => service.idle());
    const fresh = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    assert.equal(fresh.views.get('op.acc.1')?.result?.score, 100);
  });

  test('shows the values of the template of its inventory type, saved or not', async () => {
    const clock = createClock();
    const docs = [activeConfiguration(), inventoryDoc(AGENT, clock, ['ens'], 'ubuntu'), ...enginePass({ at: clock.hoursAgo(1), status: 'COMPLIANT', score: 100 })];
    const { clients, service } = createLab(docs, clock);
    const run = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    assert.equal(run.views.get('op.acc.1')?.result?.parameters.find(p => p.id === 'P-10')?.value, 1000);
  });

  test('refuses a machine out of the ENS scope', async () => {
    const { clients, service } = labWithOnePass();
    await assert.rejects(service.run(clients, { ...control('op.acc.1'), agentId: '042' }), { statusCode: 400 });
  });
});

describe('the evaluation of the whole scope', () => {
  test('consolidates every machine of a control', async () => {
    const { clients, service } = labWithOnePass();
    const run = await service.run(clients, control('op.acc.1'));
    const view = run.views.get('op.acc.1');
    assert.equal(view?.rows.length, 2);
    assert.equal(view?.result?.status, 'CUMPLE');
  });

  test('builds the summary with every catalog control', async () => {
    const { clients, service } = labWithOnePass();
    const run = await service.run(clients, { include: 'summary', timeZone: 'UTC' });
    const response: any = buildEvaluationResponse(run);
    assert.equal(response.controls.length, ENGINE_CATALOG.length);
    assert.equal(response.controls.find((c: any) => c.controlId === 'op.acc.1').status, 'CUMPLE');
    assert.deepEqual(response.agents.map((a: any) => a.agentId).sort(), [MANAGER.id, AGENT.id]);
  });

  test('tells in the overview when the engine last judged each machine', async () => {
    const { clients, service, clock } = labWithOnePass();
    const run = await service.run(clients, { include: 'overview', timeZone: 'UTC' });
    const response: any = buildEvaluationResponse(run);
    const agent = response.freshness.agents.find((a: any) => a.agentId === AGENT.id);
    assert.equal(agent.newest, clock.hoursAgo(2));
    assert.ok(response.nonConformities.some((nc: any) => nc.controlId === 'op.acc.1' && nc.agentIds.includes(AGENT.id)));
  });

  test('answers with what is ready and marks the rest pending', async () => {
    const clock = createClock();
    const docs = [activeConfiguration(), inventoryDoc(AGENT, clock), ...enginePass({ at: clock.hoursAgo(1), status: 'COMPLIANT', score: 100 })];
    const { clients, service } = createLab(docs, clock, { firstResponseMs: 0 }, 30);
    const first = await service.run(clients, { include: 'summary', timeZone: 'UTC' });
    assert.deepEqual(first.meta.pending?.controls, ['op.acc.1']);
    assert.match(first.meta.fingerprint, /^refreshing:/);
    await waitUntil(() => service.idle());
    const second = await service.run(clients, { include: 'summary', timeZone: 'UTC' });
    assert.equal(second.meta.pending, undefined);
  });

  test('changes its fingerprint only with a new pass', async () => {
    const { clients, service, index, clock } = labWithOnePass();
    const query = normalizeQuery({ include: 'summary' });
    const before = service.viewFingerprint(await service.loadContext(clients, query), query);
    clock.advance(2);
    index.docs.push(...enginePass({ machine: MANAGER, at: clock.hoursAgo(0.1), status: 'COMPLIANT', score: 100 }));
    const after = service.viewFingerprint(await service.loadContext(clients, query), query);
    assert.notEqual(before, after);
  });
});

describe('a request', () => {
  test('defaults to the summary in UTC', () => {
    assert.deepEqual(normalizeQuery({}), { agentId: undefined, controlId: undefined, include: 'summary', timelineDays: 0, timeZone: 'UTC' });
  });

  test('pads a numeric machine id', () => {
    assert.equal(normalizeQuery({ agentId: '1' }).agentId, '001');
  });

  test('rejects what the server cannot answer', () => {
    assert.throws(() => normalizeQuery({ controlId: 'op.zzz.9' }), { statusCode: 400 });
    assert.throws(() => normalizeQuery({ timeZone: 'Mars/Olympus' }), { statusCode: 400 });
    assert.throws(() => normalizeQuery({ include: 'overview', controlId: 'op.acc.1' }), { statusCode: 400 });
    assert.throws(() => normalizeQuery({ timelineDays: '1000' }), { statusCode: 400 });
  });
});

describe('a deployment where nobody saved the configuration yet', () => {
  test('is judged with the default configuration', async () => {
    const clock = createClock();
    const docs = [inventoryDoc(AGENT, clock), ...enginePass({ at: clock.hoursAgo(2), status: 'COMPLIANT', score: 100 })];
    const { clients, service } = createLab(docs, clock, {}, 0, [ENS_CONFIGURATION_INDEX]);
    const run = await service.run(clients, { ...control('op.acc.1'), agentId: AGENT.id });
    assert.equal(run.views.get('op.acc.1')?.result?.status, 'CUMPLE');
  });
});

describe('a large deployment', () => {
  test('finds the oldest stamp among hundreds of thousands of rows', () => {
    const stamps = Array.from({ length: 300000 }, (_value, index) => 1_800_000_000_000 - index);
    assert.equal(smallest(stamps), 1_800_000_000_000 - 299999);
  });
});
