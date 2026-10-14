import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { PaperCanvas } from './components/PaperCanvas'
import { RagEditor } from './components/RagEditor'
import { ThreeCanvas } from './components/ThreeCanvas'
import { useRagMeasure } from './hooks'
import { lineBaseline, lineBoxes, shapeExtent } from './rag'
import { DEFAULT_CANVAS_COLORS, DEFAULT_LINE_BOX_STYLE, useSettings } from './state'
import type { CanvasColors, LineBoxStyle, Outline2D } from './types'

const EMPTY_OUTLINE: Outline2D = { contours: [] }

/**
 * Editable text block → measured lines (Pretext) → line boxes (rag/) → the shape
 * between the boxes and the right edge (shape2d/, Paper.js) → revolved in place around
 * that edge into a solid (render3d/, Three.js).
 */
export default function App() {
  const { settings, dispatch } = useSettings()
  const { lines, metrics } = useRagMeasure(settings)
  // View-only state: not measurement inputs, so they stay out of Settings.
  const [debug, setDebug] = useState(true)
  // Starts in 3D; the "2D sketch" button flips to the flat view. The sweep plays only when
  // coming back from the sketch, not on load.
  const [revolve, setRevolve] = useState(true)
  const [animateRevolve, setAnimateRevolve] = useState(false)
  /** Reflect the text (and the 2D shape) across the edge: the trophy between two blocks. */
  const [mirror, setMirror] = useState(true)
  const [lineBox, setLineBox] = useState<LineBoxStyle>(DEFAULT_LINE_BOX_STYLE)
  const [perspective, setPerspective] = useState(false)
  /** Height of the full-width band on top of the shape (and so the solid). */
  const [topHeight, setTopHeight] = useState(0)
  /** How far the shape's bottom extends below the last baseline (optical alignment). */
  const [overshoot, setOvershoot] = useState(3)
  /** Round the top band's bottom-left corner (the top section's bottom rim). */
  const [roundTop, setRoundTop] = useState(false)
  const [topRadius, setTopRadius] = useState(16)
  /** Taper of the top band, in % (0 = straight; 50 = the top circle at half width). */
  const [taper, setTaper] = useState(0)
  /** Smooth the sharp corners where consecutive lines' boxes meet, with this radius. */
  const [smoothJoins, setSmoothJoins] = useState(true)
  const [joinRadius, setJoinRadius] = useState(16)
  /** The canvas's background and text colors (#rrggbb). */
  const [canvasColors, setCanvasColors] = useState<CanvasColors>(DEFAULT_CANVAS_COLORS)
  const [outline, setOutline] = useState<Outline2D>(EMPTY_OUTLINE)
  const editorRef = useRef<HTMLDivElement>(null)

  const { lineHeight, columnWidth } = settings
  // The boxes decide the rag shape (shape2d/) and so the revolved solid.
  const boxes = useMemo(
    () => lineBoxes(lines, { lineHeight, ...lineBox }),
    [lines, lineHeight, lineBox],
  )
  // Where the shape fills: from the text's left side, top band down to the last baseline.
  const extent = useMemo(
    () => shapeExtent(boxes, lines, { lineHeight, topHeight, overshoot, metrics }),
    [boxes, lines, lineHeight, topHeight, overshoot, metrics],
  )
  // Each line's baseline, for the debug guides.
  const baselines = useMemo(
    () => lines.map((line) => lineBaseline(line.index, lineHeight, metrics)),
    [lines, lineHeight, metrics],
  )

  const setText = useCallback(
    (text: string) => dispatch({ type: 'update', patch: { text } }),
    [dispatch],
  )

  return (
    <main className="app" data-revolve={revolve ? 'on' : 'off'}>
      <ControlPanel
        lineBox={lineBox}
        onLineBoxChange={setLineBox}
        topHeight={topHeight}
        onTopHeightChange={setTopHeight}
        overshoot={overshoot}
        onOvershootChange={setOvershoot}
        roundTop={roundTop}
        onRoundTopChange={setRoundTop}
        topRadius={topRadius}
        onTopRadiusChange={setTopRadius}
        taper={taper}
        onTaperChange={setTaper}
        smoothJoins={smoothJoins}
        onSmoothJoinsChange={setSmoothJoins}
        joinRadius={joinRadius}
        onJoinRadiusChange={setJoinRadius}
        canvasColors={canvasColors}
        onCanvasColorsChange={setCanvasColors}
        debug={debug}
        onDebugChange={setDebug}
        revolve={revolve}
        onRevolveChange={(next) => {
          setRevolve(next)
          setAnimateRevolve(true)
        }}
        mirror={mirror}
        onMirrorChange={setMirror}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
      />
      <section className="stage" aria-label="Canvas">
        {/* The artboard clips everything drawn: 2D shape, 3D solid, text. */}
        <div
          className="artboard"
          data-mirror={mirror ? 'on' : 'off'}
          style={
            {
              '--color-artboard-bg': canvasColors.background,
              '--color-canvas-text': canvasColors.text,
            } as CSSProperties
          }
        >
          <PaperCanvas
            anchorRef={editorRef}
            boxes={boxes}
            edgeX={columnWidth}
            extent={extent}
            topCornerRadius={roundTop ? topRadius : 0}
            taper={taper / 100}
            joinRadius={smoothJoins ? joinRadius : 0}
            mirror={mirror}
            look={settings.material}
            onOutline={setOutline}
          />
          {revolve && (
            <ThreeCanvas
              outline={outline}
              axisX={columnWidth}
              anchorRef={editorRef}
              projection={perspective ? 'perspective' : 'orthographic'}
              look={settings.material}
              mirror={mirror}
              animateIn={animateRevolve}
            />
          )}
          <RagEditor
            ref={editorRef}
            settings={settings}
            lines={lines}
            boxes={boxes}
            baselines={baselines}
            extent={extent}
            mirror={mirror}
            onTextChange={setText}
            debug={debug}
          />
        </div>
      </section>
    </main>
  )
}
