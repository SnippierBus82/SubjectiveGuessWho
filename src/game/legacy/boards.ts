import { generateBoard, type Character } from './characters'
import faces from './face-pool.json' with { type: 'json' }

export const DEFAULT_BOARD = 'generated-v1'
export type BoardId = 'generated-v1' | 'million-faces-v1' | 'million-faces-shuffle-v1'
export const FACE_SOURCE = 'https://huggingface.co/datasets/RichardErkhov/OneMillionFaces'
// Stable IDs are stored on the room. Add future packs here and in an additive migration.
export const BOARDS = [
  {
    id: 'generated-v1',
    name: 'Standard illustrations',
    kind: 'illustrated',
    shuffle: true,
    description: 'A fresh cast of 24 illustrated characters for every game.',
  },
  {
    id: 'million-faces-v1',
    name: 'Realistic faces',
    kind: 'synthetic-photo',
    shuffle: false,
    description: 'Meet a fixed cast of 24 realistic, AI-generated faces.',
  },
  {
    id: 'million-faces-shuffle-v1',
    name: 'Realistic faces · shuffle',
    kind: 'synthetic-photo',
    shuffle: true,
    description: 'A random 24 from 144 portraits. A new cast with each rematch.',
  },
] as const
export const isBoardId = (value: unknown): value is BoardId => BOARDS.some((b) => b.id === value)
export const boardInfo = (id?: string) => BOARDS.find((b) => b.id === id) ?? BOARDS[0]

function rank(seed: number, index: number) {
  const x = BigInt(
    (((seed + (index + 1) * 104729 + 41 * 15485863) % 2147483647) * 48271) % 2147483647,
  )
  return Number((x * x) % 2147483647n)
}
export function boardFor(id: BoardId, seed: number): Character[] {
  if (id === DEFAULT_BOARD) return generateBoard(seed)
  const selected =
    id === 'million-faces-v1'
      ? faces.slice(0, 24)
      : faces
          .map((face, i) => ({ face, score: rank(seed, i), i }))
          .sort((a, b) => a.score - b.score || a.i - b.i)
          .slice(0, 24)
          .map((entry) => entry.face)
  return selected.map((face) => ({ ...face }))
}
