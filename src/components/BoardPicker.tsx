import { BOARDS, previewBoard, boardInfo, FACE_SOURCE, type BoardId } from '../game/boards'
import { Portrait } from './CharacterBoard'
import { useMemo } from 'react'

export function BoardPicker({
  value,
  onChange,
}: {
  value: BoardId
  onChange: (id: BoardId) => void
}) {
  const board = boardInfo(value)
  const preview = useMemo(() => previewBoard(value), [value])
  return (
    <fieldset className="board-picker">
      <legend>Your board</legend>
      <label className="sr-only" htmlFor="board-choice">
        Board
      </label>
      <select
        id="board-choice"
        value={value}
        onChange={(e) => onChange(e.target.value as BoardId)}
        aria-describedby="board-description"
      >
        {BOARDS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <div className="board-picker-preview" aria-hidden="true">
        {preview.map((face) => (
          <Portrait key={face.id} character={face} />
        ))}
        {board.shuffle && <span className="board-shuffle-badge">Shuffle</span>}
      </div>
      <p id="board-description">24 faces. A fresh board each game.</p>
      {board.kind === 'ai' && (
        <small>
          Fictional people ·{' '}
          <a href={FACE_SOURCE} target="_blank" rel="noreferrer">
            OneMillionFaces
          </a>{' '}
          · MIT
        </small>
      )}
    </fieldset>
  )
}
