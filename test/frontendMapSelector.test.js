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
  assert.match(html, /let currentSnapshotScope = 'all';/);

  const handlerMatch = html.match(/document\.getElementById\('mapFilter'\)\.addEventListener\('change',[\s\S]*?\n\s*\}\);/);
  assert.ok(handlerMatch, 'mapFilter change handler should exist');

  const handler = handlerMatch[0];
  assert.match(handler, /currentSnapshotScope !== 'all' && nextMap !== currentSnapshotScope/);
  assert.match(handler, /applyAndRender\(\);/);
  assert.match(handler, /await runRefreshCycle\(\);/);
});

test('frontend keeps all-snapshot map changes local-only without forced refresh', async () => {
  const html = await loadHtml();
  const handlerMatch = html.match(/document\.getElementById\('mapFilter'\)\.addEventListener\('change',[\s\S]*?\n\s*\}\);/);
  assert.ok(handlerMatch, 'mapFilter change handler should exist');
  const handler = handlerMatch[0];
  assert.match(handler, /if \(!shouldRefreshImmediately\) \{\s*applyAndRender\(\);\s*return;\s*\}/);
});

test('frontend forces immediate refresh when snapshot is concrete and user switches scope', async () => {
  const html = await loadHtml();
  const handlerMatch = html.match(/document\.getElementById\('mapFilter'\)\.addEventListener\('change',[\s\S]*?\n\s*\}\);/);
  assert.ok(handlerMatch, 'mapFilter change handler should exist');
  const handler = handlerMatch[0];
  assert.match(handler, /const shouldRefreshImmediately = currentSnapshotScope !== 'all' && nextMap !== currentSnapshotScope;/);
  assert.match(handler, /await runRefreshCycle\(\);/);
});

test('frontend sends current map scope on refresh cycles', async () => {
  const html = await loadHtml();
  assert.match(html, /const requestedMapScope = normalizeScopeValue\(state\.map, latestSnapshot\?\.allowedMaps\);/);
  assert.match(html, /body:\s*JSON\.stringify\(\{\s*mapScope:\s*requestedMapScope\s*\}\)/);
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

test('frontend updates currentSnapshotScope from server payload and successful refresh', async () => {
  const html = await loadHtml();
  assert.match(html, /currentSnapshotScope = normalizeScopeValue\(data\.snapshotScope, data\.allowedMaps\);/);
  assert.match(html, /currentSnapshotScope = normalizeScopeValue\(latestSnapshot\?\.snapshotScope \?\? requestedMapScope, latestSnapshot\?\.allowedMaps\);/);
});
