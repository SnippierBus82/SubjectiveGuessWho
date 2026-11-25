import { useState } from 'react'
import { ChevronLeft, Shuffle } from 'lucide-react'
import { PLAYABLE_QUESTION_CATEGORIES as categories } from '../game/questions'
import { Sheet } from './Sheet'

export function QuestionIdeas({
  open,
  onUse,
  onClose,
}: {
  open: boolean
  onUse: (text: string) => void
  onClose: () => void
}) {
  const [history, setHistory] = useState([{ category: 0, index: 0 }])
  if (!open) return null

  const { category, index } = history.at(-1)!
  const questions = categories[category]?.questions ?? []
  const question = questions[index]

  function shuffle() {
    const offset = 1 + Math.floor(Math.random() * (questions.length - 1))
    setHistory((current) => [...current, { category, index: (index + offset) % questions.length }])
  }

  return (
    <Sheet title="Question ideas" onClose={onClose}>
      {question ? (
        <div className="question-ideas">
          <label className="sr-only" htmlFor="idea-category">
            Question category
          </label>
          <select
            id="idea-category"
            value={category}
            onChange={(e) => {
              const next = { category: Number(e.target.value), index: 0 }
              setHistory((current) => [...current, next])
            }}
          >
            {categories.map(({ name }, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="idea-text" onClick={() => onUse(question)}>
            <span>{question}</span>
            <small>Use question</small>
          </button>
          <div className="idea-controls">
            <button
              type="button"
              disabled={history.length < 2}
              onClick={() => setHistory(history.slice(0, -1))}
            >
              <ChevronLeft size={18} /> Previous
            </button>
            <button type="button" disabled={questions.length < 2} onClick={shuffle}>
              <Shuffle size={17} /> Shuffle
            </button>
          </div>
        </div>
      ) : (
        <p>No question ideas available.</p>
      )}
    </Sheet>
  )
}
