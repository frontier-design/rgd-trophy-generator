import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import {
  enterAt,
  insertText,
  joinWithNext,
  joinWithPrevious,
  DEFAULT_LINE_HOLD,
  LINE_HOLD_RANGE,
  LINE_SPEED_RANGE,
  lineHold,
  TRACKING_RANGE,
  type Caret,
  type LineEdit,
  type TextLine,
} from './textLines'

interface TextLinesFieldProps {
  lines: TextLine[]
  onChange: (lines: TextLine[]) => void
}

/** A compact slider in the sidebar's style (line to a tick, dots after, value on hover). */
function LineSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const fill = Math.min(1, Math.max(0, (value - min) / (max - min)))
  return (
    <div className="range-wrap text-line-slider" style={{ '--fill': fill } as CSSProperties}>
      <input
        type="range"
        className="control-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <output className="control-value">
        {Number.isInteger(step) ? value : value.toFixed(2)}
        {unit}
      </output>
    </div>
  )
}

/**
 * A text node's text, one input per line, editing like one textarea: Enter at a line's end
 * goes to the next line (making one after the last), elsewhere splits the line; Backspace
 * at a line's start and Delete at its end join lines; the arrow keys cross between lines;
 * pasting several lines makes new ones. Beside each line, its typing speed; its chevron
 * unfolds its formatting (tracking).
 */
export function TextLinesField({ lines, onChange }: TextLinesFieldProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  // Where the caret goes once an edit across lines has rendered.
  const pending = useRef<Caret | null>(null)
  // Which lines' formatting is unfolded (view-only, by line).
  const [open, setOpen] = useState<boolean[]>([])

  useLayoutEffect(() => {
    const caret = pending.current
    if (!caret) return
    pending.current = null
    const input = inputs.current[caret.line]
    if (!input) return
    input.focus()
    input.setSelectionRange(caret.offset, caret.offset)
  })

  const moveTo = (line: number, offset: number) => {
    const input = inputs.current[line]
    if (!input) return
    const at = Math.min(offset, input.value.length)
    input.focus()
    input.setSelectionRange(at, at)
  }
  /** Applies an edit across lines; `at` is where lines were added (count > 0) or removed. */
  const apply = (edit: LineEdit, at: number) => {
    const added = edit.lines.length - lines.length
    setOpen((current) => {
      const next = [...current]
      if (added > 0) next.splice(at + 1, 0, ...Array<boolean>(added).fill(false))
      else if (added < 0) next.splice(at, -added)
      return next
    })
    pending.current = edit.caret
    onChange(edit.lines)
  }
  const setLine = (index: number, patch: Partial<TextLine>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    const input = e.currentTarget
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? start
    const collapsed = start === end
    const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        apply(
          collapsed ? enterAt(lines, index, start) : insertText(lines, index, start, end, '\n'),
          index,
        )
        return
      case 'Backspace':
        if (collapsed && start === 0 && index > 0) {
          e.preventDefault()
          apply(joinWithPrevious(lines, index)!, index)
        }
        return
      case 'Delete':
        if (collapsed && end === input.value.length && index < lines.length - 1) {
          e.preventDefault()
          apply(joinWithNext(lines, index)!, index + 1)
        }
        return
      case 'ArrowUp':
        if (plain && index > 0) {
          e.preventDefault()
          moveTo(index - 1, start)
        }
        return
      case 'ArrowDown':
        if (plain && index < lines.length - 1) {
          e.preventDefault()
          moveTo(index + 1, start)
        }
        return
      case 'ArrowLeft':
        if (plain && collapsed && start === 0 && index > 0) {
          e.preventDefault()
          moveTo(index - 1, Infinity)
        }
        return
      case 'ArrowRight':
        if (plain && collapsed && end === input.value.length && index < lines.length - 1) {
          e.preventDefault()
          moveTo(index + 1, 0)
        }
        return
    }
  }
  const onPaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\r\n]/.test(text)) return
    e.preventDefault()
    const input = e.currentTarget
    const start = input.selectionStart ?? input.value.length
    apply(insertText(lines, index, start, input.selectionEnd ?? start, text), index)
  }

  return (
    <div className="text-lines node-card-wide" role="group" aria-label="Text">
      {lines.map((line, i) => {
        const number = i + 1
        const unfolded = open[i] ?? false
        return (
          <div key={i} className="text-line" data-open={unfolded || undefined}>
            <button
              type="button"
              className="text-line-fold"
              aria-label={`line ${number} formatting`}
              aria-expanded={unfolded}
              onClick={() =>
                setOpen((current) => {
                  const next = [...current]
                  next[i] = !unfolded
                  return next
                })
              }
            >
              ›
            </button>
            <input
              ref={(el) => {
                inputs.current[i] = el
              }}
              type="text"
              className="control-text text-line-input"
              aria-label={`line ${number}`}
              spellCheck={false}
              value={line.text}
              style={{ letterSpacing: `${line.tracking / 1000}em` }}
              onChange={(e) => setLine(i, { text: e.target.value.replace(/[\r\n]/g, ' ') })}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={(e) => onPaste(i, e)}
            />
            <LineSlider
              label={`line ${number} speed`}
              value={line.speed}
              {...LINE_SPEED_RANGE}
              unit="/s"
              onChange={(speed) => setLine(i, { speed })}
            />
            {unfolded && (
              <div className="text-line-format">
                <span className="text-line-format-label">Tracking</span>
                <LineSlider
                  label={`line ${number} tracking`}
                  value={line.tracking}
                  {...TRACKING_RANGE}
                  unit=""
                  onChange={(tracking) => setLine(i, { tracking })}
                />
                <label className="text-line-format-label text-line-hold">
                  <input
                    type="checkbox"
                    aria-label={`line ${number} hold`}
                    checked={lineHold(line) > 0}
                    onChange={(e) => {
                      const { hold: _, ...rest } = line
                      onChange(
                        lines.map((item, j) =>
                          j === i
                            ? e.target.checked
                              ? { ...rest, hold: DEFAULT_LINE_HOLD }
                              : rest
                            : item,
                        ),
                      )
                    }}
                  />
                  Hold
                </label>
                {lineHold(line) > 0 ? (
                  <LineSlider
                    label={`line ${number} hold time`}
                    value={lineHold(line)}
                    {...LINE_HOLD_RANGE}
                    unit=" s"
                    onChange={(hold) => setLine(i, { hold })}
                  />
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
