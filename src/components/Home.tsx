import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  Link,
  MessageCircle,
  MousePointer2,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { config } from '../lib/config'
import { navigateRoom, storage } from '../lib/platform'
import type { GameController } from '../hooks/useGame'
import { characters } from '../game/characters'
import { Portrait } from './CharacterBoard'
import { Captcha } from './Captcha'

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="brand"
      onClick={onClick ?? (() => navigateRoom())}
      aria-label="Subjective Guess Who home"
    >
      <span className="brand-icon" aria-hidden="true">
        ?
      </span>
      <span>
        subjective
        <span className="brand-bottom">
          guess who<span className="brand-dot">.</span>
        </span>
      </span>
    </button>
  )
}
export function Home({ controller, joinCode }: { controller: GameController; joinCode: string }) {
  const [name, setName] = useState(() => storage.read<string>('nickname', ''))
  const [code, setCode] = useState(joinCode)
  const [joining, setJoining] = useState(Boolean(joinCode))
  const [token, setToken] = useState('')
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [nameError, setNameError] = useState('')
  const lastRoom = storage.read<string>('last-room', '')
  const needsCaptcha = config.online && Boolean(config.captchaKey) && !controller.hasSession
  async function start(join = false) {
    if (!name.trim()) {
      setNameError('First, give your friend a name to judge.')
      document.getElementById('nickname')?.focus()
      return
    }
    setNameError('')
    storage.write('nickname', name.trim())
    const success = join
      ? await controller.join(code.trim().toUpperCase(), name.trim(), token)
      : await controller.create(name.trim(), token)
    if (!success) {
      setToken('')
      setCaptchaAttempt((value) => value + 1)
    }
  }
  return (
    <>
      <header className="site-header">
        <Logo />
        <span className="header-tag">
          <span className="small-star">✳</span> A little judgment goes a long way.
        </span>
        <a className="how-link" href="#how-to-play">
          How to play <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="home-main">
        <section className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" /> TWO PLAYERS. ZERO OBJECTIVITY.
          </p>
          <h1>
            Good questions.
            <br />
            <span>Questionable</span>
            <br />
            judgment<span className="coral-period">.</span>
          </h1>
          <p className="hero-description">
            24 faces. One secret person. A whole lot of assumptions.
            <br className="desktop-only" /> The guessing game where the vibes are the evidence.
          </p>
          <div className="start-card">
            <label htmlFor="nickname">What should your friend call you?</label>
            <input
              id="nickname"
              value={name}
              onChange={(event) => {
                setName(event.target.value.slice(0, 18))
                setNameError('')
              }}
              placeholder="Your nickname"
              autoComplete="nickname"
              maxLength={18}
              aria-describedby={nameError ? 'name-error' : undefined}
            />
            {nameError && (
              <p className="field-error" id="name-error">
                {nameError}
              </p>
            )}
            {needsCaptcha && <Captcha key={captchaAttempt} onToken={setToken} />}
            <button
              className="button primary create-button"
              onClick={() => void start()}
              disabled={controller.busy || config.incomplete || (needsCaptcha && !token)}
            >
              <Plus size={20} />
              {controller.busy ? 'Getting things ready…' : 'Create game'}
              <ArrowRight size={20} />
            </button>
            <div className="join-divider">
              <span>already have a room?</span>
            </div>
            {joining ? (
              <form
                className="join-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void start(true)
                }}
              >
                <label className="sr-only" htmlFor="room-code">
                  7-character room code
                </label>
                <input
                  id="room-code"
                  className="code-input"
                  placeholder="ROOM CODE"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-F0-9]/g, '')
                        .slice(0, 7),
                    )
                  }
                  maxLength={7}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoFocus={Boolean(joinCode)}
                />
                <button
                  className="button secondary"
                  disabled={controller.busy || code.length !== 7 || (needsCaptcha && !token)}
                >
                  Join <ArrowRight size={18} />
                </button>
              </form>
            ) : (
              <button className="button secondary join-open" onClick={() => setJoining(true)}>
                <Link size={19} /> Join game
              </button>
            )}
            <p className="start-note">
              <Users size={14} /> 2 friends <span>·</span> No sign-up <span>·</span> Free to play
            </p>
            {!config.online && (
              <p className="preview-note">
                <span className="status-dot" /> Local preview · online setup pending
              </p>
            )}
          </div>
          {lastRoom && (
            <button className="resume-link" onClick={() => navigateRoom(lastRoom)}>
              Back to your last room <ArrowRight size={14} />
            </button>
          )}
        </section>
        <section className="hero-art" aria-label="Meet a few very questionable characters">
          <span className="art-spark spark-one" aria-hidden="true">
            ✳
          </span>
          <span className="art-spark spark-two" aria-hidden="true">
            ✧
          </span>
          <div className="art-orbit" />
          <div className="hero-portrait hero-portrait-back">
            <Portrait character={characters[2]!} />
            <span>
              Cleo <Heart size={15} />
            </span>
          </div>
          <div className="hero-portrait hero-portrait-front">
            <Portrait character={characters[1]!} />
            <span>
              Milo <span className="mini-question">?</span>
            </span>
          </div>
          <div className="question-bubble">
            <MessageCircle size={21} />
            <p>
              “Would they clap when
              <br />
              the plane lands?”
            </p>
            <span className="bubble-tail" />
          </div>
          <span className="yes-sticker">
            <Check size={22} /> oh, absolutely.
          </span>
          <div className="art-caption">
            <span className="curved-arrow" aria-hidden="true">
              ↖
            </span>{' '}
            You know the type.
          </div>
          <div className="party-stamp">
            TRUST YOUR
            <br />
            <strong>gut feeling.</strong>
            <Sparkles size={20} />
          </div>
        </section>
      </main>
      <section className="how-section" id="how-to-play">
        <div className="how-title">
          <span className="eyebrow">SMALL RULES. BIG OPINIONS.</span>
          <h2>It’s all in your head.</h2>
        </div>
        <div className="how-step">
          <span className="step-icon mint">
            <MousePointer2 size={24} />
            <b>01</b>
          </span>
          <h3>Pick your person.</h3>
          <p>Choose a secret face. Keep it to yourself.</p>
        </div>
        <div className="how-step">
          <span className="step-icon lilac">
            <MessageCircle size={24} />
            <b>02</b>
          </span>
          <h3>Ask about the vibes.</h3>
          <p>Take turns asking yes-or-no questions. Tap faces to rule them out.</p>
        </div>
        <div className="how-step">
          <span className="step-icon peach">
            <Sparkles size={24} />
            <b>03</b>
          </span>
          <h3>Make your call.</h3>
          <p>Guess their person to win. Get it wrong and they take the glory.</p>
        </div>
      </section>
      <footer className="site-footer">
        <span>Made for friends with strong opinions.</span>
        <a href="/?page=privacy">
          Privacy & the fine print <ArrowUpRight size={13} />
        </a>
        <span className="footer-mark">
          Stay subjective. <span aria-hidden="true">✳</span>
        </span>
      </footer>
    </>
  )
}

