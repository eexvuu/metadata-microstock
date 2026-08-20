import type { Resource } from '#/lib/panel/define'
import { runs } from '#/resources/runs'
import { users } from '#/resources/users'

/**
 * The panel registry — sidebar order is this order.
 *
 * Every resource here is ADMIN-ONLY: Stockflow has no organizations, so an
 * ordinary account has nothing to administer. `roles: { view: ['admin'] }` is
 * what makes the nav come back empty for everyone else, and what makes the
 * server refuse a hand-crafted call.
 *
 * SERVER-ONLY. Import this from `src/lib/server/panel.ts` and nowhere else:
 * these modules pull in Drizzle tables and authorisation rules, and the whole
 * point of the JSON meta layer is that none of it ships to the browser.
 */
export const resources: Resource[] = [users, runs]

export function findResource(name: string) {
  return resources.find((resource) => resource.name === name)
}
