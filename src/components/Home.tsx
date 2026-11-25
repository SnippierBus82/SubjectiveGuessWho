import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  Gamepad2,
  HelpCircle,
  Layers3,
  Link,
  Plus,
  Settings2,
  Shuffle,
  UserRound,
  Users,
} from 'lucide-react'
import { config } from '../lib/config'
import { navigatePage, navigateRoom, storage, type AppPage } from '../lib/platform'
import { useProfile } from '../hooks/useProfile'
import type { GameController } from '../hooks/useGame'
import { DEFAULT_TIMINGS, paceName } from '../game/timings'
import { boardInfo, previewBoard } from '../game/boards'
import { LogoMark } from './LogoMark'
import { Portrait } from './CharacterBoard'
import { RoomSettings } from './RoomSettings'
import { BoardPicker } from './BoardPicker'
import { BoardCollection } from './BoardCollection'
import { ProfilePage } from './ProfilePage'
import { Sheet } from './Sheet'
import { Captcha } from './Captcha'
export { Privacy } from './Privacy'

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="brand"
      onClick={onClick ?? (() => navigatePage('play'))}
      aria-label="Subjective Guess Who home"
    >
      <span className="brand-icon" aria-hidden="true">
        <LogoMark />
      </span>
      <span>
        Subjective
        <span className="brand-bottom">
          Guess Who<span className="brand-dot">.</span>
        </span>
      </span>
    </button>
  )
}

