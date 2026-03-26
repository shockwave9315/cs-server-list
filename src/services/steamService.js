import axios from 'axios';

export function createSteamService(config) {
  function resolveMapsForScope(scope) {
    if (!scope || scope === 'all') return config.allowedMaps;
    return config.allowedMaps.includes(scope) ? [scope] : config.allowedMaps;
  }

  async function fetchServerList(options = {}) {
    const mapsToFetch = resolveMapsForScope(options.mapScope);
    const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/';
    const responses = await Promise.all(
      mapsToFetch.map((map) =>
        axios.get(url, {
          params: {
            key: config.steamApiKey,
            filter: `\\appid\\${config.appId}\\map\\${map}`,
            limit: config.steamLimit
          },
          timeout: 10000
        })
      )
    );

    return responses.flatMap((res) => res.data?.response?.servers || []);
  }

  return { fetchServerList };
}
