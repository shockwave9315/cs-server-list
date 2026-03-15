import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerAddr, dedupeByAddr } from '../src/utils/servers.js';

test('parseServerAddr handles ipv4 and default port', () => {
  assert.deepEqual(parseServerAddr('1.2.3.4:27016'), {
    host: '1.2.3.4',
    port: 27016,
    normalized: '1.2.3.4:27016'
  });

  assert.deepEqual(parseServerAddr('1.2.3.4'), {
    host: '1.2.3.4',
    port: 27015,
    normalized: '1.2.3.4:27015'
  });
});

test('parseServerAddr handles bracketed ipv6', () => {
  assert.deepEqual(parseServerAddr('[2001:db8::1]:27017'), {
    host: '2001:db8::1',
    port: 27017,
    normalized: '[2001:db8::1]:27017'
  });

  assert.deepEqual(parseServerAddr('[2001:db8::1]'), {
    host: '2001:db8::1',
    port: 27015,
    normalized: '[2001:db8::1]:27015'
  });
});

test('parseServerAddr rejects ambiguous or malformed inputs', () => {
  const invalid = [
    null,
    '',
    '   ',
    '[2001:db8::1',
    '2001:db8::1',
    '[2001:db8::1]extra',
    '1.2.3.4:abc',
    '1.2.3.4:0',
    '1.2.3.4:70000',
    ':27015',
    'host:123:456'
  ];

  for (const entry of invalid) {
    assert.equal(parseServerAddr(entry), null, `Expected ${String(entry)} to be rejected`);
  }
});

test('dedupeByAddr removes duplicates by normalized address', () => {
  const unique = dedupeByAddr([
    { addr: '1.2.3.4:27015', name: 'A' },
    { addr: '1.2.3.4:27015', name: 'B' },
    { addr: '1.2.3.4', name: 'C' },
    { addr: 'host:bad', name: 'D' }
  ]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0].name, 'A');
});