export function Privacy() {
  return (
    <>
      <header className="site-header">
        <Logo />
      </header>
      <main className="privacy-page">
        <p className="eyebrow">THE FINE PRINT</p>
        <h1>
          Your game.
          <br />
          <span>Your business.</span>
        </h1>
        <p>
          This game uses a persistent anonymous Supabase session so you can reconnect without an
          account. Your nickname, room membership, secret character, and question history are stored
          in the game database. Your opponent sees your secret only when the round ends.
        </p>
        <p>
          Room data expires after 24 hours of inactivity and is deleted by the configured hourly
          retention job. Previous rounds in an active room are capped at 20 by that job. Anonymous
          authentication records require a separate retention job; the deployment guide includes it.
        </p>
        <p>
          Your draft questions, eliminated faces, nickname, and last room stay in this browser.
          Local preview stores both seats and both secrets on this device. Reactions are ephemeral.
          We add no analytics, advertising, or tracking cookies. Supabase, Vercel, and a configured
          CAPTCHA provider process connection information needed to operate the service.
        </p>
        <p>
          Keep questions kind. Don’t put personal or sensitive information in your nickname or
          questions. This is a game about fictional illustrated characters.
        </p>
        {config.supportEmail ? (
          <p>
            For support or a data deletion request, email{' '}
            <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>. Include your room
            code and nickname so the operator can locate your data.
          </p>
        ) : (
          <p className="preview-note">
            The operator’s support contact is not configured. Add it before public launch.
          </p>
        )}
        <p>
          Font and icon credits are preserved in the{' '}
          <a href="/THIRD_PARTY_NOTICES.txt">third-party notices</a>.
        </p>
        <a className="button primary" href="/">
          Back to the game <ArrowRight size={18} />
        </a>
      </main>
    </>
  )
}
