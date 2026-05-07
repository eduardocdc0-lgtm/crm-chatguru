// Express 5 expanded the type of req.query/req.params/etc to allow `string[]`,
// which happens when callers send `?foo=a&foo=b`. We don't use that pattern here,
// so these helpers narrow back to string at call sites.

export function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export function asStringOrEmpty(v: unknown): string {
  return asString(v) ?? "";
}

// Server runs in UTC but the business operates in São Paulo (UTC-3).
// "Hoje" must be the calendar day in Brasília, not in UTC.
export function startOfTodayBrasilia(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = fmt.format(new Date()); // YYYY-MM-DD in BRT calendar
  return new Date(`${dateStr}T00:00:00-03:00`);
}
