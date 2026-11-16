import { Check, X } from 'lucide-react'
import { memo } from 'react'
import { characters, type Character } from '../game/characters'

export function Portrait({
  character,
  className = '',
}: {
  character: Character
  className?: string
}) {
  return (
    <img
      className={`portrait ${className}`}
      src={character.image}
      alt={character.name}
      width="160"
      height="180"
      draggable="false"
    />
  )
}
interface BoardProps {
  mode: 'select' | 'eliminate' | 'guess'
  selected: string | null
  eliminated: string[]
  disabled?: boolean
  onPick: (id: string) => void
}
export const CharacterBoard = memo(function CharacterBoard({
  mode,
  selected,
  eliminated,
  disabled,
  onPick,
}: BoardProps) {
  return (
    <div
      className={`character-grid mode-${mode}`}
      role="group"
      aria-label="The original 24 character board"
    >
      {characters.map((character) => {
        const removed = mode !== 'select' && eliminated.includes(character.id)
        const chosen = selected === character.id && mode !== 'eliminate'
        return (
          <button
            key={character.id}
            className={`character-card ${removed ? 'eliminated' : ''} ${chosen ? 'selected' : ''}`}
            aria-label={`${character.name}${mode === 'select' ? ', select as your secret' : mode === 'guess' ? ', make a final guess' : removed ? ', eliminated, tap to restore' : ', tap to eliminate'}`}
            aria-pressed={mode === 'eliminate' ? removed : chosen}
            disabled={disabled}
            onClick={() => onPick(character.id)}
            style={{ '--portrait-bg': character.color } as React.CSSProperties}
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
