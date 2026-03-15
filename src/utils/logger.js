function fmt(level, msg, meta) {
  const base = {
    ts: new Date().toISOString(),
    level,
    msg
  };
  const payload = meta ? { ...base, ...meta } : base;
  return JSON.stringify(payload);
}

export const logger = {
  info(msg, meta) {
    console.log(fmt('info', msg, meta));
  },
  warn(msg, meta) {
    console.warn(fmt('warn', msg, meta));
  },
  error(msg, meta) {
    console.error(fmt('error', msg, meta));
  }
};
