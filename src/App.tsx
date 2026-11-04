import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { BANNER_LOGO_URL, bannerRevealUnits, type BannerPosition } from './banner'
import {
  ControlPanel,
  type BannerControls,
  type TransportControls,
} from './components/ControlPanel'
import { SceneArtboard } from './components/SceneArtboard'
import { composeScene } from './components/SceneArtboard/composeScene'
import { TimelineSlot } from './components/TimelineSlot'
import {
  downloadBlob,
  drawComposition,
  exportMp4,
  maxImageScale,
  renderImage,
  type Composition,
  type ImageFormat,
} from './export'
import { useAutosave, usePanZoom, useSceneModel, useTimeline, useVideoExport } from './hooks'
import { ensureFontLoaded } from './measure'
import { fitToFrame } from './rag'
import type { ThreeScene } from './render3d'
import type { PaperScene } from './shape2d'
import {
  ARTBOARD,
  DEFAULT_SCENE_PARAMS,
  loadGeneratorDocument,
  useSettings,
  type GeneratorDocument,
} from './state'
import type { AnimatedParams, SceneParams } from './types'

/** Space kept around the frame when it's fitted in the workspace (px). */
const WORKSPACE_PADDING = 48
/** Video export: output px per artboard px (1920 × 1080 → 3840 × 2160, 4K UHD). */
const EXPORT_SCALE = 2
/** The "sculpt intro" preset: a full-frame cylinder that the text carves as it stacks in
 *  (the RGD reference's reveal), looping. */
const SCULPT_INTRO = {
  /** Hold on the uncarved cylinder, then on the finished trophy before looping (s). */
  hold: 0.4,
  end: 1,
  /** One line's slide into place (s), the next line after `stagger` % of it, starting
   *  `slide` % of the type size to the left: the reference's ~0.15 s, ~0.6 em. */
  slideTime: 0.75,
  stagger: 20,
  slide: 60,
  /** Typed instead: one letter's settle (s), the next after `stagger` % of it (the
   *  example's ~0.06 s), each arriving with `spacing` % of the type size of extra space. */
  typed: { settleTime: 0.3, stagger: 20, spacing: 12 },
  /** The banner rises in as the text settles: starting this share into the text's
   *  stack-in, with the text's slide time and stagger. */
  bannerStart: 0.8,
  /** The widest line, with its box, carves this share of the radius (the rest is stem). */
  carve: 0.8,
  /** Least height for the top band (px). */
  minTop: 120,
}

/**
 * Editable text block → measured lines (Pretext) → line boxes (rag/) → the shape
 * between the boxes and the right edge (shape2d/, Paper.js) → revolved in place around
 * that edge into a solid (render3d/, Three.js). Every sidebar param can be animated on the
 * timeline (timeline/, Theatre.js) and the animation exported as a 4K MP4 (export/).
 */
