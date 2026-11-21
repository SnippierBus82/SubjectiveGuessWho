import { useEffect, useState } from 'react'
import { Lightbulb, Shuffle } from 'lucide-react'
import { QUESTION_CATEGORIES, type QuestionCategory } from '../game/questions'
export function QuestionIdeas({
  onUse,
  focused,
}: {
  onUse: (text: string) => void
  focused: boolean
}) {
  const [category, setCategory] = useState<QuestionCategory>('Everyday')
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 25))
  useEffect(() => {
    const id = setInterval(() => {
      if (!focused && document.visibilityState === 'visible') setIndex((i) => (i + 1) % 25)
    }, 5000)
    return () => clearInterval(id)
  }, [focused])
  return (
    <div className="question-ideas">
      <div>
        <Lightbulb size={15} />
        <label className="sr-only" htmlFor="idea-category">
          Question category
        </label>
        <select
          id="idea-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as QuestionCategory)
            setIndex((i) => (i + 7) % 25)
          }}
        >
          {Object.keys(QUESTION_CATEGORIES).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label="Shuffle question ideas"
          onClick={() => setIndex((i) => (i + 1 + Math.floor(Math.random() * 24)) % 25)}
        >
          <Shuffle size={16} />
        </button>
      </div>
      <button
        type="button"
        className="idea-text"
        onClick={() => onUse(QUESTION_CATEGORIES[category][index]!)}
      >
        <span>{QUESTION_CATEGORIES[category][index]}</span>
        <small>Use idea ↗</small>
      </button>
    </div>
  )
}
