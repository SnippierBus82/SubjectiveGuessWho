import { DEFAULT_BOARD, isBoardId } from '../game/boards'
import { storage } from './platform'

export const AVATARS = ['🙂', '🦊', '🐸', '🐻', '🐱', '🐼'] as const
export interface Profile {
  name: string
  avatar: string
  boardId: string
}
export function normalizeProfile(value: Partial<Profile> | null | undefined): Profile {
  return {
    name: typeof value?.name === 'string' ? value.name.slice(0, 18).trim() : '',
    avatar: AVATARS.some((avatar) => avatar === value?.avatar) ? value!.avatar! : AVATARS[0],
    boardId: isBoardId(value?.boardId) ? value.boardId : DEFAULT_BOARD,
  }
}
export function readProfile(): Profile {
  return normalizeProfile(
    storage.read<Partial<Profile>>('profile', {
      name: storage.read<string>('nickname', ''),
      boardId: storage.read<string>('board-choice', DEFAULT_BOARD),
    }),
  )
}
export function storeProfile(profile: Profile) {
  const saved = storage.write('profile', profile)
  storage.write('nickname', profile.name)
  storage.write('board-choice', profile.boardId)
  return saved
}
