import { useEffect } from 'react'
import type { AutoUpdateRuntimeDto } from './types'

export function useSkillStatusRefresh(enabled: boolean, read: () => Promise<AutoUpdateRuntimeDto>, receive: (runtime: AutoUpdateRuntimeDto) => void, refresh: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let inFlight = false
    let lastSignature = ''
    const poll = async (force = false) => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const runtime = await read()
        if (cancelled) return
        receive(runtime)
        const signature = JSON.stringify([runtime.last_run_at, runtime.last_status, runtime.progress])
        if (force || signature !== lastSignature) {
          await refresh()
          lastSignature = signature
        }
      } catch { /* Keep the previous state on a transient read failure. */ }
      finally { inFlight = false }
    }
    const focus = () => { void poll(true) }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 5000)
    window.addEventListener('focus', focus)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [enabled, read, receive, refresh])
}
