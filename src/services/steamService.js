import axios from 'axios';

export function createSteamService(config) {
  async function fetchServerList() {
    const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/';
    const responses = await Promise.all(
      config.allowedMaps.map((map) =>
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
