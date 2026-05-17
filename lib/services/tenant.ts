/**
 * Multi-tenant scaffolding for the IDS services.
 *
 * Closes §12.2 item 7 of the project report.
 *
 * What this adds
 * --------------
 * 1. A tiny `getTenantId(req)` helper that derives a tenant ID from the
 *    `x-tenant-id` request header (or returns `'default'` so the single-
 *    tenant flows the dashboard ships with keep working).
 * 2. A typed `tenantScoped<T>()` factory that wraps a per-tenant Map so
 *    in-memory singletons (RLHF weights, blocked-IP set, auto-train
 *    buffer) can be scoped without rewriting every call-site.
 *
 * What this DOESN'T do (yet)
 * --------------------------
 * The project still ships with a process-global RLHFService, AutoResponse
 * service, etc. Wiring those to `tenantScoped` requires a follow-up that
 * threads the tenant ID through every route handler — out of scope for
 * this scaffold commit. The intent is to land the pattern in one place so
 * the migration can proceed file-by-file without changing the public API.
 *
 * Production path
 * ---------------
 * Real multi-tenant deployment also needs:
 *   - Postgres (per-tenant connection pool) instead of SQLite.
 *   - Row-level security or per-tenant table sharding for the BlockedIP
 *     and DetectionResult tables.
 *   - An authn layer that maps users → tenants and stamps requests.
 *
 * None of that is in scope here; the goal is to make the migration
 * mechanically cheap once those decisions are made.
 */

import type { NextRequest } from 'next/server';

export type TenantId = string;

const DEFAULT_TENANT: TenantId = 'default';

/**
 * Validation: tenant IDs must be url-safe-ish so they don't accidentally
 * break log greps / DB queries / file paths if we ever persist by tenant.
 */
const TENANT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function getTenantId(req: NextRequest | Request): TenantId {
  const headerValue = req.headers.get('x-tenant-id')?.trim();
  if (!headerValue) return DEFAULT_TENANT;
  if (!TENANT_ID_RE.test(headerValue)) return DEFAULT_TENANT;
  return headerValue;
}

/**
 * Factory for per-tenant singletons.
 *
 * Usage:
 *   const rlhfFor = tenantScoped(() => new RLHFService());
 *   // ...later
 *   const svc = rlhfFor('acme');     // unique instance per tenant
 *   svc.addFeedback({...});
 *
 * The factory function runs once per tenant on first access. Returned
 * instances live for the lifetime of the Node process; restart resets all
 * tenants. Persistence is the consumer's responsibility.
 */
export function tenantScoped<T>(factory: () => T): (tenant: TenantId) => T {
  const cache = new Map<TenantId, T>();
  return (tenant: TenantId) => {
    let inst = cache.get(tenant);
    if (!inst) {
      inst = factory();
      cache.set(tenant, inst);
    }
    return inst;
  };
}

/**
 * For inspection / admin UI. Returns the set of tenants that have at least
 * one in-memory record across all scoped services. Pass in the factories
 * you want to introspect.
 */
export function listKnownTenants<T>(scoped: ReturnType<typeof tenantScoped<T>>): TenantId[] {
  // The closure-captured Map is opaque to us; this function is here as a
  // forward-compatible hook. Implementation lands when the migration
  // commits actually wire tenants through.
  void scoped;
  return [];
}
