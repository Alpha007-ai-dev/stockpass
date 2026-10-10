// fetch with a timeout (AbortSignal.timeout is not reliably available in Hermes), so a hung request
// cannot leave a screen busy forever.
export async function fetchT(url: string, init: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('The server took too long to answer. Try again.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