export function Home({
  controller,
  joinCode,
  page,
}: {
  controller: GameController
  joinCode: string
  page: AppPage
}) {
  const account = useProfile()
  const { profile } = account
  const [name, setName] = useState(profile.name)
  const [code, setCode] = useState(joinCode)
  const [token, setToken] = useState('')
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [settings, setSettings] = useState(DEFAULT_TIMINGS)
  const [help, setHelp] = useState(false)
  const [nameError, setNameError] = useState('')
  const boardId = profile.boardId
  const faces = previewBoard(boardId)
  const setup = page === 'create' || page === 'join' || page === 'find'
  const tab = page === 'boards' || page === 'profile' ? page : 'play'
  const needsCaptcha = config.online && Boolean(config.captchaKey) && !controller.hasSession
  useEffect(() => {
    setName(profile.name)
  }, [profile.name])
  useEffect(() => {
    setCode(joinCode)
  }, [joinCode])
  useEffect(() => {
    window.scrollTo(0, 0)
    setToken('')
    setCaptchaAttempt((n) => n + 1)
    setNameError('')
  }, [page])
  async function start() {
    if (!name.trim()) {
      setNameError('Choose a name to play.')
      document.getElementById('nickname')?.focus()
      return
    }
    if (!(await account.save({ ...profile, name: name.trim() }))) return
    const success =
      page === 'join'
        ? await controller.join(code, name.trim(), token)
        : page === 'find'
          ? await controller.findPlayer(name.trim(), token, boardId)
          : await controller.create(name.trim(), token, settings, boardId)
    if (!success) {
      setToken('')
      setCaptchaAttempt((n) => n + 1)
    }
  }
  const disabled =
    controller.busy ||
    account.busy ||
    account.loading ||
    config.incomplete ||
    (needsCaptcha && !token)
  const navigation = [
    { id: 'play' as const, label: 'Play', icon: Gamepad2 },
    { id: 'boards' as const, label: 'Boards', icon: Layers3 },
    { id: 'profile' as const, label: 'Profile', icon: UserRound },
  ]
  return (
    <div className="game-shell">
      <aside className="app-sidebar">
        <Logo />
        <p className="sidebar-caption">A little guess. A lot of fun.</p>
        <nav aria-label="Main navigation" className="app-tabs">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              disabled={Boolean(controller.search)}
              onClick={() => navigatePage(id)}
            >
              <Icon size={25} strokeWidth={tab === id ? 2.5 : 1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LogoMark />
          <b>Trust your gut.</b>
          <span>Keep it kind. Keep it fun.</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <Logo />
          <span className="app-header-label">
            {tab === 'play'
              ? 'THE GUESSING GAME'
              : tab === 'boards'
                ? 'YOUR COLLECTION'
                : 'YOUR PLAYER'}
          </span>
          <button
            className="player-chip"
            aria-label="Open your profile"
            disabled={Boolean(controller.search)}
            onClick={() => navigatePage('profile')}
          >
            <span aria-hidden="true">{profile.avatar}</span>
            <b>{profile.name || 'Your profile'}</b>
          </button>
        </header>
        <main className={`app-content ${setup ? 'setup-screen' : ''}`} key={page}>
          {controller.search ? (
            <section className="search-screen">
              <div className="search-faces">
                <Portrait character={faces[0]!} />
                <span>
                  <Shuffle />
                </span>
                <Portrait character={faces[1]!} />
              </div>
              <p className="screen-kicker">QUICK MATCH</p>
              <h1>Finding a player…</h1>
              <p role="status">Looking for another player. Hang tight!</p>
              <span className="soft-chip">{boardInfo(controller.search.boardId).name}</span>
              <button
                className="button secondary"
                disabled={controller.busy}
                onClick={async () => {
                  if (await controller.cancelSearch()) navigatePage('play')
                }}
              >
                Cancel search
              </button>
            </section>
          ) : page === 'profile' ? (
            <ProfilePage account={account} onSessionChange={controller.refreshSession} />
          ) : page === 'boards' ? (
            <BoardCollection
              value={boardId}
              busy={account.busy || account.loading}
              onChoose={async (id) => {
                if (await account.save({ ...profile, boardId: id })) navigatePage('play')
              }}
            />
          ) : setup ? (
            <>
              <button className="back-button" onClick={() => navigatePage('play')}>
                <ChevronLeft size={23} /> Play
              </button>
              <div className="screen-heading">
                <p className="screen-kicker">
                  {page === 'join'
                    ? 'GOT A CODE?'
                    : page === 'find'
                      ? 'MEET YOUR MATCH'
                      : 'YOU’RE THE HOST'}
                </p>
                <h1>
                  {page === 'join'
                    ? 'Join a game.'
                    : page === 'find'
                      ? 'Find a player.'
                      : 'Create a game.'}
                </h1>
                <p>
                  {page === 'join'
                    ? 'Enter the code your friend shared.'
                    : page === 'find'
                      ? 'We’ll find someone to play with.'
                      : 'Pick a board. Invite a friend.'}
                </p>
              </div>
              <form
                className="setup-card"
                onSubmit={(event) => {
                  event.preventDefault()
                  void start()
                }}
                noValidate
              >
                <label className="input-label" htmlFor="nickname">
                  Your name
                </label>
                <input
                  id="nickname"
                  aria-label="Your name. What should your friend call you?"
                  value={name}
                  autoComplete="nickname"
                  maxLength={18}
                  placeholder="What should we call you?"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? 'name-error' : undefined}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameError('')
                  }}
                />
                {nameError && (
                  <p id="name-error" className="field-error" role="alert">
                    {nameError}
                  </p>
                )}
                {page === 'join' ? (
                  <>
                    <label className="input-label" htmlFor="room-code">
                      Room code
                    </label>
                    <input
                      id="room-code"
                      className="code-input"
                      aria-label="7-character room code"
                      value={code}
                      placeholder="ABC1234"
                      autoComplete="off"
                      autoCapitalize="characters"
                      maxLength={7}
                      onChange={(event) =>
                        setCode(
                          event.target.value
                            .toUpperCase()
                            .replace(/[^A-F0-9]/g, '')
                            .slice(0, 7),
                        )
                      }
                    />
                  </>
                ) : (
                  <BoardPicker
                    value={boardId}
                    onChange={(id) => void account.save({ ...profile, boardId: id })}
                  />
                )}
                {page === 'create' && (
                  <details className="settings-disclosure">
                    <summary>
                      <Settings2 size={18} /> Room settings
                      <strong className="soft-chip">{paceName(settings)}</strong>
                    </summary>
                    <RoomSettings value={settings} onChange={setSettings} />
                  </details>
                )}
                {needsCaptcha && <Captcha key={captchaAttempt} onToken={setToken} />}
                <button
                  className="button primary setup-submit"
                  type="submit"
                  disabled={disabled || (page === 'join' && code.length !== 7)}
                >
                  {page === 'join' ? (
                    <Link size={23} />
                  ) : page === 'find' ? (
                    <Shuffle size={23} />
                  ) : (
                    <Plus size={23} />
                  )}
                  {controller.busy
                    ? 'Getting ready…'
                    : page === 'join'
                      ? 'Join'
                      : page === 'find'
                        ? 'Find a player'
                        : 'Create game'}
                </button>
                {!config.online && (
                  <p className="device-note">Local preview · both players use this device</p>
                )}
              </form>
            </>
          ) : (
            <>
              <div className="screen-heading play-heading">
                <div>
                  <p className="screen-kicker">
                    {profile.name ? `HEY, ${profile.name.toUpperCase()}!` : 'GOOD TO SEE YOU'}
                  </p>
                  <h1>Let’s play.</h1>
                  <p>One friend. One secret face.</p>
                </div>
                <button
                  className="help-button"
                  aria-label="How to play"
                  onClick={() => setHelp(true)}
                >
                  <HelpCircle size={24} />
                </button>
              </div>
              <section className="game-hero" aria-label="24 faces. One secret person.">
                <div className="game-hero-copy">
                  <span className="hero-game-badge">
                    <Users size={16} /> 2 players
                  </span>
                  <h2>
                    Who’s their
                    <br />
                    secret person?
                  </h2>
                  <span className="hero-bottom-note">
                    <span /> Guess it. Win it.
                  </span>
                </div>
                <div className="hero-face-stack" aria-hidden="true">
                  {previewBoard('folder/Neighborhood').map((face, index) => (
                    <div className={`hero-portrait face-${index}`} key={face.id}>
                      <Portrait character={face} />
                      <span>{index === 1 ? '?' : face.name}</span>
                    </div>
                  ))}
                </div>
                <span className="hero-spark" aria-hidden="true">
                  ✦
                </span>
              </section>
              <div className="play-choices">
                <button
                  className="play-choice choice-create"
                  aria-label="Create game"
                  onClick={() => navigatePage('create')}
                >
                  <span className="choice-icon">
                    <Plus size={30} />
                  </span>
                  <strong>Create game</strong>
                  <span>Invite your friend</span>
                </button>
                <button
                  className="play-choice choice-join"
                  aria-label="Join game"
                  onClick={() => navigatePage('join')}
                >
                  <span className="choice-icon">
                    <Link size={29} />
                  </span>
                  <strong>Join game</strong>
                  <span>Use a room code</span>
                </button>
              </div>
              {config.online && (
                <button
                  className="quick-match"
                  aria-label="Find a player"
                  onClick={() => navigatePage('find')}
                >
                  <Shuffle size={22} />
                  <span>
                    <b>Find a player</b>
                    <small>Ready for someone new?</small>
                  </span>
                  <span className="soft-chip">Quick match</span>
                </button>
              )}
              {!config.online && (
                <p className="device-note">Local preview · play both seats on this device</p>
              )}
              {storage.read<string>('last-room', '') && (
                <button
                  className="resume-link"
                  onClick={() => navigateRoom(storage.read<string>('last-room', ''))}
                >
                  Rejoin your last game
                </button>
              )}
            </>
          )}
          {account.error && page !== 'profile' && (
            <p className="form-error" role="alert">
              {account.error}
            </p>
          )}
        </main>
      </div>
      {help && (
        <Sheet title="How to play" onClose={() => setHelp(false)}>
          <div className="simple-rules">
            <div>
              <span>🤫</span>
              <h3>Pick a secret face</h3>
              <p>Keep it a secret from your opponent.</p>
            </div>
            <div>
              <span>💬</span>
              <h3>Ask yes-or-no questions</h3>
              <p>Tap faces to rule them out.</p>
            </div>
            <div>
              <span>🎯</span>
              <h3>Guess their person</h3>
              <p>Have one final guess to win!</p>
            </div>
          </div>
          <button className="button primary" onClick={() => setHelp(false)}>
            Got it. Let’s play!
          </button>
        </Sheet>
      )}
    </div>
  )
}
