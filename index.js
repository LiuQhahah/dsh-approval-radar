/**
 * Host half of `dsh-approval-radar`.
 *
 * Deliberately empty: everything this plugin does is Client-side. The pending
 * approvals are already projected into the browser by
 * `@deepseek-ai/dsh-client-ui-session` (`sessionStatus.pendingInteraction`), so
 * no Host route, no Host state, and no extra IPC are needed.
 *
 * A Host half still has to exist because `dsh.bundle.patch` inserts a Loader
 * entry whose `name` must resolve to a package with a `main`/`exports` entry.
 */

/** Cordis plugin name, as referenced by `cordis.patch.yml`. */
export const name = 'approval-radar'

/**
 * Nothing to install on the Host.
 */
export function apply() {}
