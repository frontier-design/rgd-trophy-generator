import { useState } from 'react'
import { ControlPanel } from '../../src/components/ControlPanel'
import { CanvasScene } from '../../src/components/CanvasPage/CanvasScene'
import { createSceneNode, sceneParams, withParams } from '../../src/components/CanvasPage/sceneNode'
import { DEFAULT_SCENE_PARAMS, useSettings } from '../../src/state'

/** Exercise the shared controls and renderer without depending on a page or timeline. */
export default function ControlPanelScene() {
  const { settings } = useSettings()
  const [node, setNode] = useState(() => ({
    ...createSceneNode('test', 'test', 0, 0),
    settings,
    scene: DEFAULT_SCENE_PARAMS,
    debug: true,
  }))
  const { imageExport: image, frame } = node
  return (
    <>
      <ControlPanel
        params={sceneParams(node)}
        onParamsChange={(patch) => setNode((current) => withParams(current, patch))}
        debug={node.debug}
        onDebugChange={(debug) => setNode((current) => ({ ...current, debug }))}
        revolve={node.revolve}
        onRevolveChange={(revolve) => setNode((current) => ({ ...current, revolve }))}
        perspective={node.perspective}
        onPerspectiveChange={(perspective) => setNode((current) => ({ ...current, perspective }))}
        banner={{
          position: node.bannerPosition,
          onPositionChange: (bannerPosition) =>
            setNode((current) => ({ ...current, bannerPosition })),
          headline: node.bannerText.headline,
          onHeadlineChange: (headline) =>
            setNode((current) => ({ ...current, bannerText: { ...current.bannerText, headline } })),
          link: node.bannerText.link,
          onLinkChange: (link) =>
            setNode((current) => ({ ...current, bannerText: { ...current.bannerText, link } })),
        }}
        imageExport={{
          ...image,
          maxScale: 5,
          onFormatChange: (format) =>
            setNode((current) => ({ ...current, imageExport: { ...current.imageExport, format } })),
          onScaleChange: (scale) =>
            setNode((current) => ({ ...current, imageExport: { ...current.imageExport, scale } })),
          onTransparentChange: (transparent) =>
            setNode((current) => ({
              ...current,
              imageExport: { ...current.imageExport, transparent },
            })),
          size: `${frame.width * image.scale} × ${frame.height * image.scale}`,
          busy: false,
          error: null,
          onExport: () => {},
        }}
      />
      <CanvasScene
        node={node}
        getZoom={() => 1}
        renderZoom={1}
        selected={false}
        onSelect={() => {}}
        onInputDown={() => {}}
        onMove={() => {}}
        onResize={() => {}}
        onExporter={() => {}}
        onTextChange={(_id, text) =>
          setNode((current) => ({ ...current, settings: { ...current.settings, text } }))
        }
        modifiers={{ twists: [], etches: [], patterns: [], textures: [], linked: false }}
      />
    </>
  )
}
