import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ENS_CONFIGURATION_INDEX } from '../../common/constants';
import { createConfigurationHandlers } from '../../server/lib/configuration-handlers';
import { createFakeIndexer } from '../support/fake-indexer';
import type { FakeDoc } from '../support/fake-indexer';

const ADMIN = { user_name: 'dioni', roles: ['power_ens_admin'] };

const silentLogger: any = { info: () => {}, warn: () => {}, error: () => {} };

const response: any = {
  ok: ({ body }: any) => ({ status: 200, data: body?.data ?? body }),
  customError: ({ statusCode, body }: any) => ({ status: statusCode, message: body.message }),
};

const activeDoc = (configuration: Record<string, unknown>): FakeDoc => ({
  _id: 'active',
  _index: ENS_CONFIGURATION_INDEX,
  _source: { documentType: 'ACTIVE_CONFIGURATION', configuration },
});

const production = {
  global: { ensLevel: 'MEDIO' },
  scope: { mode: 'group', groupIds: ['ens'], agentIds: [] },
  controls: [],
  agents: { '001': { controls: {} } },
  maturity: { assessments: [{ measure: 'op.acc.1' }] },
};

const createLab = (docs: FakeDoc[] = [activeDoc(production)]) => {
  const fake = createFakeIndexer(docs, { user: ADMIN });
  const client: any = {
    ...fake,
    bulk: async ({ body }: any) => {
      const lines = String(body).trim().split('\n').map(line => JSON.parse(line));
      const items: any[] = [];
      for (let i = 0; i < lines.length; i += 2) {
        const [kind, meta] = Object.entries<any>(lines[i])[0];
        const existing = fake.docs.findIndex(doc => doc._id === meta._id);
        if (kind === 'create' && existing >= 0) {
          items.push({ create: { status: 409, error: { type: 'version_conflict_engine_exception' } } });
          continue;
        }
        if (existing >= 0) fake.docs.splice(existing, 1);
        fake.docs.push({ _id: meta._id, _index: meta._index, _source: lines[i + 1] });
        items.push({ [kind]: { status: 201, _seq_no: 1, _primary_term: 1 } });
      }
      return { body: { errors: items.some(item => Object.values<any>(item)[0].error), items } };
    },
    delete: async ({ id }: any) => {
      const existing = fake.docs.findIndex(doc => doc._id === id);
      if (existing < 0) return { body: { result: 'not_found' } };
      fake.docs.splice(existing, 1);
      return { body: { result: 'deleted' } };
    },
  };
  const context = { core: { opensearch: { client: { asInternalUser: client, asCurrentUser: client } } } };
  return { fake, context, handlers: createConfigurationHandlers({ logger: silentLogger, securityEnabled: true }) };
};

const configurationOf = (lab: ReturnType<typeof createLab>, id: string) => lab.fake.docs.find(doc => doc._id === id)?._source;

