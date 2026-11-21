import { Check, X } from 'lucide-react'
import { lazy, memo, Suspense } from 'react'
import { characters } from '../game/legacy/characters'
import type { Character } from '../game/characters'
const LegacyPortrait = lazy(() => import('./LegacyPortrait'))

export function Portrait({
  character,
  className = '',
}: {
  character: Character
  className?: string
}) {
  if (character.traits)
    return (
      <Suspense fallback={<span className="portrait" aria-label="Loading portrait" />}>
        <LegacyPortrait character={character} className={className} />
      </Suspense>
    )
  return (
    <img
      className={`portrait ${className}`}
      src={character.image}
      alt={character.alt ?? character.name}
      width="160"
      height="180"
      draggable="false"
      decoding="async"
    />
  )
}
interface BoardProps {
  board?: Character[]
  inspect?: boolean
  onInspect?: (id: string) => void
  mode: 'select' | 'eliminate' | 'guess'
  selected: string | null
  eliminated: string[]
  disabled?: boolean
  onPick: (id: string) => void
}
export const CharacterBoard = memo(function CharacterBoard({
  board = characters,
  inspect = false,
  onInspect,
  mode,
  selected,
  eliminated,
  disabled,
  onPick,
}: BoardProps) {
  return (
    <div className={`character-grid mode-${mode}`} role="group" aria-label="24 character board">
      {board.map((character) => {
        const removed = mode !== 'select' && eliminated.includes(character.id)
        const chosen = selected === character.id && mode !== 'eliminate'
        return (
          <button
            key={character.id}
            className={`character-card ${removed ? 'eliminated' : ''} ${chosen ? 'selected' : ''}`}
            aria-label={`${character.name}${inspect ? ', inspect portrait' : mode === 'select' ? ', select as your secret' : mode === 'guess' ? ', make a final guess' : removed ? ', eliminated, tap to restore' : ', tap to eliminate'}`}
            aria-pressed={mode === 'eliminate' ? removed : chosen}
            disabled={disabled}
            onClick={() => (inspect ? onInspect?.(character.id) : onPick(character.id))}
            style={{ '--portrait-bg': character.color ?? '#eee7df' } as React.CSSProperties}
          >
            <span className="portrait-frame">
              <Portrait character={character} />
              {removed && (
                <span className="elimination-mark" aria-hidden="true">
                  <X size={28} strokeWidth={3} />
                </span>
              )}
              {chosen && (
                <span className="selection-mark" aria-hidden="true">
                  <Check size={18} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="character-name">{character.name}</span>
          </button>
        )
      })}
    </div>
  )
})
