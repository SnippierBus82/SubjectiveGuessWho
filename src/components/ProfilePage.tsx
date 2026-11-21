import { useEffect, useState } from 'react'
import {
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { PlayerProfile } from '../hooks/useProfile'
import { AVATARS } from '../lib/profile'
import { config } from '../lib/config'
import { navigatePage } from '../lib/platform'
import { Captcha } from './Captcha'

function PasswordInput({
  label,
  value,
  onChange,
  fresh = false,
  required = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  fresh?: boolean
  required?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const id = label.toLowerCase().replaceAll(' ', '-')
  return (
    <div className="input-label password-label">
      <label htmlFor={id}>{label}</label>
      <span className="password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          required={required}
          minLength={fresh ? 12 : undefined}
          maxLength={128}
          autoComplete={fresh ? 'new-password' : 'current-password'}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={fresh ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={21} /> : <Eye size={21} />}
        </button>
      </span>
      {fresh && <small id={`${id}-hint`}>At least 12 characters. A few words work well.</small>}
    </div>
  )
}

export function ProfilePage({
  account,
  onSessionChange,
}: {
  account: PlayerProfile
  onSessionChange: () => Promise<void>
}) {
  const [name, setName] = useState(account.profile.name)
  const [avatar, setAvatar] = useState(account.profile.avatar)
  const [email, setEmail] = useState(account.user?.email ?? '')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [mode, setMode] = useState<'profile' | 'login' | 'register' | 'forgot' | 'settings'>(
    'profile',
  )
  const [verification, setVerification] = useState<'signup' | 'email_change' | 'recovery' | null>(
    null,
  )
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const linkingGuest = Boolean(account.user?.is_anonymous)
  useEffect(() => {
    setName(account.profile.name)
    setAvatar(account.profile.avatar)
  }, [account.profile])
  useEffect(() => {
    if (!cooldown) return
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [Boolean(cooldown)])
  const needsCaptcha = Boolean(config.captchaKey)
  function changeMode(next: typeof mode) {
    setMode(next)
    setMessage('')
    account.clearError()
    setPassword('')
    setCurrentPassword('')
    setVerification(null)
    setCode('')
    setToken('')
    setCaptchaAttempt((n) => n + 1)
    setEmail(account.user?.email ?? '')
  }
  async function submitAccount() {
    if (mode === 'login') {
      if (await account.login(email.trim(), password, token)) {
        setPassword('')
        setMode('profile')
        setMessage('Welcome back!')
        await onSessionChange()
      }
    } else if (mode === 'register') {
      const result = await account.register(
        email.trim(),
        password,
        { ...account.profile, name, avatar },
        token,
      )
      if (result) {
        setPassword('')
        if (result === 'signed-in') {
          setMode('profile')
          setMessage('You’re ready to play!')
          await onSessionChange()
        } else {
          setVerification(result)
          setCooldown(60)
        }
      }
    } else if (mode === 'forgot') {
      if (await account.forgotPassword(email.trim(), token)) {
        setVerification('recovery')
        setCooldown(60)
      }
    } else if (mode === 'settings') {
      if (await account.updateAccount(currentPassword, email.trim(), password, token)) {
        setMessage(
          email.trim() !== account.user?.email
            ? 'Check both email inboxes to confirm your new address.'
            : 'Account updated.',
        )
        setCurrentPassword('')
        setPassword('')
        setMode('profile')
      }
    }
    setToken('')
    setCaptchaAttempt((n) => n + 1)
  }
  if (account.recovery)
    return (
      <>
        <div className="screen-heading">
          <p className="screen-kicker">MAKE IT YOURS</p>
          <h1>Set your password.</h1>
          <p>Use it to log in on any device.</p>
        </div>
        <form
          className="profile-card app-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await account.resetPassword(password)) {
              setPassword('')
              setVerification(null)
              setMode('profile')
              setMessage('Password saved. You’re ready!')
              await onSessionChange()
            }
          }}
        >
          <PasswordInput label="New password" value={password} fresh onChange={setPassword} />
          {account.error && (
            <p className="form-error" role="alert">
              {account.error}
            </p>
          )}
          <button className="button primary" disabled={account.busy}>
            Save password
          </button>
        </form>
      </>
    )
  if (verification && !(account.signedIn && verification !== 'recovery'))
    return (
      <>
        <button className="back-button" onClick={() => changeMode('login')}>
          <ChevronLeft size={23} /> Log in
        </button>
        <div className="screen-heading">
          <span className="account-symbol">
            <Mail size={29} />
          </span>
          <h1>Check your email.</h1>
          <p>
            {verification === 'recovery'
              ? 'If an account uses that email, we sent a reset code.'
              : 'Enter your confirmation code, or follow the link in your email.'}
          </p>
        </div>
        <form
          className="profile-card app-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await account.verifyCode(email.trim(), code, verification)) {
              setCode('')
              setVerification(null)
              setMode('profile')
              setMessage('Email confirmed!')
              await onSessionChange()
            }
          }}
        >
          <p className="email-destination">{email}</p>
          <label className="input-label" htmlFor="verification-code">
            Email code
          </label>
          <input
            id="verification-code"
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
          {account.error && (
            <p className="form-error" role="alert">
              {account.error}
            </p>
          )}
          <button className="button primary" disabled={account.busy || code.length < 6}>
            Confirm code
          </button>
          {needsCaptcha && <Captcha key={captchaAttempt} onToken={setToken} />}
          <button
            className="text-button"
            type="button"
            disabled={account.busy || cooldown > 0 || (needsCaptcha && !token)}
            onClick={async () => {
              const sent =
                verification === 'recovery'
                  ? await account.forgotPassword(email.trim(), token)
                  : await account.resendConfirmation(email.trim(), verification, token)
              if (sent) setCooldown(60)
              setToken('')
              setCaptchaAttempt((n) => n + 1)
            }}
          >
            {cooldown ? `Send again in ${cooldown}s` : 'Send a new code'}
          </button>
          <button className="text-button" type="button" onClick={() => changeMode('login')}>
            Back to log in
          </button>
        </form>
      </>
    )
  if (mode !== 'profile' && !(account.signedIn && mode !== 'settings'))
    return (
      <>
        <button className="back-button" onClick={() => changeMode('profile')}>
          <ChevronLeft size={23} /> Profile
        </button>
        <div className="screen-heading">
          <p className="screen-kicker">
            {mode === 'register'
              ? 'JOIN THE FUN'
              : mode === 'settings'
                ? 'YOUR ACCOUNT'
                : 'WELCOME BACK'}
          </p>
          <h1>
            {mode === 'register'
              ? 'Create an account.'
              : mode === 'forgot'
                ? 'Forgot password?'
                : mode === 'settings'
                  ? 'Account settings.'
                  : 'Log in.'}
          </h1>
          <p>
            {mode === 'register'
              ? 'Your player. On every device.'
              : mode === 'forgot'
                ? 'We’ll help you get back in.'
                : mode === 'settings'
                  ? 'Change your email or password.'
                  : 'Pick up where you left off.'}
          </p>
        </div>
        <form
          className="profile-card app-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submitAccount()
          }}
        >
          {mode === 'register' && (
            <>
              <label className="input-label" htmlFor="account-name">
                Player name
              </label>
              <input
                id="account-name"
                autoComplete="nickname"
                required
                maxLength={18}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </>
          )}
          <label className="input-label" htmlFor="account-email">
            Email
          </label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {mode === 'settings' && (
            <PasswordInput
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          )}
          {mode !== 'forgot' && !(mode === 'register' && linkingGuest) && (
            <PasswordInput
              label={mode === 'settings' ? 'New password' : 'Password'}
              fresh={mode !== 'login'}
              required={mode !== 'settings'}
              value={password}
              onChange={setPassword}
            />
          )}
          {mode === 'register' && linkingGuest && (
            <p className="form-note">First confirm your email. Then choose a password.</p>
          )}
          {mode === 'login' && (
            <button className="forgot-link" type="button" onClick={() => changeMode('forgot')}>
              Forgot password?
            </button>
          )}
          {needsCaptcha && <Captcha key={captchaAttempt} onToken={setToken} />}
          {account.error && (
            <p className="form-error" role="alert">
              {account.error}
            </p>
          )}
          <button className="button primary" disabled={account.busy || (needsCaptcha && !token)}>
            {account.busy
              ? 'One moment…'
              : mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send reset code'
                  : mode === 'settings'
                    ? 'Save changes'
                    : 'Log in'}
          </button>
          {mode !== 'settings' && (
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode(mode === 'register' ? 'login' : 'register')}
            >
              {mode === 'register'
                ? 'Already have an account? Log in'
                : 'New here? Create an account'}
            </button>
          )}
        </form>
      </>
    )
  return (
    <>
      <div className="screen-heading">
        <p className="screen-kicker">YOUR PLAYER</p>
        <h1>My profile.</h1>
        <p>Make yourself at home.</p>
      </div>
      <form
        className="profile-card app-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await account.save({ ...account.profile, name, avatar }))
            setMessage(
              account.signedIn ? 'Profile saved and synced.' : 'Profile saved on this device.',
            )
        }}
      >
        <div className="profile-player">
          <span className="profile-avatar" aria-hidden="true">
            {avatar}
          </span>
          <div>
            <h2>{name || 'Your player'}</h2>
            <span className="profile-status">
              <ShieldCheck size={16} />
              {account.loading
                ? 'Loading profile…'
                : account.signedIn
                  ? 'Account connected'
                  : 'Guest player'}
            </span>
          </div>
        </div>
        <fieldset className="avatar-picker">
          <legend>Pick your look</legend>
          {AVATARS.map((item, index) => (
            <button
              key={item}
              type="button"
              aria-label={`Avatar ${index + 1}`}
              aria-pressed={avatar === item}
              onClick={() => {
                setAvatar(item)
                setMessage('')
              }}
            >
              {item}
            </button>
          ))}
        </fieldset>
        <label className="input-label" htmlFor="profile-name">
          Player name
        </label>
        <input
          id="profile-name"
          value={name}
          required
          maxLength={18}
          autoComplete="nickname"
          placeholder="Your name in the game"
          onChange={(event) => {
            setName(event.target.value)
            setMessage('')
          }}
        />
        {account.signedIn && (
          <label className="input-label">
            Email
            <input value={account.user?.email ?? ''} type="email" readOnly autoComplete="email" />
          </label>
        )}
        {account.error && (
          <p className="form-error" role="alert">
            {account.error}
          </p>
        )}
        {message && (
          <p className="saved-message" role="status">
            <Check size={18} />
            {message}
          </p>
        )}
        <button className="button primary" disabled={account.busy || account.loading}>
          <UserRound size={21} />
          {account.busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <section className="account-card">
        {account.signedIn ? (
          <>
            <div className="account-card-heading">
              <span className="account-symbol">
                <KeyRound size={24} />
              </span>
              <div>
                <h2>Your account</h2>
                <p>Your profile goes with you.</p>
              </div>
            </div>
            <button className="button secondary" onClick={() => changeMode('settings')}>
              Email & password
            </button>
            <button
              className="text-button"
              disabled={account.busy}
              onClick={async () => {
                if (await account.signOut()) {
                  setMessage('You’re signed out.')
                  await onSessionChange()
                }
              }}
            >
              <LogOut size={18} /> Log out
            </button>
          </>
        ) : (
          <>
            <div className="account-card-heading">
              <span className="account-symbol">
                <ShieldCheck size={26} />
              </span>
              <div>
                <h2>Play on any device</h2>
                <p>Save your profile with an account.</p>
              </div>
            </div>
            <div className="account-actions">
              <button
                className="button primary"
                disabled={!config.online || account.loading}
                onClick={() => changeMode('register')}
              >
                Create account
              </button>
              <button
                className="button secondary"
                disabled={!config.online || account.loading}
                onClick={() => changeMode('login')}
              >
                Log in
              </button>
            </div>
            {!config.online && (
              <p className="form-note">Accounts are available when online play is configured.</p>
            )}
          </>
        )}
      </section>
      <button className="privacy-link" onClick={() => navigatePage('privacy')}>
        Privacy & credits
      </button>
    </>
  )
}
