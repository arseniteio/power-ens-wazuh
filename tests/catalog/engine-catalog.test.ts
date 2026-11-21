import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ENGINE_CATALOG, controlBlockOf } from '../../common/ens/catalog/engine-catalog';
import { ENSCatalog } from '../../common/ens/catalog';
import { getEvidenceDefinitions } from '../../common/ens/core/evidence/registry';

const plugin = join(__dirname, '..', '..');
const vendored = join(plugin, 'common', 'ens', 'catalog', 'engine');
const monorepo = join(process.env.CORE_SRC || join(plugin, '..', 'oscompliance-ens-wazuh'), 'catalog');

describe('engine catalog', () => {
  test('has one entry per control of the plugin catalog', () => {
    assert.deepEqual(ENGINE_CATALOG.map(entry => entry.control).sort(), ENSCatalog.map(control => control.id).sort());
  });

  test('defines the plugin catalog: same requirements and evidences', () => {
    for (const entry of ENGINE_CATALOG) {
      const control = ENSCatalog.find(item => item.id === entry.control);
      assert.ok(control, entry.control);
      assert.deepEqual(control.requirements.map(r => r.id), entry.requirements.map((r: any) => r.id));
      assert.deepEqual(getEvidenceDefinitions(entry.control).map(e => e.id), entry.evidences.map((e: any) => e.id));
    }
  });

  test('generates every seed block in config/', () => {
    for (const entry of ENGINE_CATALOG) {
      const file = join(plugin, 'config', `${entry.control.replace(/\./g, '-')}-control-block.json`);
      assert.equal(readFileSync(file, 'utf8'), JSON.stringify(controlBlockOf(entry), null, 2) + '\n', entry.control);
    }
  });

  test('is a byte-for-byte copy of the oscompliance-ens-wazuh catalog', { skip: !existsSync(monorepo) && 'oscompliance-ens-wazuh is not checked out' }, () => {
    for (const file of readdirSync(vendored).filter(name => name.endsWith('.json'))) {
      assert.equal(readFileSync(join(vendored, file), 'utf8'), readFileSync(join(monorepo, 'controls', 'ens', file), 'utf8'), file);
    }
    for (const file of ['messages/es.json', 'system-types.json', 'maturity.json', ...readdirSync(join(monorepo, 'templates')).map(name => `templates/${name}`)]) {
      assert.equal(readFileSync(join(plugin, 'common', 'ens', 'catalog', file), 'utf8'), readFileSync(join(monorepo, file), 'utf8'), file);
    }
  });
});
