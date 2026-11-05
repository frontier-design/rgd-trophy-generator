import type { CSSProperties, Ref } from 'react'
import type { LineReveal } from '../../rag'
import type { LineBox, LineMeasure, Settings, ShapeExtent, TextAlign } from '../../types'

interface RagEditorProps {
  /** The editor's root element (the outline's origin is its top-left corner). */
  ref?: Ref<HTMLDivElement>
  settings: Settings
  lines: LineMeasure[]
  /** Lines left-aligned or centered (the mirror's too). */
  align?: TextAlign
  /** One box per line (rag/lineBoxes). They also decide the rag shape (PaperCanvas). */
  boxes: LineBox[]
  /** Each line's baseline in px from the top (rag/lineBaseline), drawn as guides. */
  baselines: number[]
  /** The rag shape's region; the edge guide spans it. */
  extent: ShapeExtent | null
  /** Show a right-aligned copy of the text reflected across the edge (read-only). */
  mirror: boolean
  /** During the stack-in reveal: whether each line shows, and its slide offset
   *  (rag/stackReveal); null = all in place. */
  reveals?: LineReveal[] | null
  onTextChange: (text: string) => void
  /** Show the debug overlay (line boxes, width labels, baselines, right-edge guide).
   *  Hidden via opacity, not removed. */
  debug: boolean
}

/**
 * The text block is itself the editor: a borderless textarea styled with exactly the
 * font, size, line height and column width that Pretext measures with, so the browser
 * wraps it the same way.
 *
 * Behind it, PaperCanvas draws the rag shape from the same LineBox data the debug overlay
 * draws, so boxes and shape always match. The overlay also shows each line's measured
 * width in px at the line's top left, and a magenta guide on the right edge (the revolve
 * axis).
 *
 * Styling lives in styles/global.css; this component only sets CSS variables.
 */
export function RagEditor({
  ref,
  settings,
  lines,
  align = 'left',
  boxes,
  baselines,
  extent,
  mirror,
  reveals = null,
  onTextChange,
  debug,
}: RagEditorProps) {
  // Pretext emits no empty line for a trailing "\n", but the textarea puts the caret there.
  const rows = Math.max(1, lines.length + (settings.text.endsWith('\n') ? 1 : 0))

  const vars = {
    '--rag-font-family': `"${settings.fontFamily}"`,
    '--rag-font-size': `${settings.fontSize}px`,
    '--rag-font-weight': settings.fontWeight,
    '--rag-line-height': `${settings.lineHeight}px`,
    '--rag-column-width': `${settings.columnWidth}px`,
    '--rag-rows': rows,
    // The edge guide spans the shape: from the top band to the last baseline.
    '--edge-top': `${extent?.top ?? 0}px`,
    '--edge-bottom': `${extent?.bottom ?? rows * settings.lineHeight}px`,
  } as CSSProperties
  // While revealing: a line shows only once it has appeared, moved by its slide offset
  // (mirrored: from the right). Typed, the mirror's line moves so its typed letters end at
  // the reflected edge, as the carving's reflection does.
  const revealStyle = (line: LineMeasure, side: 1 | -1): CSSProperties | undefined => {
    const reveal = reveals?.[line.index]
    if (!reveals) return undefined
    if (!reveal?.shown) return { visibility: 'hidden' }
    if (reveal.letters) {
      return side === 1
        ? undefined
        : { transform: `translateX(${line.width - (reveal.extent ?? 0)}px)` }
    }
    return { transform: `translateX(${side * reveal.offset}px)` }
  }
  // Typed, each letter is its own span: hidden until it appears, then nudged by the
  // spacing still closing up (relative positioning keeps the line's shaping and kerning).
  const lineContent = (line: LineMeasure, text: string) => {
    const letters = reveals?.[line.index]?.letters
    if (!letters) return text
    return Array.from(text).map((char, i) => (
      <span
        key={i}
        className="rag-letter"
        style={{
          left: `${letters.offsets[i] ?? 0}px`,
          visibility: letters.shown[i] ? undefined : 'hidden',
        }}
      >
        {char}
      </span>
    ))
  }

  return (
    <div
      ref={ref}
      className="rag-editor"
      style={vars}
      data-debug={debug ? 'on' : 'off'}
      data-revealing={reveals ? 'on' : undefined}
      data-align={align}
    >
      <textarea
        className="rag-text"
        aria-label="Text"
        value={settings.text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Start typing…"
        spellCheck={false}
      />
      {/* While revealing, the textarea's own text is hidden and the lines that have
          appeared are drawn here instead, sliding into their places (the textarea stays
          editable). */}
      {reveals && (
        <div className="rag-reveal" aria-hidden="true" data-testid="rag-reveal">
          {lines.map((line) => (
            <div key={line.index} className="rag-reveal-line" style={revealStyle(line, 1)}>
              {lineContent(line, line.text.trimEnd())}
            </div>
          ))}
        </div>
      )}
      {/* The mirror: each measured line, right-aligned in the column's reflection across
          the edge. Same widths, so its ragged edge mirrors the original's exactly. Built
          from the measured lines, so it always breaks where the editor does. While
          revealing, its lines slide in from the right, as the carving's reflection does. */}
      {mirror && (
        <div className="rag-mirror" aria-hidden="true" data-testid="rag-mirror">
          {lines.map((line) => (
            <div key={line.index} className="rag-mirror-line" style={revealStyle(line, -1)}>
              {lineContent(line, line.text.trimEnd())}
            </div>
          ))}
        </div>
      )}
      <div className="rag-overlay" aria-hidden="true">
        <div className="rag-edge" />
        {baselines.map((y, i) => (
          <div key={i} className="rag-baseline" style={{ '--baseline-y': y } as CSSProperties} />
        ))}
        {boxes.map((box) => (
          <div
            key={box.lineIndex}
            className="rag-line-box"
            style={
              {
                '--box-x': box.x,
                '--box-y': box.y,
                '--box-w': box.width,
                '--box-h': box.height,
                '--box-r': box.radius,
              } as CSSProperties
            }
          />
        ))}
        {lines.map((line) => (
          <span
            key={line.index}
            className="rag-label"
            style={
              {
                '--line-index': line.index,
                '--line-start': `${align === 'center' ? Math.max(0, (settings.columnWidth - line.width) / 2) : 0}px`,
              } as CSSProperties
            }
          >
            {line.width.toFixed(1)}px
          </span>
        ))}
      </div>
    </div>
  )
}