describe('ENS systems', () => {
  test('lists the default system even before one is saved', async () => {
    const lab = createLab([]);
    const answer = await lab.handlers.systems(lab.context, {}, response);
    assert.deepEqual(answer.data, [{ id: 'default', name: 'Sistema principal' }]);
  });

  test('creates a system from the default one without its machines, maturity or scope', async () => {
    const lab = createLab();

    const created = await lab.handlers.createSystem(lab.context, { body: { id: 'pilot', name: 'Piloto' } }, response);

    assert.equal(created.status, 200);
    const stored = configurationOf(lab, 'system-pilot');
    assert.equal(stored.documentType, 'SYSTEM_CONFIGURATION');
    assert.deepEqual(stored.system, { id: 'pilot', name: 'Piloto' });
    assert.deepEqual(stored.configuration.scope, { mode: 'group', groupIds: [], agentIds: [], controlGroups: false });
    assert.equal(stored.configuration.global.ensLevel, 'MEDIO');
    assert.equal(stored.configuration.agents, undefined);
    assert.equal(stored.configuration.maturity, undefined);
    assert.ok(lab.fake.docs.some(doc => doc._source.documentType === 'CONFIGURATION_HISTORY' && doc._source.systemId === 'pilot'));

    const listed = await lab.handlers.systems(lab.context, {}, response);
    assert.deepEqual(listed.data, [{ id: 'default', name: 'Sistema principal' }, { id: 'pilot', name: 'Piloto' }]);
  });

  test('refuses an invalid or repeated id', async () => {
    const lab = createLab();
    for (const id of ['default', 'Piloto', '', '-x']) {
      assert.equal((await lab.handlers.createSystem(lab.context, { body: { id } }, response)).status, 400, id);
    }
    await lab.handlers.createSystem(lab.context, { body: { id: 'pilot' } }, response);
    assert.equal((await lab.handlers.createSystem(lab.context, { body: { id: 'pilot' } }, response)).status, 409);
  });

  test('reads and saves each system in its own document', async () => {
    const lab = createLab();
    await lab.handlers.createSystem(lab.context, { body: { id: 'pilot', name: 'Piloto' } }, response);

    const read = await lab.handlers.getActive(lab.context, { query: { system: 'pilot' } }, response);
    assert.equal(read.status, 200);

    const scope = { mode: 'group', groupIds: ['pilot'], agentIds: [] };
    const saved = await lab.handlers.save(lab.context, { query: { system: 'pilot' }, body: { configuration: { ...read.data.configuration, scope } } }, response);

    assert.equal(saved.status, 200);
    assert.deepEqual(configurationOf(lab, 'system-pilot').configuration.scope, scope);
    assert.deepEqual(configurationOf(lab, 'system-pilot').system, { id: 'pilot', name: 'Piloto' });
    assert.deepEqual(configurationOf(lab, 'active').configuration.scope, production.scope);
  });

  test('refuses a system scope that takes every machine or shares a group', async () => {
    const lab = createLab();
    await lab.handlers.createSystem(lab.context, { body: { id: 'pilot' } }, response);
    await lab.handlers.createSystem(lab.context, { body: { id: 'lab' } }, response);
    const base = configurationOf(lab, 'system-pilot').configuration;

    const everything = await lab.handlers.save(lab.context, { query: { system: 'pilot' }, body: { configuration: { ...base, scope: { mode: 'global', groupIds: [], agentIds: [] } } } }, response);
    assert.equal(everything.status, 400);

    await lab.handlers.save(lab.context, { query: { system: 'lab' }, body: { configuration: { ...base, scope: { mode: 'group', groupIds: ['shared'], agentIds: [] } } } }, response);
    const shared = await lab.handlers.save(lab.context, { query: { system: 'pilot' }, body: { configuration: { ...base, scope: { mode: 'group', groupIds: ['Shared'], agentIds: [] } } } }, response);
    assert.equal(shared.status, 400);
    assert.match(shared.message, /shared/);
  });

  test('answers 404 for a system that does not exist and 400 for a bad id', async () => {
    const lab = createLab();
    assert.equal((await lab.handlers.getActive(lab.context, { query: { system: 'ghost' } }, response)).status, 404);
    assert.equal((await lab.handlers.getActive(lab.context, { query: { system: 'Bad Id' } }, response)).status, 400);
  });

  test('deletes a system but never the default one', async () => {
    const lab = createLab();
    await lab.handlers.createSystem(lab.context, { body: { id: 'pilot' } }, response);

    assert.equal((await lab.handlers.deleteSystem(lab.context, { params: { id: 'default' } }, response)).status, 400);
    assert.equal((await lab.handlers.deleteSystem(lab.context, { params: { id: 'pilot' } }, response)).status, 200);
    assert.equal(configurationOf(lab, 'system-pilot'), undefined);
    assert.equal((await lab.handlers.deleteSystem(lab.context, { params: { id: 'pilot' } }, response)).status, 404);
  });
});
