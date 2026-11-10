/**
 * Initial registration additions are queued by the public registration API
 * and executed by enforce-access. Keeping a second scheduled worker here
 * would race the same operations and could cancel or duplicate attempts.
 */
export default async () => Response.json({
  ok: true,
  mode: "managed_by_enforce_access",
  attempted: 0,
  pending: 0,
});
