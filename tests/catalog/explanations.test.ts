import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { explainLevel, explainParameter, explainedTokens } from '../../common/ens/catalog/explanations';

describe('explanations', () => {
  test('name a parameter of its control with its description', () => {
    const p03 = explainParameter('op.acc.1', 'P-03');
    assert.match(p03?.title || '', /^P-03 · /);
    assert.ok((p03?.text || '').length > 10);
    assert.match(explainParameter(undefined, 'P-ATT')?.title || '', /Atestaciones documentales/);
    assert.equal(explainParameter('op.acc.1', 'P-99'), undefined);
  });

  test('give every level its name, percentage and meaning', () => {
    assert.equal(explainLevel(3)?.title, 'L3 · Definido · desde 60 %');
    assert.ok(explainLevel(5)?.text);
  });

  test('find P-X and L tokens in a text', () => {
    assert.deepEqual(
      explainedTokens('75 % · L3 · falta P-09 y P-ATT; LDAP no').map(t => t.kind),
      ['text', 'level', 'text', 'parameter', 'text', 'parameter', 'text']
    );
  });
});
