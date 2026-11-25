import { ArrowRight } from 'lucide-react'
import { config } from '../lib/config'
import { Logo } from './Home'

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
          account. You can also create an email and password account to use your profile on other
          devices. Supabase Auth handles your email, password verification and sessions. Your player
          name, avatar and chosen board are stored in your account metadata. Your email is not
          shared with other players. Your nickname, room membership, secret character, and question
          history are stored in the game database. Your opponent sees your secret only when the
          round ends.
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
          questions. This is a game about fictional characters, including AI-generated portraits.
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
        <p>
          Realistic portraits come from{' '}
          <a href="https://huggingface.co/datasets/RichardErkhov/OneMillionFaces">
            RichardErkhov / OneMillionFaces
          </a>
          , labeled MIT by its publisher. These are AI-generated faces with fictional names. Images
          are served by this app; we do not send your photo or game activity to Hugging Face. See
          the{' '}
          <a href="/fallback-faces/NOTICE.txt">portrait source and license notice</a>.
        </p>
        <a className="button primary" href="/">
          Back to the game <ArrowRight size={18} />
        </a>
      </main>
    </>
  )
}
