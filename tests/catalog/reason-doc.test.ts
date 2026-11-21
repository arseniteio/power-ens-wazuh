import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonDoc, reasonDocText, renderEngineMessage } from '../../common/ens/catalog/engine-messages';
import { displayReason } from '../../common/ens/evaluation/reason-display';

describe('reason structure', () => {
  test('keeps a long list whole, below the sentence', () => {
    const accounts = Array.from({ length: 30 }, (_, i) => `svc${i}`);
    const doc = reasonDoc('opacc1.ev05.service_logged', { accounts: accounts.join(', ') });
    assert.ok(doc);
    const list = reasonDoc('opacc1.ev07.unlisted', { accounts });
    assert.equal(list?.lists[0].items.length, 30);
    assert.ok(!reasonDocText({ ...list!, lists: [] }).endsWith(':'));
  });

  test('marks parameters so the view can name them', () => {
    const doc = reasonDoc('opacc1.ev05.service_none', { logins: 3, methods: 'sshd 3', param: 'P-03' });
    assert.ok(doc?.inline.some(part => part.kind === 'parameter' && part.id === 'P-03'));
  });

  test('shows short lists inside the sentence', () => {
    const doc = reasonDoc('opacc1.ev07.unlisted', { accounts: ['ana', 'luis'] });
    assert.equal(doc?.lists.length, 0);
    assert.match(reasonDocText(doc!), /ana, luis/);
  });
});

describe('a configuration gap', () => {
  test('is flagged and names the parameter', () => {
    const shown = displayReason('configuration.parameter_unset', { machine: 'web01 (001)', param: 'P-03' });
    assert.equal(shown.missingConfiguration, true);
    assert.equal(shown.parameterId, 'P-03');
    assert.equal(reasonDocText(shown.doc), 'P-03 sin valor');
  });

  test('keeps the inner reason without the machine', () => {
    const shown = displayReason('configuration.parameter_value', {
      machine: 'web01 (001)',
      param: 'P-06',
      detail: { code: 'param.not_set', args: { param: 'P-06' } },
    });
    assert.equal(shown.missingConfiguration, true);
    assert.ok(!reasonDocText(shown.doc).includes('web01'));
  });
});

