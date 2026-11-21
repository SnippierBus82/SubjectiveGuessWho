import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { config } from '../lib/config'
import { normalizeProfile, readProfile, storeProfile, type Profile } from '../lib/profile'

const client = async () => (await import('../services/client')).getSupabaseClient()
export function useProfile() {
  const [profile, setProfile] = useState(readProfile)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(config.online)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const busyRef = useRef(false)
  const signedIn = Boolean(user && !user.is_anonymous && user.email_confirmed_at)

  function applyUser(next: User | null) {
    setUser(next)
    if (next?.email_confirmed_at && next.user_metadata.sgw_needs_password === true)
      setRecovery(true)
    if (next?.user_metadata?.sgw_profile) {
      const saved = normalizeProfile(next.user_metadata.sgw_profile)
      storeProfile(saved)
      setProfile(saved)
    }
  }
  useEffect(() => {
    if (!config.online) return
    let active = true
    let unsubscribe: (() => void) | undefined
    const load = async () => {
      try {
        const backend = await client()
        if (!active) return
        const { data: listener } = backend.auth.onAuthStateChange((event, session) => {
          if (!active) return
          if (event === 'PASSWORD_RECOVERY') setRecovery(true)
          if (event === 'SIGNED_OUT') {
            const empty = normalizeProfile({})
            storeProfile(empty)
            setProfile(empty)
          }
          applyUser(session?.user ?? null)
        })
        unsubscribe = () => listener.subscription.unsubscribe()
        const { data: session, error: sessionError } = await backend.auth.getSession()
        if (sessionError) throw sessionError
        if (session.session) {
          const { data, error: userError } = await backend.auth.getUser()
          if (userError) throw userError
          if (active) applyUser(data.user)
        }
      } catch {
        if (active)
          setError('Your saved profile could not sync. Check your connection and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  async function work<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      return await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  async function save(next: Profile) {
    return work(async () => {
      const normalized = normalizeProfile(next)
      if (config.online && user) {
        const { data, error } = await (
          await client()
        ).auth.updateUser({ data: { sgw_profile: normalized } })
        if (error) throw new Error('Your profile could not sync. Please try again.')
        setUser(data.user)
      }
      if (!storeProfile(normalized)) throw new Error('This browser could not save your profile.')
      setProfile(normalized)
      return true
    })
  }
  async function login(email: string, password: string, captchaToken?: string) {
    return work(async () => {
      const { data, error } = await (
        await client()
      ).auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      })
      if (error)
        throw new Error(
          error.status === 429
            ? 'Too many tries. Wait a moment and try again.'
            : error.code === 'email_not_confirmed'
              ? 'Confirm your email first. Check your inbox.'
              : 'Check your email and password, then try again.',
        )
      applyUser(data.user)
      return true
    })
  }
  async function register(email: string, password: string, next: Profile, captchaToken?: string) {
    return work(async () => {
      const backend = await client()
      const normalized = normalizeProfile(next)
      if (!normalized.name) throw new Error('Choose a player name first.')
      if (user?.is_anonymous) {
        const { error } = await backend.auth.updateUser(
          { email, data: { sgw_profile: normalized, sgw_needs_password: true } },
          { emailRedirectTo: `${location.origin}/?page=profile` },
        )
        if (error)
          throw new Error('Could not create this account. Try logging in, or use another email.')
        storeProfile(normalized)
        setProfile(normalized)
        return 'email_change' as const
      }
      if (password.length < 12) throw new Error('Use at least 12 characters for your password.')
      const { data, error } = await backend.auth.signUp({
        email,
        password,
        options: {
          captchaToken,
          data: { sgw_profile: normalized },
          emailRedirectTo: `${location.origin}/?page=profile`,
        },
      })
      if (error)
        throw new Error(
          error.status === 429
            ? 'Please wait a minute before trying again.'
            : 'Could not create this account. Check your details and try again.',
        )
      if (data.session) {
        applyUser(data.user)
        return 'signed-in' as const
      }
      return 'signup' as const
    })
  }
  async function verifyCode(
    email: string,
    token: string,
    type: 'signup' | 'email_change' | 'recovery',
  ) {
    return work(async () => {
      const { data, error } = await (await client()).auth.verifyOtp({ email, token, type })
      if (error || !data.user || !data.session || !data.user.email_confirmed_at)
        throw new Error('That code is invalid or expired. Try again or send a new code.')
      applyUser(data.user)
      if (type === 'recovery') setRecovery(true)
      return true
    })
  }
  async function forgotPassword(email: string, captchaToken?: string) {
    return work(async () => {
      const { error } = await (
        await client()
      ).auth.resetPasswordForEmail(email, {
        captchaToken,
        redirectTo: `${location.origin}/?page=profile`,
      })
      if (error) throw new Error('Could not send the email. Wait a moment and try again.')
      return true
    })
  }
  async function resendConfirmation(
    email: string,
    type: 'signup' | 'email_change',
    captchaToken?: string,
  ) {
    return work(async () => {
      const { error } = await (
        await client()
      ).auth.resend({ email, type, options: { captchaToken } })
      if (error) throw new Error('Could not send another code. Wait a minute and try again.')
      return true
    })
  }
  async function resetPassword(password: string) {
    return work(async () => {
      if (!recovery) throw new Error('Verify your reset code first.')
      if (password.length < 12) throw new Error('Use at least 12 characters for your password.')
      const { error } = await (
        await client()
      ).auth.updateUser({
        password,
        data: { sgw_needs_password: false },
      })
      if (error) throw new Error('Could not save that password. Try a different password.')
      setRecovery(false)
      return true
    })
  }
  async function updateAccount(
    currentPassword: string,
    email: string,
    password: string,
    captchaToken?: string,
  ) {
    return work(async () => {
      if (!user?.email) throw new Error('Log in first.')
      const backend = await client()
      const verified = await backend.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
        options: { captchaToken },
      })
      if (verified.error) throw new Error('Check your current password and try again.')
      if (password && password.length < 12)
        throw new Error('Use at least 12 characters for your new password.')
      const { data, error } = await backend.auth.updateUser(
        {
          ...(email !== user.email ? { email } : {}),
          ...(password ? { password, current_password: currentPassword } : {}),
        },
        { emailRedirectTo: `${location.origin}/?page=profile` },
      )
      if (error) throw new Error('Could not update your account. Check your details and try again.')
      applyUser(data.user)
      return true
    })
  }
  async function signOut() {
    return work(async () => {
      const { error } = await (await client()).auth.signOut({ scope: 'local' })
      if (error) throw new Error('Could not sign out. Please try again.')
      const empty = normalizeProfile({})
      storeProfile(empty)
      setProfile(empty)
      setUser(null)
      setRecovery(false)
      return true
    })
  }
  return {
    profile,
    user,
    signedIn,
    loading,
    error,
    busy,
    recovery,
    save,
    login,
    register,
    verifyCode,
    forgotPassword,
    resendConfirmation,
    resetPassword,
    updateAccount,
    signOut,
    clearError: () => setError(''),
  }
}
export type PlayerProfile = ReturnType<typeof useProfile>
