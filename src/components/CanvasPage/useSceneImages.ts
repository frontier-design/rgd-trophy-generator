import { useEffect, useRef, useState } from 'react'
import type { SceneExporter } from './CanvasScene'
import type { NodeLink, SceneModifiers } from './graph'
import type { SceneNode } from './sceneNode'

type VisualInputs = readonly unknown[]

interface Snapshot {
  inputs: VisualInputs
  timer?: ReturnType<typeof setTimeout>
  url?: string
}

function revoke(url: string) {
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  } catch {
    // URL APIs can be unavailable or fail in non-browser environments.
  }
}

/** Live, in-memory images for scenes with active outgoing composition links.
 * Scene and modifier inputs are expected to be updated immutably. Since the graph
 * guarantees scene outputs connect to compositions, links need no destination lookup.
 */
export function useSceneImages(
  scenes: readonly SceneNode[],
  links: readonly NodeLink[],
  modifiersByScene: Map<string, SceneModifiers>,
  getExporter: (id: string) => SceneExporter | undefined,
  revisions: ReadonlyMap<string, number>,
): ReadonlyMap<string, string> {
  const [images, setImages] = useState<ReadonlyMap<string, string>>(() => new Map())
  const snapshots = useRef(new Map<string, Snapshot>())
  const exporterRef = useRef(getExporter)

  useEffect(() => {
    exporterRef.current = getExporter
    const active = new Set(links.filter((link) => !link.muted).map((link) => link.from))
    const wanted = new Set<string>()

    for (const scene of scenes) {
      if (!active.has(scene.id)) continue
      wanted.add(scene.id)
      const inputs: VisualInputs = [
        scene.frame,
        scene.settings,
        scene.scene,
        scene.bannerPosition,
        scene.bannerText,
        scene.revolve,
        scene.animateRevolve,
        scene.perspective,
        scene.debug,
        modifiersByScene.get(scene.id),
        revisions.get(scene.id),
      ]
      const previous = snapshots.current.get(scene.id)
      if (previous && inputs.every((value, index) => Object.is(value, previous.inputs[index])))
        continue
      if (previous?.timer !== undefined) clearTimeout(previous.timer)
      const snapshot: Snapshot = { inputs, url: previous?.url }
      snapshots.current.set(scene.id, snapshot)
      snapshot.timer = setTimeout(() => {
        snapshot.timer = undefined
        const run = async () => {
          try {
            const exporter = exporterRef.current(scene.id)
            if (
              !exporter ||
              typeof URL === 'undefined' ||
              typeof URL.createObjectURL !== 'function'
            )
              return
            const blob = await exporter({ format: 'png', scale: 1, transparent: false })
            if (snapshots.current.get(scene.id) !== snapshot) return
            const url = URL.createObjectURL(blob)
            if (snapshots.current.get(scene.id) !== snapshot) {
              revoke(url)
              return
            }
            const oldUrl = snapshot.url
            snapshot.url = url
            setImages((current) => new Map(current).set(scene.id, url))
            if (oldUrl) revoke(oldUrl)
          } catch {
            // A failed export leaves the last successful image in place.
          }
        }
        void run()
      }, 100)
    }

    for (const [id, snapshot] of snapshots.current) {
      if (wanted.has(id)) continue
      if (snapshot.timer !== undefined) clearTimeout(snapshot.timer)
      snapshots.current.delete(id)
      if (snapshot.url) revoke(snapshot.url)
      setImages((current) => {
        if (!current.has(id)) return current
        const next = new Map(current)
        next.delete(id)
        return next
      })
    }
  }, [scenes, links, modifiersByScene, getExporter, revisions])

  useEffect(() => {
    const current = snapshots.current
    return () => {
      for (const snapshot of current.values()) {
        if (snapshot.timer !== undefined) clearTimeout(snapshot.timer)
        if (snapshot.url) revoke(snapshot.url)
      }
      current.clear()
    }
  }, [])

  return images
}
