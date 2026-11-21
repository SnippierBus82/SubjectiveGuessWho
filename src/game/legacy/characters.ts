// These definitions are kept for saved games created before folder boards.
import { BACKGROUNDS, NAMES, traitsFor, type PortraitTraits } from './portraits'

export interface Character {
  id: string
  name: string
  color?: string
  image: string
  alt?: string
  rendererVersion?: 1
  traits?: PortraitTraits
}
export const characters: Character[] = [
  ['amara', 'Amara', '#ffc4ad'],
  ['milo', 'Milo', '#c5e7ce'],
  ['cleo', 'Cleo', '#d8c9f3'],
  ['jasper', 'Jasper', '#f7d38b'],
  ['olive', 'Olive', '#f6e7a6'],
  ['theo', 'Theo', '#bedfed'],
  ['zara', 'Zara', '#d7c1ee'],
  ['felix', 'Felix', '#b8dac1'],
  ['luna', 'Luna', '#bbe6de'],
  ['nico', 'Nico', '#cdd5e9'],
  ['priya', 'Priya', '#f1c7a7'],
  ['hugo', 'Hugo', '#d3c3e2'],
  ['iris', 'Iris', '#f4cad7'],
  ['oscar', 'Oscar', '#c9dfb4'],
  ['bea', 'Bea', '#c5dfe8'],
  ['max', 'Max', '#f3c69d'],
  ['esme', 'Esme', '#e5c9d6'],
  ['leo', 'Leo', '#f4df99'],
  ['ruby', 'Ruby', '#c6d9c1'],
  ['otto', 'Otto', '#d5d7ed'],
  ['mae', 'Mae', '#efc4af'],
  ['ezra', 'Ezra', '#cedfbc'],
  ['june', 'June', '#d5c8e8'],
  ['arlo', 'Arlo', '#bfded6'],
].map(([id, name, color]) => ({
  id: id!,
  name: name!,
  color: color!,
  image: `/characters/${id}.svg`,
}))
export const characterById = (id: string | null | undefined) => characters.find((c) => c.id === id)

export function generateBoard(seed: number): Character[] {
  return Array.from({ length: 24 }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    name: NAMES[(i + (seed % 24)) % 24]!,
    color: BACKGROUNDS[(i + seed) % 6]!,
    image: '',
    rendererVersion: 1,
    traits: traitsFor(seed, i),
  }))
}
