import type { ImageCharacter } from './board-model'
import type { PortraitTraits } from './legacy/portraits'

export interface Character extends ImageCharacter {
  // Read-only compatibility fields in already-saved games. New boards use id/name/image.
  color?: string
  alt?: string
  rendererVersion?: 1
  traits?: PortraitTraits
}
