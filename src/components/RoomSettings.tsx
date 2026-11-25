import { ChevronDown } from 'lucide-react'
import { paceName, ROOM_PACES, TIMER_OPTIONS, timeLabel } from '../game/timings'
import type { Timings } from '../game/types'
export function RoomSettings({
  value,
  onChange,
}: {
  value: Timings
  onChange: (value: Timings) => void
}) {
  const activePace = paceName(value)
  return (
    <div className="room-settings">
      <fieldset className="pace-options">
        <legend>Choose your pace</legend>
        <div className="pace-buttons">
          {Object.entries(ROOM_PACES).map(([name, timings]) => (
            <button
              key={name}
              type="button"
              aria-pressed={activePace === name}
              onClick={() => onChange({ ...timings })}
            >
              {name}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="advanced-timers">
        <summary>
          Advanced settings <ChevronDown size={17} aria-hidden="true" />
        </summary>
        {(['question', 'answer', 'review'] as const).map((key) => (
          <label key={key}>
            <span>
              {key === 'question'
                ? 'Write a question'
                : key === 'answer'
                  ? 'Answer'
                  : 'Review the board'}
            </span>
            <select
              aria-label={`${key} time`}
              value={value[key] ?? 'unlimited'}
              onChange={(e) => {
                const next = {
                  ...value,
                  [key]: e.target.value === 'unlimited' ? null : Number(e.target.value),
                }
                if (next.question !== null && next.review !== null && next.review > next.question)
                  next.review = next.question
                onChange(next)
              }}
            >
              {TIMER_OPTIONS[key]
                .filter((n) => key !== 'review' || value.question === null || n <= value.question)
                .map((n) => (
                  <option key={n} value={n}>
                    {timeLabel(n)}
                  </option>
                ))}
              <option value="unlimited">Unlimited</option>
            </select>
          </label>
        ))}
      </details>
    </div>
  )
}
