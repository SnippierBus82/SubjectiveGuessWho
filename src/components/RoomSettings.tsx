import { TIMER_OPTIONS, timeLabel } from '../game/timings'
import type { Timings } from '../game/types'
export function RoomSettings({
  value,
  onChange,
}: {
  value: Timings
  onChange: (value: Timings) => void
}) {
  return (
    <fieldset className="room-settings">
      <legend>Choose your pace</legend>
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
    </fieldset>
  )
}
