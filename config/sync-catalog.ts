import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };

const plugin = join(__dirname, '..');
const vendored = join(plugin, 'common', 'ens', 'catalog', 'engine');
const source = join(process.env.CORE_SRC || join(plugin, '..', 'oscompliance-ens-wazuh'), 'catalog', 'controls', 'ens');

for (const name of readdirSync(vendored).filter(file => file.endsWith('.json'))) {
  copyFileSync(join(source, name), join(vendored, name));
}
const catalog = join(source, '..', '..');
copyFileSync(join(catalog, 'messages', 'es.json'), join(plugin, 'common', 'ens', 'catalog', 'messages', 'es.json'));
copyFileSync(join(catalog, 'system-types.json'), join(plugin, 'common', 'ens', 'catalog', 'system-types.json'));
copyFileSync(join(catalog, 'default-configuration.json'), join(plugin, 'common', 'ens', 'catalog', 'default-configuration.json'));
copyFileSync(join(catalog, 'maturity.json'), join(plugin, 'common', 'ens', 'catalog', 'maturity.json'));
const templates = join(plugin, 'common', 'ens', 'catalog', 'templates');
mkdirSync(templates, { recursive: true });
for (const name of readdirSync(join(catalog, 'templates'))) {
  copyFileSync(join(catalog, 'templates', name), join(templates, name));
}
const profiles = join(plugin, 'common', 'ens', 'catalog', 'profiles');
mkdirSync(profiles, { recursive: true });
for (const name of readdirSync(join(catalog, 'profiles'))) {
  copyFileSync(join(catalog, 'profiles', name), join(profiles, name));
}

const { ENGINE_CATALOG, controlBlockOf } = require('../common/ens/catalog/engine-catalog');
declare const require: any;
for (const entry of ENGINE_CATALOG) {
  const file = join(plugin, 'config', `${entry.control.replace(/\./g, '-')}-control-block.json`);
  writeFileSync(file, JSON.stringify(controlBlockOf(entry), null, 2) + '\n');
}
