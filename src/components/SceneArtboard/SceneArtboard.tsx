import { useState, type CSSProperties } from 'react'
import type { BannerText, SceneModel, SceneRefs } from '../../hooks/useSceneModel'
import type { SolidPattern, ThreeScene } from '../../render3d'
import type { PaperScene } from '../../shape2d'
import { ARTBOARD } from '../../state'
import type {
  EtchParams,
  Outline2D,
  SceneParams,
  Settings,
  TextureParams,
  TwistParams,
} from '../../types'
import { Banner } from '../Banner'
import { PaperCanvas } from '../PaperCanvas'
import { RagEditor } from '../RagEditor'
import { ThreeCanvas } from '../ThreeCanvas'

const EMPTY_OUTLINE: Outline2D = { contours: [] }

interface SceneArtboardProps extends SceneRefs {
  /** The scene's composition (hooks/useSceneModel). */
  model: SceneModel
  settings: Settings
  scene: SceneParams
  bannerText: BannerText
  /** True = the 3D trophy; false = the 2D sketch. */
  revolve: boolean
  /** Play the revolve sweep when the 3D view mounts (coming back from the sketch). */
  animateRevolve: boolean
  perspective: boolean
  debug: boolean
  /** The 3D view's drawing-buffer px per artboard px. */
  pixelRatio: number
  /** Twist nodes shaping the solid (canvas page). */
  twists?: readonly TwistParams[]
  /** Etch nodes' engraved strips (canvas page). */
  etches?: readonly EtchParams[]
  /** Texture nodes' rough finishes (canvas page). */
  textures?: readonly TextureParams[]
  /** Pattern nodes' ornament (canvas page). */
  patterns?: readonly SolidPattern[]
  onTextChange: (text: string) => void
  /** Receive the scenes (for video export); referentially stable. */
  onPaperScene?: (scene: PaperScene | null) => void
  onThreeScene?: (scene: ThreeScene | null) => void
}

/**
 * One scene's 1920 × 1080 artboard: the 2D shape (Paper.js), the revolved trophy
 * (Three.js), the editable text and the banner, all drawn from its model. Laid out at the
 * artboard's size; the parent places and scales it (`--artboard-scale`).
 */
export function SceneArtboard({
  editorRef,
  artboardRef,
  model,
  settings,
  scene,
  bannerText,
  revolve,
  animateRevolve,
  perspective,
  debug,
  pixelRatio,
  twists,
  etches,
  textures,
  patterns,
  onTextChange,
  onPaperScene,
  onThreeScene,
}: SceneArtboardProps) {
  const [outline, setOutline] = useState<Outline2D>(EMPTY_OUTLINE)
  const { columnWidth, material } = settings
  const { mirror, canvasColors } = scene

  return (
    <div
      ref={artboardRef}
      className="artboard"
      data-mirror={mirror ? 'on' : 'off'}
      style={
        {
          '--artboard-padding': `${ARTBOARD.padding}px`,
          '--artboard-padding-bottom': `${model.bottomInset}px`,
          '--color-artboard-bg': canvasColors.background,
          '--color-canvas-text': canvasColors.text,
        } as CSSProperties
      }
    >
      <PaperCanvas
        anchorRef={editorRef}
        boxes={model.carvingBoxes}
        edgeX={columnWidth}
        extent={model.shapeBounds}
        topCornerRadius={model.topCornerRadius}
        taper={scene.taper / 100}
        joinRadius={scene.smoothJoins ? scene.joinRadius : 0}
        mirror={mirror}
        look={material}
        onOutline={setOutline}
        onScene={onPaperScene}
        visible={!revolve}
      />
      {revolve && (
        <ThreeCanvas
          outline={outline}
          axisX={columnWidth}
          anchorRef={editorRef}
          projection={perspective ? 'perspective' : 'orthographic'}
          look={material}
          mirror={mirror}
          animateIn={animateRevolve}
          pixelRatio={pixelRatio}
          twists={twists}
          etches={etches}
          textures={textures}
          patterns={patterns}
          onScene={onThreeScene}
        />
      )}
      <RagEditor
        ref={editorRef}
        settings={settings}
        lines={model.lines}
        align={scene.textAlign}
        boxes={model.carvingBoxes}
        baselines={model.baselines}
        extent={model.extent}
        mirror={mirror}
        reveals={model.reveals}
        onTextChange={onTextChange}
        debug={debug}
      />
      {scene.banner && (
        <Banner
          layout={model.banner}
          reveal={scene.bannerReveal / 100}
          stagger={scene.revealStagger / 100}
          headline={bannerText.headline}
          link={bannerText.link}
          fontFamily={settings.fontFamily}
        />
      )}
    </div>
  )
}
