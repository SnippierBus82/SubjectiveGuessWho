import { useEffect, useRef, useState } from 'react'
import { config } from '../lib/config'

interface CaptchaApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: CaptchaApi
    hcaptcha?: CaptchaApi
    onGameCaptchaLoaded?: () => void
  }
}
let scriptReady: Promise<void> | undefined
function loadScript() {
  scriptReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    window.onGameCaptchaLoaded = () => resolve()
    script.src =
      config.captchaProvider === 'hcaptcha'
        ? 'https://js.hcaptcha.com/1/api.js?onload=onGameCaptchaLoaded&render=explicit&recaptchacompat=off'
        : 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onGameCaptchaLoaded&render=explicit'
    script.async = true
    script.defer = true
    script.onerror = () => {
      scriptReady = undefined
      delete window.onGameCaptchaLoaded
      script.remove()
      reject(new Error('Unable to load connection check.'))
    }
    document.head.appendChild(script)
  })
  return scriptReady
}
export function Captcha({ onToken }: { onToken: (value: string) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true,
      widget: string | undefined
    const getApi = () =>
      config.captchaProvider === 'hcaptcha' ? window.hcaptcha : window.turnstile
    loadScript()
      .then(() => {
        if (!active || !element.current) return
        const api = getApi()
        if (!api) throw new Error('Connection check did not initialize.')
        widget = api.render(element.current, {
          sitekey: config.captchaKey,
          theme: 'light',
          size: config.captchaProvider === 'hcaptcha' ? 'compact' : 'flexible',
          callback: (token: string) => {
            if (!active) return
            setFailed(false)
            onToken(token)
          },
          'expired-callback': () => {
            if (active) onToken('')
          },
          'chalexpired-callback': () => {
            if (active) onToken('')
          },
          'error-callback': () => {
            if (!active) return
            onToken('')
            setFailed(true)
          },
        })
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (widget !== undefined) getApi()?.remove(widget)
    }
  }, [onToken])
  return (
    <div className="captcha">
      <div ref={element} />
      {failed && <p role="alert">Connection check unavailable. Reload to retry.</p>}
    </div>
  )
}
