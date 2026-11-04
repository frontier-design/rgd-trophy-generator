// Theatre.js Studio internals, in one place. Studio's public API can't sequence a prop
// (only its "Sequence this prop" menu can), set a tween's curve, dock a panel, or unpin
// its side panels, so
// these reach the studio instance Studio registers on `window` and call the same state
// editors its own UI uses. Written against @theatre/studio 0.7.2, pinned exactly in
// package.json: check these when upgrading (search the bundle for the editor names).

/** Where a Studio panel sits: each edge as a share of the window, from a window side. */
export interface PanelPosition {
  edges: {
    left: { from: 'screenLeft' | 'screenRight'; distance: number }
    right: { from: 'screenLeft' | 'screenRight'; distance: number }
    top: { from: 'screenTop' | 'screenBottom'; distance: number }
    bottom: { from: 'screenTop' | 'screenBottom'; distance: number }
  }
}

interface ObjectAddress {
  projectId: string
  sheetId: string
  sheetInstanceId: string
  objectKey: string
}

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Studio internals */
type StateEditors = any
interface PrivateStudio {
  _store: { getState(): any }
  transaction(fn: (api: { stateEditors: StateEditors }) => void): void
  tempTransaction(fn: (api: { stateEditors: StateEditors }) => void): {
    commit(): void
    discard(): void
  }
}

function privateStudio(): PrivateStudio | null {
  const bundle = (window as any).__TheatreJS_StudioBundle
  const studio = bundle?._studio
  return studio && typeof studio.transaction === 'function' ? studio : null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let warned = false
function withStudio(fn: (studio: PrivateStudio) => void): boolean {
  const studio = privateStudio()
  if (!studio) {
    if (!warned) console.warn('Theatre.js Studio internals not found; keyframe tools are off.')
    warned = true
    return false
  }
  fn(studio)
  return true
}

/** Make a prop animated: give it an (empty) keyframe track, like Studio's "Sequence this
 *  prop". Setting it afterwards adds keyframes at the playhead. */
export function sequenceProp(address: ObjectAddress, pathToProp: string[]): boolean {
  return withStudio((studio) =>
    studio.transaction(({ stateEditors }) =>
      stateEditors.coreByProject.historic.sheetsById.sequence.setPrimitivePropAsSequenced(
        { ...address, pathToProp },
        undefined,
      ),
    ),
  )
}

/** Theatre's handles for a straight-line tween: [right x, right y] of a keyframe, then
 *  [left x, left y] of the next, as setTweenBetweenKeyframes takes them. */
const LINEAR_HANDLES = [1 / 3, 1 / 3, 2 / 3, 2 / 3]

/** A prop's keyframe track: its id and keyframe ids, from Studio's saved state. */
function trackOf(studio: PrivateStudio, address: ObjectAddress, pathToProp: string[]) {
  const sheet =
    studio._store.getState().historic.coreByProject?.[address.projectId]?.sheetsById?.[
      address.sheetId
    ]
  const track = sheet?.sequence?.tracksByObject?.[address.objectKey]
  // Theatre keys tracks by the prop path, JSON-encoded (core's encodePathToProp).
  const trackId: string | undefined = track?.trackIdByPropPath?.[JSON.stringify(pathToProp)]
  const keyframes: Array<{ id: string }> = (trackId && track.trackData?.[trackId]?.keyframes) || []
  return trackId ? { trackId, keyframeIds: keyframes.map((k) => k.id) } : null
}

/** Delete all of a prop's keyframes, wherever they are (even past the sequence's end, where
 *  the playhead, and so the public `unset`, can't reach). */
export function deleteKeyframes(address: ObjectAddress, pathToProp: string[]): boolean {
  return withStudio((studio) => {
    const track = trackOf(studio, address, pathToProp)
    if (!track || track.keyframeIds.length === 0) return
    studio.transaction(({ stateEditors }) =>
      stateEditors.coreByProject.historic.sheetsById.sequence.deleteKeyframes({
        ...address,
        ...track,
      }),
    )
  })
}

/** Make every tween of a prop's keyframes linear (Theatre's default eases in and out). */
export function linearTweens(address: ObjectAddress, pathToProp: string[]): boolean {
  return withStudio((studio) => {
    const track = trackOf(studio, address, pathToProp)
    if (!track || track.keyframeIds.length < 2) return
    const { trackId, keyframeIds } = track
    studio.transaction(({ stateEditors }) =>
      stateEditors.coreByProject.historic.sheetsById.sequence.setTweenBetweenKeyframes({
        ...address,
        trackId,
        keyframeIds,
        handles: LINEAR_HANDLES,
      }),
    )
  })
}

/** Make a prop static again with `value` (dropping its keyframes), like Studio's "Make
 *  static". No-op for a prop that isn't animated. */
export function makeStatic(address: ObjectAddress, pathToProp: string[], value: unknown): boolean {
  return withStudio((studio) => {
    if (!trackOf(studio, address, pathToProp)) return
    studio.transaction(({ stateEditors }) =>
      stateEditors.coreByProject.historic.sheetsById.sequence.setPrimitivePropAsStatic({
        ...address,
        pathToProp,
        value,
      }),
    )
  })
}

let dockTransaction: { commit(): void; discard(): void } | null = null

/**
 * Place a Studio panel (e.g. 'sequenceEditor', the timeline). A temporary transaction, never
 * committed, so docking doesn't add undo steps or get saved; each call replaces the last.
 */
export function placePanel(panelId: string, position: PanelPosition): void {
  withStudio((studio) => {
    dockTransaction?.discard()
    dockTransaction = studio.tempTransaction(({ stateEditors }) =>
      stateEditors.studio.historic.panelPositions.setPanelPosition({ panelId, position }),
    )
  })
}

/** Unpin Studio's outline and details panels, so they only open from its toolbar instead of
 *  covering the sidebar and canvas. */
export function unpinSidePanels(): void {
  withStudio((studio) =>
    studio.transaction(({ stateEditors }) => {
      stateEditors.studio.ahistoric.setPinOutline(false)
      stateEditors.studio.ahistoric.setPinDetails(false)
    }),
  )
}
