/** The one job this app has. Shared by both runtimes so the seam stays typed. */
export type Job = { kind: 'provision-account'; userId: string }
