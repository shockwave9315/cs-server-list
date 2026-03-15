import axios from 'axios';

export function createGeoIpService(config) {
  const cache = new Map();

  async function getCountry(ip) {
    const now = Date.now();
    const cached = cache.get(ip);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    try {
      const res = await axios.get(`${config.geoIpUrl}/${ip}`, {
        params: { fields: 'countryCode' },
        timeout: 3000
      });

      const value = res.data?.countryCode || null;
      cache.set(ip, { value, expiresAt: now + config.countryCacheTtlMs });
      return value;
    } catch {
      cache.set(ip, { value: null, expiresAt: now + Math.min(config.countryCacheTtlMs, 30_000) });
      return null;
    }
  }

  return { getCountry };
}