export default function App({ tools }: { tools?: ReactNode } = {}) {
  const { settings, dispatch } = useSettings()
  // View-only state: not measurement inputs, so they stay out of Settings.
  // Picks up where it was left (the autosave; the timeline restores the params itself).
  const [saved] = useState(loadGeneratorDocument)
  const [debug, setDebug] = useState(saved.debug)
  // Starts in 3D; the "2D sketch" button flips to the flat view. The sweep plays only when
  // coming back from the sketch, not on load.
  const [revolve, setRevolve] = useState(saved.revolve)
  const [animateRevolve, setAnimateRevolve] = useState(false)
  const [perspective, setPerspective] = useState(saved.perspective)
  /** Shape and canvas params (the animatable ones that aren't in Settings). */
  const [scene, setScene] = useState<SceneParams>(DEFAULT_SCENE_PARAMS)
  const [fps, setFps] = useState(saved.fps)
  /** Playback goes round and round (exports are one seamless cycle either way). */
  const [loop, setLoop] = useState(saved.loop)
  /** The banner's place and text (shown and revealed via scene params, animatable). */
  const [bannerPosition, setBannerPosition] = useState<BannerPosition>(saved.bannerPosition)
  const [bannerText, setBannerText] = useState(saved.bannerText)
  // Still image export's options (saved), and its state.
  const [imageFormat, setImageFormat] = useState<ImageFormat>(saved.imageFormat)
  const [imageScale, setImageScale] = useState(saved.imageScale)
  const [imageTransparent, setImageTransparent] = useState(saved.imageTransparent)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  // Autosaved shortly after every change (and when leaving the page or closing the tab).
  const autosaved = useMemo<GeneratorDocument>(
    () => ({
      version: 1,
      text: settings.text,
      bannerPosition,
      bannerText,
      debug,
      revolve,
      perspective,
      fps,
      loop,
      imageFormat,
      imageScale,
      imageTransparent,
    }),
    [
      settings.text,
      bannerPosition,
      bannerText,
      debug,
      revolve,
      perspective,
      fps,
      loop,
      imageFormat,
      imageScale,
      imageTransparent,
    ],
  )
  useAutosave('generator', autosaved)
  // The logo, loaded once, for drawing the banner into video frames.
  const bannerLogoRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    const logo = new Image()
    logo.src = BANNER_LOGO_URL
    logo.onload = () => {
      bannerLogoRef.current = logo
    }
  }, [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const paperSceneRef = useRef<PaperScene | null>(null)
  const threeSceneRef = useRef<ThreeScene | null>(null)
  // The artboard is laid out at 1920 × 1080 and scaled to fit.
  // The workspace around the frame: scroll zooms, drag pans (pan/zoom never touches the
  // composition, only how it's shown).
  const { view, fit } = usePanZoom(viewportRef, ARTBOARD, WORKSPACE_PADDING)
  const scale = view.zoom
  // Render the 3D view at the resolution it's shown at (capped: a close zoom would
  // otherwise allocate enormous buffers).
  const displayPixelRatio = Math.min(3, Math.max(0.5, window.devicePixelRatio * scale))

  const { fontSize, lineHeight, columnWidth, material } = settings
  const params = useMemo<AnimatedParams>(
    () => ({ fontSize, lineHeight, columnWidth, material, ...scene }),
    [fontSize, lineHeight, columnWidth, material, scene],
  )
  const applyParams = useCallback(
    ({ fontSize, lineHeight, columnWidth, material, ...rest }: AnimatedParams) => {
      dispatch({ type: 'update', patch: { fontSize, lineHeight, columnWidth, material } })
      setScene(rest)
    },
    [dispatch],
  )
  const timeline = useTimeline(params, applyParams)
  const videoExport = useVideoExport()

  const { lineBox, overshoot } = scene
  const editorRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const model = useSceneModel(settings, scene, bannerPosition, bannerText, {
    editorRef,
    artboardRef,
  })
  const { lines, metrics, banner, bottomClearance, reveals, prefixWidths, baselines } = model

  const setText = useCallback(
    (text: string) => dispatch({ type: 'update', patch: { text } }),
    [dispatch],
  )
  const setPaperScene = useCallback((s: PaperScene | null) => {
    paperSceneRef.current = s
  }, [])
  const setThreeScene = useCallback((s: ThreeScene | null) => {
    threeSceneRef.current = s
  }, [])

  // What a video frame needs, as of the last commit (the export loop runs outside React).
  const frameState = useRef({
    banner,
    bannerText,
    lines,
    reveals,
    prefixWidths,
    baselines,
    settings,
    scene,
    revolve,
    displayPixelRatio,
  })
  useEffect(() => {
    frameState.current = {
      banner,
      bannerText,
      lines,
      reveals,
      prefixWidths,
      baselines,
      settings,
      scene,
      revolve,
      displayPixelRatio,
    }
  })

  /** The artboard as it is now, as layers for a frame (debug overlay excluded), at `scale`
   *  (the 3D view renders at it). */
  const compose = (scale = EXPORT_SCALE, transparent = false): Composition | null => {
    const editor = editorRef.current
    const artboard = artboardRef.current
    if (!editor || !artboard) return null
    return composeScene({
      ...frameState.current,
      editor,
      artboard,
      frame: ARTBOARD,
      logo: bannerLogoRef.current,
      three: threeSceneRef.current,
      paper: paperSceneRef.current,
      scale,
      transparent,
    })
  }

  // Still image export (the frame as it is now).
  const maxScale = maxImageScale(ARTBOARD.width, ARTBOARD.height)
  const exportImage = async () => {
    setImageBusy(true)
    setImageError(null)
    try {
      const scale = Math.min(imageScale, maxScale)
      await ensureFontLoaded(
        `${banner.fontWeight} ${banner.fontSize}px "${settings.fontFamily}"`,
        bannerText.headline,
      )
      const composition = compose(scale, imageFormat === 'png' && imageTransparent)
      if (!composition) return
      const blob = await renderImage(composition, scale, imageFormat)
      const w = ARTBOARD.width * scale
      const h = ARTBOARD.height * scale
      downloadBlob(blob, `rgd-trophy-${w}x${h}.${imageFormat === 'png' ? 'png' : 'jpg'}`)
    } catch (error) {
      setImageError(`Couldn't export: ${String(error)}`)
    } finally {
      threeSceneRef.current?.setPixelRatio(frameState.current.displayPixelRatio)
      setImageBusy(false)
    }
  }

  const exportVideo = () =>
    videoExport.start(async (signal, onProgress) => {
      const { timeline: tl } = timeline
      tl.pause()
      const startPosition = tl.position
      // The banner's weight of the font, so frames never draw it in a fallback font.
      await ensureFontLoaded(
        `${banner.fontWeight} ${banner.fontSize}px "${settings.fontFamily}"`,
        bannerText.headline,
      )
      try {
        const blob = await exportMp4({
          width: ARTBOARD.width * EXPORT_SCALE,
          height: ARTBOARD.height * EXPORT_SCALE,
          fps,
          duration: tl.length,
          seek: async (seconds) => {
            tl.seek(seconds)
            // Synchronous all the way: the canvases update in layout effects (the outline's
            // state update re-renders within the same flush), so the frame is ready at once.
            // No waiting on animation frames, which background tabs don't run.
            flushSync(timeline.syncNow)
          },
          draw: (ctx) => {
            const composition = compose(EXPORT_SCALE)
            if (composition) drawComposition(ctx, composition, EXPORT_SCALE)
          },
          onProgress: (done, total) => onProgress(done / total),
          signal,
        })
        downloadBlob(blob, `rgd-trophy-4k-${fps}fps.mp4`)
      } finally {
        tl.seek(startPosition)
        threeSceneRef.current?.setPixelRatio(frameState.current.displayPixelRatio)
      }
    })

  /**
   * The "sculpt intro" preset: fits the composition to the frame's margin (type sized so the
   * widest line carves SCULPT_INTRO.carve of the radius, the mirrored blocks spanning the
   * width, the top band reaching the top margin), and fills it out: with no text shown it's
   * a cylinder covering the whole frame, easing in to the margin as the text stacks in.
   * Then keyframes the reveal (linear, so the stack-in keeps its timing): hold, stack in,
   * hold, and loop.
   */
  const sculptIntro = () => {
    const widest = Math.max(0, ...lines.map((line) => line.width))
    if (widest <= 0) return
    const leading = lineHeight / fontSize
    const fit = fitToFrame({
      widest,
      lineCount: lines.length,
      fontSize,
      leading,
      metrics,
      frame: ARTBOARD,
      bottomClearance,
      overshoot,
      padX: lineBox.padX,
      padY: lineBox.padY,
      carve: SCULPT_INTRO.carve,
      minTop: SCULPT_INTRO.minTop,
    })
    const { hold, end, bannerStart } = SCULPT_INTRO
    // The reveal's pace for its style, and how many items it reveals one after another.
    const typed = scene.revealStyle === 'type'
    const { slideTime, stagger } = typed
      ? { slideTime: SCULPT_INTRO.typed.settleTime, stagger: SCULPT_INTRO.typed.stagger }
      : SCULPT_INTRO
    const items = typed
      ? lines.reduce((count, line) => count + Array.from(line.text.replace(/\s/g, '')).length, 0)
      : lines.length
    const bannerTime = slideTime * bannerRevealUnits(stagger / 100)
    // Every item's settle, each starting `stagger` of one after the last.
    const stacking = slideTime * ((items - 1) * (stagger / 100) + 1)
    const tl = timeline.timeline
    tl.pause()
    tl.seek(0)
    // Layout values are set static (any keyframes on them dropped), so the composition is
    // the same all through the animation.
    timeline.editStatic(
      {
        fontSize: fit.fontSize,
        lineHeight: fit.lineHeight,
        columnWidth: fit.columnWidth,
        mirror: true,
        topHeight: fit.topHeight,
        taper: 0,
        revealStagger: stagger,
        ...(typed
          ? { revealSpacing: SCULPT_INTRO.typed.spacing }
          : { revealSlide: SCULPT_INTRO.slide }),
        revealFill: 100,
      },
      [
        'type.size',
        'type.leading',
        'shape.edge',
        'shape.mirror',
        'top.height',
        'top.taper',
        'type.stagger',
        typed ? 'type.spacing' : 'type.slide',
        'type.fill',
      ],
    )
    // The banner (if shown) rises in as the text settles.
    const bannerFrom = hold + stacking * bannerStart
    const bannerTo = bannerFrom + bannerTime
    tl.setLength(Math.max(hold + stacking, scene.banner ? bannerTo : 0) + end)
    tl.setKeyframes('type.reveal', [
      [0, 0],
      [hold, 0],
      [hold + stacking, 100],
    ])
    if (scene.banner) {
      tl.setKeyframes('banner.reveal', [
        [0, 0],
        [bannerFrom, 0],
        [bannerTo, 100],
      ])
    }
    tl.seek(0)
  }

  const bannerControls: BannerControls = {
    position: bannerPosition,
    onPositionChange: setBannerPosition,
    headline: bannerText.headline,
    onHeadlineChange: (headline) => setBannerText((text) => ({ ...text, headline })),
    link: bannerText.link,
    onLinkChange: (link) => setBannerText((text) => ({ ...text, link })),
  }

  const transport: TransportControls = {
    playing: timeline.playing,
    length: timeline.length,
    onPlayToggle: () =>
      timeline.playing ? timeline.timeline.pause() : timeline.timeline.play(loop),
    loop,
    onLoopChange: (next) => {
      setLoop(next)
      // Takes effect at once while playing.
      if (timeline.playing) timeline.timeline.play(next)
    },
    onRewind: () => timeline.timeline.seek(0),
    onLengthChange: (seconds) => timeline.timeline.setLength(seconds),
    fps,
    onFpsChange: setFps,
    exportProgress: videoExport.progress,
    exportError: videoExport.error,
    onExport: exportVideo,
    onSculptIntro: sculptIntro,
    onCancelExport: videoExport.cancel,
  }

  return (
    <main className="app" data-revolve={revolve ? 'on' : 'off'}>
      <ControlPanel
        tools={tools}
        params={params}
        onParamsChange={timeline.edit}
        keyframe={timeline.keyframe}
        transport={transport}
        banner={bannerControls}
        imageExport={{
          format: imageFormat,
          onFormatChange: setImageFormat,
          scale: Math.min(imageScale, maxScale),
          onScaleChange: setImageScale,
          maxScale,
          transparent: imageTransparent,
          onTransparentChange: setImageTransparent,
          size: `${ARTBOARD.width * Math.min(imageScale, maxScale)} × ${ARTBOARD.height * Math.min(imageScale, maxScale)}`,
          busy: imageBusy,
          error: imageError,
          onExport: () => void exportImage(),
        }}
        debug={debug}
        onDebugChange={setDebug}
        revolve={revolve}
        onRevolveChange={(next) => {
          setRevolve(next)
          setAnimateRevolve(true)
        }}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
      />
      <div className="stage">
        <section ref={viewportRef} className="artboard-viewport" aria-label="Canvas">
          {/* The frame sits in the workspace at the view's place and zoom; the artboard
              inside is laid out at 1920 × 1080 and scaled to it, and clips everything
              drawn. */}
          <div
            className="artboard-frame"
            style={
              {
                '--artboard-width': `${ARTBOARD.width}px`,
                '--artboard-height': `${ARTBOARD.height}px`,
                '--artboard-scale': scale,
                '--frame-x': `${view.x}px`,
                '--frame-y': `${view.y}px`,
              } as CSSProperties
            }
          >
            <SceneArtboard
              editorRef={editorRef}
              artboardRef={artboardRef}
              model={model}
              settings={settings}
              scene={scene}
              bannerText={bannerText}
              revolve={revolve}
              animateRevolve={animateRevolve}
              perspective={perspective}
              debug={debug}
              pixelRatio={displayPixelRatio}
              onTextChange={setText}
              onPaperScene={setPaperScene}
              onThreeScene={setThreeScene}
            />
          </div>
          {/* Zoom (relative to the frame's actual size) and fit, like After Effects' view menu. */}
          <div className="view-tools" data-no-pan>
            <output className="view-zoom" aria-label="Zoom">
              {Math.round(scale * 100)}%
            </output>
            <button type="button" className="control-button" onClick={fit}>
              fit
            </button>
          </div>
        </section>
        <TimelineSlot onDock={timeline.timeline.dock} />
      </div>
    </main>
  )
}
