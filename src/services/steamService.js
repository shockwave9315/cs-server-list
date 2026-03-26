import axios from 'axios';

export function createSteamService(config) {
  const mapFetchConcurrency = Number.isInteger(config.steamMapFetchConcurrency) && config.steamMapFetchConcurrency > 0
    ? config.steamMapFetchConcurrency
    : 4;

  function resolveMapsForScope(scope) {
    if (!scope || scope === 'all') return config.allowedMaps;
    return config.allowedMaps.includes(scope) ? [scope] : config.allowedMaps;
  }

  async function fetchServerList(options = {}) {
    const mapsToFetch = resolveMapsForScope(options.mapScope);
    const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/';
    const responses = new Array(mapsToFetch.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= mapsToFetch.length) return;
        const map = mapsToFetch[index];
        responses[index] = await axios.get(url, {
          params: {
            key: config.steamApiKey,
            filter: `\\appid\\${config.appId}\\map\\${map}`,
            limit: config.steamLimit
          },
          timeout: 10000
        });
      }
    }

    const workers = Array.from({ length: Math.min(mapFetchConcurrency, mapsToFetch.length) }, () => worker());
    await Promise.all(workers);

    return responses.flatMap((res) => res.data?.response?.servers || []);
  }

  return { fetchServerList };
}
