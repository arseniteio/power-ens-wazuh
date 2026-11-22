import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationDocumentId, describeSystemScopeIssue, machinesOfSystem, sharedScopeGroups } from '../../common/ens/systems';
import type { ENSSystemScope } from '../../common/ens/systems';

const agent = (id: string, ...groups: string[]) => ({ id, groups });

const inventory = [agent('000'), agent('001', 'ens'), agent('002', 'ens', 'pilot'), agent('003', 'ens'), agent('004', 'pilot')];

const systems: ENSSystemScope[] = [
  { id: 'default', name: 'Sistema principal', scope: { mode: 'global', groupIds: [], agentIds: [] } },
  { id: 'lab', name: 'Laboratorio', scope: { mode: 'agent', groupIds: [], agentIds: ['003', '004'] } },
  { id: 'pilot', name: 'Piloto', scope: { mode: 'group', groupIds: ['pilot'], agentIds: [] } },
];

const ids = (system: string) => machinesOfSystem(system, inventory, inventory, systems).map(a => a.id);

describe('the machines of an ENS system', () => {
  test('gives each machine one system, the manager to all, and none to a machine two systems claim', () => {
    assert.deepEqual(ids('default'), ['000', '001']);
    assert.deepEqual(ids('pilot'), ['000', '002']);
    assert.deepEqual(ids('lab'), ['000', '003']);
  });

  test('ignores a system whose scope would take every machine', () => {
    const wide = [...systems, { id: 'wide', name: 'Todo', scope: { mode: 'global' as const, groupIds: [], agentIds: [] } }];
    assert.deepEqual(machinesOfSystem('default', inventory, inventory, wide).map(a => a.id), ['000', '001']);
  });
});

describe('the scope of an ENS system', () => {
  test('must name groups or machines, except in the default system', () => {
    assert.equal(describeSystemScopeIssue('default', { mode: 'global' }), undefined);
    assert.ok(describeSystemScopeIssue('pilot', { mode: 'global' }));
    assert.equal(describeSystemScopeIssue('pilot', { mode: 'group' }), undefined);
  });

  test('cannot share a group with another system', () => {
    assert.deepEqual(sharedScopeGroups('lab', { mode: 'group', groupIds: ['Pilot', 'lab'], agentIds: [] }, systems), ['pilot']);
    assert.deepEqual(sharedScopeGroups('pilot', systems[2].scope, systems), []);
  });

  test('keeps the document of the default system where it was', () => {
    assert.equal(configurationDocumentId('default'), 'active');
    assert.equal(configurationDocumentId('pilot'), 'system-pilot');
  });
});
