import axios from 'axios';

export function createSteamService(config) {
  async function fetchServerList() {
    const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/';
    const res = await axios.get(url, {
      params: {
        key: config.steamApiKey,
        filter: `\\appid\\${config.appId}\\map\\${config.targetMap}`,
        limit: config.steamLimit
      },
      timeout: 10000
    });

    return res.data?.response?.servers || [];
  }

  return { fetchServerList };
}
