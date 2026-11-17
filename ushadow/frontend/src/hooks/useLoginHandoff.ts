import { useCallback } from 'react'
import { authApi, tailscaleApi } from '../services/api'

/**
 * Open a service's web UI already signed in as the current ushadow user.
 *
 * Mints a token for `audience` and opens `url#token=…`. The token sits in the
 * fragment, so it never reaches a server or proxy log; the target page trades
 * it for its own session and removes it from the address bar.
 *
 * The tab is opened before the token request so popup blockers allow it. If
 * the token cannot be minted, the plain URL opens and the user signs in there.
 *
 * The URL comes from cluster state (ingress status), which anyone with deploy
 * rights can set. So the token goes only to a trusted host: this machine, or
 * https on THIS ushadow's own tailnet (its MagicDNS suffix, e.g.
 * `my-tailnet.ts.net`). Any `*.ts.net` is not enough: every tailnet ends in
 * `.ts.net`. Any other URL opens without a token.
 */
export function isTrustedHandoffUrl(url: string, tailnetSuffix: string | null): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return true
  const tailnet = tailnetSuffix?.toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!tailnet || !tailnet.endsWith('.ts.net')) return false
  return parsed.protocol === 'https:' && host.endsWith(`.${tailnet}`)
}

/** This ushadow's tailnet: from its Tailscale container, else from the page's own host. */
async function ownTailnetSuffix(): Promise<string | null> {
  try {
    const { data } = await tailscaleApi.getTailnetSettings()
    if (data.magic_dns.suffix) return data.magic_dns.suffix
  } catch {
    // No Tailscale container here; fall back to the page host.
  }
  const host = window.location.hostname.toLowerCase()
  if (!host.endsWith('.ts.net')) return null
  // <machine>.<tailnet>.ts.net -> <tailnet>.ts.net
  return host.split('.').slice(1).join('.')
}

export function useLoginHandoff() {
  return useCallback(async (url: string, audience: string) => {
    const tab = window.open('about:blank', '_blank')
    let target = url
    try {
      if (!isTrustedHandoffUrl(url, await ownTailnetSuffix())) {
        throw new Error(`untrusted host for token handoff: ${url}`)
      }
      const { data } = await authApi.getServiceToken([audience])
      const withToken = new URL(url)
      withToken.hash = `token=${encodeURIComponent(data.access_token)}`
      target = withToken.toString()
    } catch (error) {
      console.warn(`Sign-in handoff to ${audience} failed; opening without it`, error)
    }
    if (tab) {
      tab.opener = null
      tab.location.href = target
    } else {
      window.open(target, '_blank', 'noopener')
    }
  }, [])
}
