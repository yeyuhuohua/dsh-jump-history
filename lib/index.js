// dsh-jump-history — host half (persistent web-surface plugin).
// This plugin is client-only: the UI lives in lib/client.js. This host half
// exists only so the profile composition row mounts a real plugin entry,
// which is what makes dsh-client-modules scan the package for dsh.client.
export const name = 'dsh-jump-history'
export const inject = []
export function apply(ctx) {
  // no host behavior needed; see lib/client.js
}
