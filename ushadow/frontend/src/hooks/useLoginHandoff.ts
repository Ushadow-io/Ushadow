import { useCallback } from 'react'
import { authApi } from '../services/api'

/**
 * Open a service's web UI already signed in as the current ushadow user.
 *
 * Mints a token for `audience` and opens `url#token=…`. The token sits in the
 * fragment, so it never reaches a server or proxy log; the target page trades
 * it for its own session and removes it from the address bar.
 *
 * The tab is opened before the token request so popup blockers allow it. If
 * the token cannot be minted, the plain URL opens and the user signs in there.
 */
export function useLoginHandoff() {
  return useCallback(async (url: string, audience: string) => {
    const tab = window.open('about:blank', '_blank')
    let target = url
    try {
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
