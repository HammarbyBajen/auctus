import { createHash } from "node:crypto";

/**
 * Watching Mana's public OpenAPI spec for changes (ticket 24). Mana's API is
 * in alpha, so an endpoint or field can change without notice and break the
 * sync. The spec is reduced to a sorted list of lines, one per endpoint,
 * parameter and field (with its type, whether it is required or nullable,
 * and its allowed values), so two specs can be compared line by line and a
 * change is shown as what was added and what was removed. Descriptions and
 * key order are left out: rewording a sentence is not a change worth an alert.
 */

export const specUrl = "https://www.getmana.app/api/v1/openapi";

/** Every Mana endpoint Tegen HQ reads (a test keeps this in step with the client). A change to one of them is the kind that can break something. */
export const syncEndpoints = [
  "GET /api/v1/studios/{studioId}/users",
  "GET /api/v1/studios/{studioId}/user-memberships",
  "GET /api/v1/studios/{studioId}/payment-transactions",
  // Visits for the at-risk list (ticket 13).
  "GET /api/v1/studios/{studioId}/class-event-bookings",
  "GET /api/v1/studios/{studioId}/gym-check-ins",
  // Coach hours for Timmar (tickets 20-23).
  "GET /api/v1/studios/{studioId}/instructors",
  "GET /api/v1/studios/{studioId}/class-events",
  "GET /api/v1/studios/{studioId}/specialist-service-bookings",
  "GET /api/v1/studios/{studioId}/specialist-services",
  "GET /api/v1/studios/{studioId}/courses",
  "GET /api/v1/studios/{studioId}/course-events",
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
const isObj = (v: Json | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The same JSON written the same way whatever its key order, for a hash that only moves with content. */
export function canonical(input: unknown): string {
  const value = input as Json;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObj(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function specHash(spec: unknown): string {
  return createHash("sha256").update(canonical(spec)).digest("hex");
}

const methods = ["get", "post", "put", "patch", "delete"];

/** Follows a local "#/components/schemas/X" reference, if the schema is one. */
function resolve(spec: Obj, schema: Json | undefined, seen: Set<string>): Obj | null {
  if (!isObj(schema)) return null;
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  if (seen.has(ref)) return null;
  seen.add(ref);
  let target: Json | undefined = spec;
  for (const part of ref.replace(/^#\//, "").split("/")) target = isObj(target) ? target[part] : undefined;
  return resolve(spec, target, seen);
}

function describe(schema: Obj, required: boolean): string {
  const parts = [typeof schema.type === "string" ? schema.type : "any"];
  if (typeof schema.format === "string") parts.push(`(${schema.format})`);
  if (Array.isArray(schema.enum)) parts.push(`[${schema.enum.map((e) => String(e)).join("|")}]`);
  if (schema.nullable === true) parts.push("nullable");
  if (required) parts.push("required");
  return parts.join(" ");
}

/** One line per field of a schema, nested fields as a.b, array items as a[]. */
function fields(spec: Obj, schema: Json | undefined, path: string, required: boolean, out: string[], seen = new Set<string>(), depth = 0) {
  const s = resolve(spec, schema, seen);
  if (!s || depth > 12) return;
  for (const key of ["allOf", "oneOf", "anyOf"]) {
    const list = s[key];
    if (Array.isArray(list)) for (const sub of list) fields(spec, sub, path, required, out, new Set(seen), depth + 1);
  }
  if (path) out.push(`${path}: ${describe(s, required)}`);
  if (isObj(s.properties)) {
    const req = new Set(Array.isArray(s.required) ? s.required.map(String) : []);
    for (const [name, sub] of Object.entries(s.properties)) {
      fields(spec, sub, path ? `${path}.${name}` : name, req.has(name), out, new Set(seen), depth + 1);
    }
  }
  if (s.items !== undefined) fields(spec, s.items, `${path}[]`, false, out, new Set(seen), depth + 1);
}

/** Every endpoint, parameter and field of a spec, as sorted lines starting with "METHOD /path". */
export function specLines(input: unknown): string[] {
  const spec = input as Json;
  if (!isObj(spec) || !isObj(spec.paths)) throw new Error("Not an OpenAPI spec: no paths");
  const out: string[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!isObj(item)) continue;
    for (const method of methods) {
      const op = item[method];
      if (!isObj(op)) continue;
      const endpoint = `${method.toUpperCase()} ${path}`;
      out.push(endpoint);
      const params = [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])];
      for (const p of params) {
        const param = resolve(spec, p, new Set());
        if (!param) continue;
        const schema = resolve(spec, param.schema, new Set()) ?? {};
        out.push(`${endpoint} · param ${String(param.in)} ${String(param.name)}: ${describe(schema, param.required === true)}`);
      }
      const body = isObj(op.requestBody) && isObj(op.requestBody.content) ? op.requestBody.content : {};
      for (const [type, media] of Object.entries(body)) {
        const lines: string[] = [];
        fields(spec, isObj(media) ? media.schema : undefined, "", false, lines);
        for (const l of lines) out.push(`${endpoint} · body ${type} ${l}`);
      }
      const responses = isObj(op.responses) ? op.responses : {};
      for (const [status, response] of Object.entries(responses)) {
        const content = isObj(response) && isObj(response.content) ? response.content : {};
        for (const [type, media] of Object.entries(content)) {
          const lines: string[] = [];
          fields(spec, isObj(media) ? media.schema : undefined, "", false, lines);
          for (const l of lines) out.push(`${endpoint} · ${status} ${type} ${l}`);
        }
      }
    }
  }
  return [...new Set(out)].sort();
}

export type SpecChanges = {
  added: string[];
  removed: string[];
  /** True when a changed line belongs to an endpoint the sync reads. */
  touchesSync: boolean;
};

/** What changed from one spec to the next, or null when nothing that matters did. */
export function diffSpecs(before: unknown, after: unknown): SpecChanges | null {
  const a = new Set(specLines(before));
  const b = new Set(specLines(after));
  const added = [...b].filter((l) => !a.has(l));
  const removed = [...a].filter((l) => !b.has(l));
  if (added.length === 0 && removed.length === 0) return null;
  const touchesSync = [...added, ...removed].some((l) => syncEndpoints.some((e) => l === e || l.startsWith(`${e} ·`)));
  return { added, removed, touchesSync };
}
