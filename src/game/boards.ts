import catalog from '../../.generated/boards.json' with { type: 'json' }
import { AI_BOARD, sample, type BoardCatalog, type Character } from './board-model'
import names from './neutral-names.json' with { type: 'json' }

export type BoardId = string
export const DEFAULT_BOARD = AI_BOARD
export const FACE_SOURCE = 'https://huggingface.co/datasets/RichardErkhov/OneMillionFaces'
export const folderBoards = (catalog as BoardCatalog).boards
export const BOARDS = [
  {
    id: AI_BOARD,
    name: 'Random AI faces',
    kind: 'ai' as const,
    shuffle: true,
    description:
      '24 random faces from OneMillionFaces. Online first, saved faces only when the source is unavailable.',
  },
  ...folderBoards.map((board) => ({
    ...board,
    shuffle: true,
    description: `${board.characters.length} images · 24 selected for each game.`,
  })),
]
export const isBoardId = (value: unknown): value is string =>
  typeof value === 'string' && BOARDS.some((board) => board.id === value)
export const boardInfo = (id?: string) => BOARDS.find((board) => board.id === id) ?? BOARDS[0]!
export function previewBoard(id: string): Character[] {
  const folder = folderBoards.find((board) => board.id === id)
  if (folder) return folder.characters.slice(0, 4)
  return (catalog as BoardCatalog).cache.slice(0, 4).map((face, i) => ({
    ...face,
    name: names[i]!,
  }))
}
export function selectFolderBoard(id: string): Character[] {
  const folder = folderBoards.find((board) => board.id === id)
  if (!folder) throw new Error('Choose an available image board.')
  return sample(folder.characters, 24)
}
