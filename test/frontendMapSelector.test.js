import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';

const htmlPath = new URL('../public/index.html', import.meta.url);

async function loadHtml() {
  return readFile(htmlPath, 'utf8');
}

test('frontend exposes map selector with default all maps option', async () => {
  const html = await loadHtml();
  assert.match(html, /<label for="mapFilter">Mapa<\/label>/);
  assert.match(html, /<select id="mapFilter">[\s\S]*?<option value="all">Wszystkie mapy<\/option>/);
});

test('frontend applies map filter locally and keeps all maps as default state', async () => {
  const html = await loadHtml();
  assert.match(html, /map: 'all'/);
  assert.match(html, /if \(state\.map !== 'all' && s\.map !== state\.map\) return false;/);

  const handlerMatch = html.match(/document\.getElementById\('mapFilter'\)\.addEventListener\('change',[\s\S]*?\n\s*\}\);/);
  assert.ok(handlerMatch, 'mapFilter change handler should exist');

  const handler = handlerMatch[0];
  assert.match(handler, /applyAndRender\(\);/);
  assert.doesNotMatch(handler, /fetch\(/);
  assert.doesNotMatch(handler, /runRefreshCycle\(/);
});

test('frontend sends current map scope on refresh cycles', async () => {
  const html = await loadHtml();
  assert.match(html, /const activeMapScope = state\.map === 'all' \? 'all' : state\.map;/);
  assert.match(html, /body:\s*JSON\.stringify\(\{\s*mapScope:\s*activeMapScope\s*\}\)/);
});

test('frontend keeps map selector options based on allowlist payload', async () => {
  const html = await loadHtml();
  assert.match(html, /function updateMapOptions\(servers, allowedMaps\)/);
  assert.match(html, /Array\.isArray\(allowedMaps\) && allowedMaps\.length/);
  assert.match(html, /updateMapOptions\(currentServers, data\.allowedMaps\);/);
});

test('frontend shows refresh-in-progress countdown state and schedules from cycle start', async () => {
  const html = await loadHtml();
  assert.match(html, /if \(refreshCyclePromise\) \{\s*el\.textContent = 'Odświeżanie\.\.\.';/);
  assert.match(html, /function scheduleAutoRefresh\(nextCycleStartAt\)/);
  assert.match(html, /const nextCycleStart = scheduledCycleStartAt \+ intervalMs;/);
});
