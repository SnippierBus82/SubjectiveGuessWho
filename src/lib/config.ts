const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
const hcaptchaKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY?.trim() ?? ''
const turnstileKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? ''
export const config = {
  url,
  key,
  online: Boolean(url && key),
  incomplete: Boolean(url) !== Boolean(key),
  captchaProvider: hcaptchaKey ? 'hcaptcha' : 'turnstile',
  captchaKey: hcaptchaKey || turnstileKey,
  appUrl: import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? '',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? '',
}
