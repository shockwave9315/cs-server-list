export function parseServerAddr(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const value = addr.trim();
  if (!value) return null;

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end < 0) return null;
    const host = value.slice(1, end);
    const portPart = value.slice(end + 1);
    const port = portPart.startsWith(':') ? Number.parseInt(portPart.slice(1), 10) : 27015;
    return {
      host,
      port: Number.isInteger(port) ? port : 27015,
      normalized: `[${host}]:${Number.isInteger(port) ? port : 27015}`
    };
  }

  const lastColon = value.lastIndexOf(':');
  if (lastColon <= 0) return { host: value, port: 27015, normalized: `${value}:27015` };

  const host = value.slice(0, lastColon);
  const port = Number.parseInt(value.slice(lastColon + 1), 10);
  const normalizedPort = Number.isInteger(port) ? port : 27015;
  return {
    host,
    port: normalizedPort,
    normalized: `${host}:${normalizedPort}`
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
