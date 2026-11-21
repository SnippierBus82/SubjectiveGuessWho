import { useMemo } from 'react'
import { portraitSvg } from '../game/legacy/portraits'
import type { Character } from '../game/characters'
export default function LegacyPortrait({
  character,
  className = '',
}: {
  character: Character
  className?: string
}) {
  const image = useMemo(
    () =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(character.traits!, character.name))}`,
    [character],
  )
  return (
    <img
      className={`portrait ${className}`}
      src={image}
      alt={character.name}
      width="160"
      height="180"
      draggable="false"
    />
  )
}
