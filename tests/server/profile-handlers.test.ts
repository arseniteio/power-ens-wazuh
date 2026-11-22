import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileHandlers } from '../../server/lib/profile-handlers';

const ADMIN = { user_name: 'dioni', roles: ['power_ens_admin'] };
const READER = { user_name: 'ana', roles: ['readall'] };

const silentLogger: any = { info: () => {}, warn: () => {}, error: () => {} };

const response: any = {
  ok: ({ body, headers }: any) => ({ status: 200, data: body?.data ?? body, headers }),
  customError: ({ statusCode, body }: any) => ({ status: statusCode, message: body.message }),
};

interface StoredDoc {
  _id: string;
  _seq_no: number;
  _primary_term: number;
  _source: any;
}

const createStubClient = (user: any, docs: StoredDoc[] = []) => {
  let seqNo = 10;
  const bulkBodies: string[] = [];
  const client = {
    docs,
    bulkBodies,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }), putMapping: async () => ({ body: {} }) },
    transport: { request: async () => ({ body: user }) },
    search: async () => ({ body: { hits: { hits: docs.map(doc => ({ ...doc })) } } }),
    bulk: async ({ body }: any) => {
      bulkBodies.push(body);
      const lines = String(body).trim().split('\n').map(line => JSON.parse(line));
      const items: any[] = [];
      for (let i = 0; i < lines.length; i++) {
        const [kind, meta] = Object.entries<any>(lines[i])[0];
        const existing = docs.find(doc => doc._id === meta._id);
        const stale = meta.if_seq_no !== undefined && (!existing || existing._seq_no !== meta.if_seq_no);
        if ((kind === 'create' && existing) || stale) {
          items.push({ [kind]: { status: 409, error: { type: 'version_conflict_engine_exception' } } });
          if (kind !== 'delete') i++;
          continue;
        }
        if (kind === 'delete') {
          docs.splice(docs.indexOf(existing!), 1);
          items.push({ delete: { status: 200, result: 'deleted' } });
          continue;
        }
        const source = lines[++i];
        if (existing) docs.splice(docs.indexOf(existing), 1);
        docs.push({ _id: meta._id, _seq_no: ++seqNo, _primary_term: 1, _source: source });
        items.push({ [kind]: { status: 201, result: 'created' } });
      }
      return { body: { errors: items.some(item => Object.values<any>(item)[0].error), items } };
    },
  };
  const context = { core: { opensearch: { client: { asInternalUser: client, asCurrentUser: client } } } };
  return { client, context, handlers: createProfileHandlers({ logger: silentLogger, securityEnabled: true }) };
};

const setUpAdmin = () => createStubClient(ADMIN);

const web = {
  id: 'web',
  name: 'Servidor web',
  layer: 'service',
  match: [{ field: 'service', op: 'has', value: 'nginx' }],
  values: { 'op.acc.1': { 'P-03': ['www-data'] } },
};

const storedWeb = (): StoredDoc => ({
  _id: 'profile-web',
  _seq_no: 3,
  _primary_term: 1,
  _source: { documentType: 'PROFILE', configuration: web, updatedAt: '2026-11-01T00:00:00Z', updatedBy: 'dioni' },
});

describe('saving profiles', () => {
  test('writes the document the engine reads, with the session user', async () => {
    const { client, context, handlers } = setUpAdmin();
    const result = await handlers.apply(context, { body: { upserts: [{ profile: web, expectedVersion: null }], deletions: [] } }, response);

    assert.equal(result.status, 200);
    const doc = client.docs.find(d => d._id === 'profile-web')!;
    assert.equal(doc._source.documentType, 'PROFILE');
    assert.deepEqual(doc._source.configuration, web);
    assert.equal(doc._source.updatedBy, 'dioni');
    assert.match(client.bulkBodies[0], /"create"/);
  });

  test('refuses an invalid profile and writes nothing', async () => {
    const { client, context, handlers } = setUpAdmin();
    const result = await handlers.apply(context, { body: { upserts: [{ profile: { ...web, match: [] } }], deletions: [] } }, response);

    assert.equal(result.status, 400);
    assert.match(result.message, /condiciones/);
    assert.equal(client.bulkBodies.length, 0);
  });

  test('is refused without the power_ens_admin role', async () => {
    const { client, context, handlers } = createStubClient(READER);
    const result = await handlers.apply(context, { body: { upserts: [{ profile: web, expectedVersion: null }], deletions: [] } }, response);

    assert.equal(result.status, 403);
    assert.equal(client.docs.length, 0);
  });

  test('reports a conflict when the stored profile changed', async () => {
    const { context, handlers } = createStubClient(ADMIN, [storedWeb()]);
    const result = await handlers.apply(
      context,
      { body: { upserts: [{ profile: { ...web, name: 'Otro' }, expectedVersion: { seqNo: 1, primaryTerm: 1 } }], deletions: [] } },
      response
    );

    assert.equal(result.status, 409);
    assert.match(result.message, /web/);
  });

  test('deletes with the version it was read at', async () => {
    const { client, context, handlers } = createStubClient(ADMIN, [storedWeb()]);
    const result = await handlers.remove(context, { params: { id: 'web' }, query: { seqNo: 3, primaryTerm: 1 } }, response);

    assert.equal(result.status, 200);
    assert.equal(client.docs.length, 0);
  });

});

describe('listing, importing and exporting', () => {
  test('lists built-in and stored profiles with their origin', async () => {
    const { context, handlers } = createStubClient(ADMIN, [storedWeb()]);
    const result = await handlers.list(context, {}, response);

    assert.equal(result.status, 200);
    assert.equal(result.data.canChange, true);
    const origins = Object.fromEntries(result.data.profiles.map((e: any) => [e.profile.id, e.origin]));
    assert.equal(origins.web, 'stored');
    assert.equal(origins.ubuntu, 'builtin');
  });

  test('plans an import without writing', async () => {
    const { client, context, handlers } = createStubClient(ADMIN, [storedWeb()]);
    const text = `id: web\nname: Web\nlayer: service\nmatch:\n  - field: service\n    op: has\n    value: nginx\nvalues: {}\n`;
    const result = await handlers.importPlan(context, { body: { text } }, response);

    assert.equal(result.status, 200);
    assert.equal(result.data.items[0].status, 'changed');
    assert.equal(client.bulkBodies.length, 0);
  });

  test('explains a file that is not YAML', async () => {
    const { context, handlers } = createStubClient(ADMIN);
    const result = await handlers.importPlan(context, { body: { text: 'id: [' } }, response);

    assert.equal(result.status, 400);
    assert.match(result.message, /No se puede leer el fichero/);
  });

  test('exports YAML as a download', async () => {
    const { context, handlers } = createStubClient(ADMIN, [storedWeb()]);
    const result = await handlers.exportYaml(context, { query: { ids: 'web' } }, response);

    assert.equal(result.status, 200);
    assert.match(String(result.data), /^id: web\n/);
    assert.match(result.headers['content-disposition'], /web\.yaml/);
  });
});
