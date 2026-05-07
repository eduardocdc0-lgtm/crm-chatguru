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
