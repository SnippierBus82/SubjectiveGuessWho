export const AI_BOARD = 'ai-random'
export interface Character {
  id: string
  name: string
  image: string
}
export interface FolderBoard {
  id: string
  name: string
  kind: 'folder'
  version: string
  characters: Character[]
}
export interface BoardCatalog {
  boards: FolderBoard[]
  cache: { id: string; image: string }[]
}
export function sample<T>(
  items: readonly T[],
  count: number,
  random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296,
): T[] {
  if (items.length < count) throw new Error(`Need at least ${count} entries.`)
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result.slice(0, count)
}
