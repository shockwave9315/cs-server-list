function parsePort(raw) {
  if (raw === undefined || raw === '') return 27015;
  if (!/^\d+$/.test(raw)) return null;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

export function parseServerAddr(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const value = addr.trim();
  if (!value) return null;

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end < 0) return null;

    const host = value.slice(1, end).trim();
    if (!host || !host.includes(':')) return null;

    const portPart = value.slice(end + 1);
    if (portPart && !portPart.startsWith(':')) return null;

    const port = parsePort(portPart.startsWith(':') ? portPart.slice(1) : undefined);
    if (port === null) return null;

    return {
      host,
      port,
      normalized: `[${host}]:${port}`
    };
  }

  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length !== 2) return null;

    const host = parts[0].trim();
    if (!host) return null;

    const port = parsePort(parts[1]);
    if (port === null) return null;

    return {
      host,
      port,
      normalized: `${host}:${port}`
    };
  }

  return {
    host: value,
    port: 27015,
    normalized: `${value}:27015`
  };
}

export function dedupeByAddr(servers) {
  const seen = new Set();
  const unique = [];
  for (const server of servers) {
    const parsed = parseServerAddr(server.addr);
    if (!parsed || seen.has(parsed.normalized)) continue;
    seen.add(parsed.normalized);
    unique.push({ ...server, _parsedAddr: parsed });
  }
  return unique;
}
