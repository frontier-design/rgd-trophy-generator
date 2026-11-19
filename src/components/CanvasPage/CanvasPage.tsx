import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { downloadBlob, maxImageScale } from '../../export'
import { useAutosave, useInfiniteCanvas, usePatternMaps, useSettled, useUndo } from '../../hooks'
import type { HeightMap } from '../../render3d'
import { ARTBOARD } from '../../state'
import { ControlPanel, type HideableField } from '../ControlPanel'
import { loadCanvasDocument, storeCanvasDocument, type CanvasDocument } from './canvasDocument'
import { CanvasScene, type SceneExporter } from './CanvasScene'
import { CanvasComposition } from './CanvasComposition'
import type { CompositionImageRect, CompositionNode } from './compositionNode'
import { useSceneImages } from './useSceneImages'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import {
  CARD_COMPACT_SCALE,
  cardScale,
  connect,
  createModifier,
  inputPort,
  linkPath,
  outputPort,
  createSceneModifiersResolver,
  type NodeLink,
  type ModifierKind,
  type ModifierNode,
  type SceneModifiers,
} from './graph'
import {
  createSceneNode,
  FRAME_PRESETS,
  fitSceneToFrame,
  type FrameRect,
  measureDefaultText,
  type ImageExportOptions,
  sceneParams,
  withParams,
  type SceneNode,
} from './sceneNode'
import { MASTER_ID, withMaster, type MasterNode, type MasterParams } from './master'
import { NodeCard, type ParamsPatch } from './NodeCard'
import { useTypingPlayback } from './useTypingPlayback'
import {
  createNodePositionStore,
  NodeDragContext,
  useNodePosition,
  type NodePosition,
} from './nodeDrag'
import {
  clearSelection,
  copySelection,
  pasteSelection,
  pickSelection,
  pruneSelection,
  replaceSelection,
  type Selection,
  type CopiedSubgraph,
} from './selection'
import { SelectionMarquee } from './SelectionMarquee'

/** Grid spacing at 100% (px): fine lines, and a heavier line every MAJOR of them. */
const GRID = 24
const MAJOR = 5
/** Below this on-screen spacing (px), the fine lines are dropped (too dense to read). */
const MIN_FINE_SPACING = 6
/** The selected scene's controls: their width, their gap to the scene, how close they come
 *  to the window's edges, and the least height they keep on screen (px). */
const CONTROLS = { width: 340, gap: 16, inset: 12, minHeight: 240 }
/** Where a right-click keeps the browser's own menu (copy, paste…). */
const NATIVE_MENU = 'textarea, input, select'
/** Room kept for the right-click menu, so it opens inside the window (px). */
const MENU_SIZE = { width: 200, height: 300 }
/** Shared by scenes with nothing linked, so they don't re-render for nothing. */
const NO_MODIFIERS: SceneModifiers = {
  twists: [],
  etches: [],
  textures: [],
  patterns: [],
  linked: false,
}

/** The scene panel leaves out what the master node sets for every scene. */
const MASTER_FIELDS: ReadonlySet<HideableField> = new Set<HideableField>([
  'align',
  'mirror',
  'overshoot',
  'roundTop',
  'taper',
  'smoothJoins',
  'shading',
  'banding',
  'gradientScale',
  'tilt',
  'wobble',
  'edgeHue',
  'ledge',
  'grain',
  'grainSize',
  'background',
  'view',
])

/** With a lighting node linked, the panel leaves out its lighting section too. */
const MASTER_AND_LIGHTING_FIELDS: ReadonlySet<HideableField> = new Set<HideableField>([
  ...MASTER_FIELDS,
  'lighting',
])

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** What a right-click was on. */
type MenuTarget = { kind: 'scene' | 'composition' | ModifierKind; id: string } | null

/** What was copied (⌘C, or the right-click menu): kept for the session, so it pastes into
 *  this canvas again after switching pages. */
let copied: CopiedSubgraph | null = null

interface CanvasPageProps {
  /** The page dropdown, floating at the canvas's top left. */
  tools: ReactNode
}

/**
 * The canvas page: an endless gridded canvas filling the window (no sidebar), to drag and
 * scroll around (hooks/useInfiniteCanvas), with the page dropdown floating at its top left.
 * A node editor: right-click → insert scene places a generator scene (trophy, text) at the
 * click; insert twist / insert etch place modifier nodes (fields on them) whose output
 * ports link, by dragging, to scenes' input ports: twists flute their trophies, etches
 * engrave a strip of lines on them. Press a node to select it (a
 * scene's controls appear beside it), drag it to move it; a scene's text edits in place.
 * Dragging from a linked input picks its last link up (drop it elsewhere or on nothing).
 * Delete/Backspace or right-click → delete removes the selected node and its links. The
 * grid is a CSS background following the view; the world layer, moved and scaled with the
 * view, holds the nodes and their links.
 */
export function CanvasPage({ tools }: CanvasPageProps) {
  // Picks up where it was left: the autosaved canvas (or an opened project).
  const [saved] = useState(loadCanvasDocument)
  const canvasRef = useRef<HTMLElement>(null)
  const { view, size, reset } = useInfiniteCanvas(canvasRef, saved.view)
  const [scenes, setScenes] = useState<SceneNode[]>(saved.scenes)
  const [compositions, setCompositions] = useState<CompositionNode[]>(saved.compositions)
  const [modifiers, setModifiers] = useState<ModifierNode[]>(saved.modifiers)
  const typing = useTypingPlayback(modifiers)
  const [links, setLinks] = useState<NodeLink[]>(saved.links)
  const [master, setMaster] = useState<MasterNode>(saved.master)
  // The master's settings, for updates made in callbacks (every scene keeps them).
  const masterRef = useRef(master.params)
  useEffect(() => {
    masterRef.current = master.params
  })
  const [selection, updateSelection] = useState<Selection>(clearSelection)
  // Drag start needs event-time selection before React commits the pointer-down update.
  const selectionRef = useRef(selection)
  const setSelection = useCallback((next: Selection | ((current: Selection) => Selection)) => {
    const value = typeof next === 'function' ? next(selectionRef.current) : next
    selectionRef.current = value
    updateSelection(value)
  }, [])
  const selectNode = useCallback(
    (id: string, additive = false, preserveGroup = true) => {
      setSelection((current) =>
        !additive && !preserveGroup ? replaceSelection([id]) : pickSelection(current, id, additive),
      )
    },
    [setSelection],
  )
  const selectOnly = useCallback(
    (id: string) => setSelection(replaceSelection([id])),
    [setSelection],
  )
  const clearSelected = useCallback(() => setSelection(clearSelection()), [setSelection])
  const addSelected = useCallback(
    (ids: string[]) => {
      setSelection((current) =>
        replaceSelection([...current.ids, ...ids], ids.at(-1) ?? current.activeId),
      )
    },
    [setSelection],
  )
  const selectedIds = useMemo(() => new Set(selection.ids), [selection.ids])
  /** The right-click menu: where it was opened (canvas element px) and on what. */
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null)
  /** Nodes inserted so far of each kind, for their names and ids. */
  const [inserted, setInserted] = useState(saved.inserted)
  const insertedRef = useRef(inserted)
  const reserveCount = (kind: keyof typeof inserted) => {
    const previous = insertedRef.current[kind]
    const count = (Number.isFinite(previous) ? previous : 0) + 1
    insertedRef.current = { ...insertedRef.current, [kind]: count }
    setInserted(insertedRef.current)
    return count
  }
  /** A link being dragged from a node's output, its loose end at the pointer (canvas px). */
  const [pending, setPending] = useState<{ from: string; x: number; y: number } | null>(null)

  // Autosaved shortly after every change (and when leaving the page or closing the tab).
  const autosaved = useMemo<CanvasDocument>(
    () => ({ version: 1, scenes, compositions, modifiers, links, master, inserted, view }),
    [scenes, compositions, modifiers, links, master, inserted, view],
  )
  useAutosave('canvas', autosaved, { serialize: storeCanvasDocument })

  // Undo / redo (⌘Z, ⇧⌘Z) over the scenes, nodes and links: each change once it settles
  // (a drag or a slider's whole move is one step). Not the view, selection or id counters.
  const content = useMemo(
    () => ({ scenes, compositions, modifiers, links, master }),
    [scenes, compositions, modifiers, links, master],
  )
  const history = useUndo(content, (state) => {
    setScenes(state.scenes)
    setCompositions(state.compositions)
    setModifiers(state.modifiers)
    setLinks(state.links)
    setMaster(state.master)
    masterRef.current = state.master.params
    setPending(null)
    // Selection is view state: prune missing nodes, never restore it from undo.
    setSelection((current) =>
      pruneSelection(current, [
        MASTER_ID,
        ...state.scenes.map((node) => node.id),
        ...state.compositions.map((node) => node.id),
        ...state.modifiers.map((node) => node.id),
      ]),
    )
  })

  const { checkpoint } = history
  // A drag's one document update closes its own undo step after useUndo sees the commit.
  const moveCommitted = useRef(false)
  useEffect(() => {
    if (!moveCommitted.current) return
    moveCommitted.current = false
    checkpoint()
  }, [content, checkpoint])

  const positions = useMemo(() => createNodePositionStore(), [])
  const boardNodes = useRef(new Map<string, NodePosition & { id: string }>())
  useEffect(() => {
    boardNodes.current = new Map(
      [...scenes, ...compositions, ...modifiers, master].map((node) => [node.id, node]),
    )
  }, [scenes, compositions, modifiers, master])
  const participants = useCallback((id: string) => {
    const ids = selectionRef.current.ids.includes(id) ? selectionRef.current.ids : [id]
    return ids.flatMap((key) => {
      const node = boardNodes.current.get(key)
      return node ? [{ id: node.id, x: node.x, y: node.y }] : []
    })
  }, [])
  const commitMoves = useCallback((moves: ReadonlyMap<string, NodePosition>) => {
    moveCommitted.current = true
    setScenes((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setCompositions((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setModifiers((current) =>
      current.some((node) => moves.has(node.id))
        ? current.map((node) => (moves.has(node.id) ? { ...node, ...moves.get(node.id)! } : node))
        : current,
    )
    setMaster((current) =>
      moves.has(MASTER_ID) ? { ...current, ...moves.get(MASTER_ID)! } : current,
    )
  }, [])
  const dragController = useMemo(
    () => ({ positions, checkpoint, participants, commit: commitMoves, onTap: selectOnly }),
    [positions, checkpoint, participants, commitMoves, selectOnly],
  )
  useEffect(() => () => positions.dispose(), [positions])

  // The view and links, for pointer handlers (canvas px from window px; picking links up).
  const viewRef = useRef(view)
  const linksRef = useRef(links)
  useEffect(() => {
    viewRef.current = view
    linksRef.current = links
  })
  const getZoom = useCallback(() => viewRef.current.zoom, [])
  // Each mounted scene's image exporter (for its controls' export button).
  const exporters = useRef(new Map<string, SceneExporter>())
  const setExporter = useCallback((id: string, exporter: SceneExporter | null) => {
    if (exporter) exporters.current.set(id, exporter)
    else exporters.current.delete(id)
  }, [])
  const getExporter = useCallback((id: string) => exporters.current.get(id), [])
  // Scenes render their 3D view at the zoom once it settles (see CanvasScene).
  const renderZoom = useSettled(view.zoom, 200)
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const { x, y, zoom } = viewRef.current
    return {
      x: (clientX - (rect?.left ?? 0) - x) / zoom,
      y: (clientY - (rect?.top ?? 0) - y) / zoom,
    }
  }, [])

  // Every update keeps the master's settings (e.g. fitting to a frame turns the mirror on).
  const updateScene = useCallback(
    (id: string, update: (node: SceneNode) => SceneNode) =>
      setScenes((current) =>
        current.map((node) =>
          node.id === id ? withMaster(update(node), masterRef.current) : node,
        ),
      ),
    [],
  )
  /** A master node edit: applied to every scene. */
  const setMasterParams = useCallback((patch: Partial<MasterParams>) => {
    const params = { ...masterRef.current, ...patch }
    masterRef.current = params
    setMaster((current) => ({ ...current, params }))
    setScenes((current) => current.map((node) => withMaster(node, params)))
  }, [])
  const moveScene = useCallback(
    (id: string, x: number, y: number) => {
      moveCommitted.current = true
      updateScene(id, (node) => ({ ...node, x, y }))
    },
    [updateScene],
  )
  // A resize handle's drag: the new frame (the text and trophy fitted to it, live).
  const resizeScene = useCallback(
    (id: string, { x, y, width, height }: FrameRect) =>
      updateScene(id, (node) =>
        node.frame.width === width && node.frame.height === height && node.x === x && node.y === y
          ? node
          : { ...fitSceneToFrame(node, { width, height }), x, y },
      ),
    [updateScene],
  )
  const setSceneText = useCallback(
    (id: string, text: string) => {
      const source = [...links]
        .reverse()
        .find(
          (link) =>
            !link.muted &&
            link.to === id &&
            modifiers.some((node) => node.id === link.from && node.kind === 'text'),
        )
      if (source) {
        setModifiers((current) =>
          current.map((node) =>
            node.id === source.from && node.kind === 'text' ? { ...node, params: { text } } : node,
          ),
        )
      } else {
        updateScene(id, (node) => ({ ...node, settings: { ...node.settings, text } }))
      }
    },
    [updateScene, links, modifiers],
  )
  const updateModifier = useCallback(
    (id: string, update: (node: ModifierNode) => ModifierNode) =>
      setModifiers((current) => {
        const next = current.map((node) => (node.id === id ? update(node) : node))
        return next.every((node, index) => node === current[index]) ? current : next
      }),
    [],
  )
  const moveModifier = useCallback(
    (id: string, x: number, y: number) => {
      moveCommitted.current = true
      if (id === MASTER_ID) setMaster((current) => ({ ...current, x, y }))
      else updateModifier(id, (node) => ({ ...node, x, y }))
    },
    [updateModifier],
  )
  const setModifierCollapsed = useCallback(
    (id: string, collapsed: boolean) =>
      id === MASTER_ID
        ? setMaster((current) => ({ ...current, collapsed }))
        : updateModifier(id, (node) => ({ ...node, collapsed })),
    [updateModifier],
  )
  const setModifierParams = useCallback(
    (id: string, patch: ParamsPatch) =>
      id === MASTER_ID
        ? setMasterParams(patch as Partial<MasterParams>)
        : updateModifier(id, (node) =>
            Object.entries(patch as Record<string, unknown>).every(
              ([key, value]) => node.params[key as keyof typeof node.params] === value,
            )
              ? node
              : ({ ...node, params: { ...node.params, ...patch } } as ModifierNode),
          ),
    [updateModifier, setMasterParams],
  )
  /** Remove selected nodes and incident links; the master is movable but never deleted. */
  const deleteNodes = useCallback(
    (ids: readonly string[]) => {
      const removed = new Set(ids.filter((id) => id !== MASTER_ID))
      if (!removed.size) return
      positions.dispose()
      checkpoint()
      moveCommitted.current = true
      setScenes((current) => current.filter((node) => !removed.has(node.id)))
      setCompositions((current) => current.filter((node) => !removed.has(node.id)))
      setModifiers((current) => current.filter((node) => !removed.has(node.id)))
      setLinks((current) =>
        current.filter((link) => !removed.has(link.from) && !removed.has(link.to)),
      )
      setSelection((current) =>
        replaceSelection(
          current.ids.filter((id) => !removed.has(id)),
          current.activeId,
        ),
      )
    },
    [positions, checkpoint, setSelection],
  )
  const closeMenu = useCallback(() => setMenu(null), [])

  // Dragging a link: a node's output starts one; a linked input picks its last one up.
  const startLink = useCallback(
    (from: string, e: ReactPointerEvent) => setPending({ from, ...toCanvas(e.clientX, e.clientY) }),
    [toCanvas],
  )
  const pickUpLink = useCallback(
    (sceneId: string, e: ReactPointerEvent) => {
      selectOnly(sceneId)
      const last = linksRef.current.findLast((link) => link.to === sceneId)
      if (!last) return
      setLinks((current) =>
        current.filter((link) => !(link.from === last.from && link.to === last.to)),
      )
      setPending({ from: last.from, ...toCanvas(e.clientX, e.clientY) })
    },
    [toCanvas, selectOnly],
  )
  const pendingFrom = pending?.from
  useEffect(() => {
    if (!pendingFrom) return
    const onMove = (e: PointerEvent) =>
      setPending((current) => current && { ...current, ...toCanvas(e.clientX, e.clientY) })
    // Dropped on a scene's input: linked. Anywhere else: dropped.
    const onUp = (e: PointerEvent) => {
      const under = document.elementFromPoint?.(e.clientX, e.clientY) ?? e.target
      const port = under instanceof Element ? under.closest<HTMLElement>('[data-port="in"]') : null
      const to = port?.dataset.sceneId
      const sourceIsScene = scenes.some((node) => node.id === pendingFrom)
      const targetIsComposition = compositions.some((node) => node.id === to)
      const valid =
        to &&
        (sourceIsScene
          ? targetIsComposition
          : modifiers.some((node) => node.id === pendingFrom) &&
            scenes.some((node) => node.id === to))
      if (valid) {
        setLinks((current) =>
          connect(
            targetIsComposition ? current.filter((link) => link.to !== to) : current,
            pendingFrom,
            to,
          ),
        )
        if (targetIsComposition) {
          const source = scenes.find((node) => node.id === pendingFrom)
          if (source)
            setCompositions((current) =>
              current.map((node) => {
                if (node.id !== to) return node
                const scale = Math.min(
                  node.frame.width / source.frame.width,
                  node.frame.height / source.frame.height,
                )
                const width = source.frame.width * scale,
                  height = source.frame.height * scale
                return {
                  ...node,
                  image: {
                    x: (node.frame.width - width) / 2,
                    y: (node.frame.height - height) / 2,
                    width,
                    height,
                  },
                }
              }),
            )
        }
      }
      setPending(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [pendingFrom, toCanvas, scenes, compositions, modifiers])

  /** A new scene centered on a point of the canvas element (px), selected. Its layout is
   *  fitted to the frame, from its text measured once the font has loaded. */
  const insertScene = async (x: number, y: number) => {
    const count = reserveCount('scene')
    const centerX = (x - view.x) / view.zoom
    const centerY = (y - view.y) / view.zoom
    const measure = await measureDefaultText()
    const id = `scene-${count}`
    const node = withMaster(
      createSceneNode(
        id,
        `scene ${count}`,
        centerX - ARTBOARD.width / 2,
        centerY - ARTBOARD.height / 2,
        measure,
      ),
      master.params,
    )
    setScenes((current) => [...current, node])
    selectOnly(id)
  }

  const insertComposition = (x: number, y: number) => {
    const count = reserveCount('composition')
    const id = `composition-${count}`
    setCompositions((current) => [
      ...current,
      {
        id,
        name: `composition ${count}`,
        x: (x - view.x) / view.zoom - ARTBOARD.width / 2,
        y: (y - view.y) / view.zoom - ARTBOARD.height / 2,
        frame: { width: ARTBOARD.width, height: ARTBOARD.height },
        image: { x: 0, y: 0, width: ARTBOARD.width, height: ARTBOARD.height },
      },
    ])
    selectOnly(id)
  }
  const moveComposition = useCallback((id: string, x: number, y: number) => {
    setCompositions((current) => current.map((node) => (node.id === id ? { ...node, x, y } : node)))
  }, [])
  const resizeComposition = useCallback((id: string, rect: FrameRect) => {
    setCompositions((current) =>
      current.map((node) =>
        node.id === id
          ? { ...node, x: rect.x, y: rect.y, frame: { width: rect.width, height: rect.height } }
          : node,
      ),
    )
  }, [])
  const setCompositionImage = useCallback((id: string, image: CompositionImageRect) => {
    setCompositions((current) =>
      current.map((node) => (node.id === id ? { ...node, image } : node)),
    )
  }, [])

  /** A new modifier node, its top-left at a point of the canvas element (px), selected. */
  const insertModifier = (kind: ModifierKind, x: number, y: number) => {
    const count = reserveCount(kind)
    const id = `${kind}-${count}`
    const node = createModifier(
      kind,
      id,
      `${kind} ${count}`,
      (x - view.x) / view.zoom,
      (y - view.y) / view.zoom,
    )
    setModifiers((current) => [...current, node])
    selectOnly(id)
  }

  // Clipboard snapshots keep relative positions and only the selected subgraph's links.
  const [hasCopy, setHasCopy] = useState(copied !== null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const copyNodes = (selected: Selection = selectionRef.current) => {
    const snapshot = copySelection(selected, scenes, modifiers, links, compositions)
    copied = snapshot.ids.length ? snapshot : null
    setHasCopy(copied !== null)
  }
  const pasteCopy = (at: NodePosition | null, entry: CopiedSubgraph | null = copied) => {
    if (!entry?.ids.length) return
    positions.dispose()
    checkpoint()
    const offset = 40 / viewRef.current.zoom
    const pasted = pasteSelection(
      entry,
      insertedRef.current,
      at ? { at } : { offset: { x: offset, y: offset } },
    )
    insertedRef.current = pasted.inserted
    setInserted(pasted.inserted)
    moveCommitted.current = true
    setScenes((current) => [
      ...current,
      ...pasted.scenes.map((node) => withMaster(node, masterRef.current)),
    ])
    setCompositions((current) => [...current, ...pasted.compositions])
    setModifiers((current) => [...current, ...pasted.modifiers])
    setLinks((current) => [...current, ...pasted.links])
    setSelection(replaceSelection(pasted.ids, pasted.activeId))
  }
  const duplicateNodes = (selected: Selection = selectionRef.current) => {
    pasteCopy(null, copySelection(selected, scenes, modifiers, links, compositions))
  }
  // The keys, with this render's state (re-subscribed each render, as it changes). Not while
  // typing: a text field keeps its own undo and clipboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const { target } = e
      if (target instanceof Element && target.closest('textarea, input, select, [contenteditable]'))
        return
      const key = e.key.toLowerCase()
      // ⌘Z undoes, ⇧⌘Z (or Ctrl+Y) redoes. Stopped here (captured on the window) so no other
      // page's shortcuts see it.
      if (key === 'z' || (key === 'y' && e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        e.stopPropagation()
        positions.dispose()
        if (key === 'z' && !e.shiftKey) history.undo()
        else history.redo()
        return
      }
      if (e.shiftKey) return
      if (key === 'c' && selectionRef.current.ids.length) {
        e.preventDefault()
        copyNodes()
      } else if (key === 'v' && copied) {
        e.preventDefault()
        pasteCopy(pointer.current)
      } else if (key === 'd' && selectionRef.current.ids.length) {
        e.preventDefault()
        duplicateNodes()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })

  // Selection remains view state; text fields keep their own editing shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { target } = e
      if (target instanceof Element && target.closest('textarea, input, select, [contenteditable]'))
        return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectionRef.current.ids.length) return
        e.preventDefault()
        deleteNodes(selectionRef.current.ids)
      } else if (e.key === 'Escape') {
        positions.dispose()
        clearSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteNodes, positions, clearSelected])

  // Pattern nodes' height maps, built in the background.
  const patternNodes = useMemo(
    () => modifiers.filter((node) => node.kind === 'pattern'),
    [modifiers],
  )
  const patternStatuses = usePatternMaps(patternNodes)
  const patternMaps = useMemo(() => {
    const maps = new Map<string, HeightMap>()
    for (const [id, status] of patternStatuses) if (status.map) maps.set(id, status.map)
    return maps
  }, [patternStatuses])
  // Position/name/fold changes don't invalidate artwork, and unrelated scenes keep their inputs.
  const resolveModifiers = useMemo(() => createSceneModifiersResolver(), [])
  const sceneModifiers = useMemo(
    () => resolveModifiers(links, typing.previewNodes, patternMaps),
    [resolveModifiers, links, typing.previewNodes, patternMaps],
  )
  const [visualRevisions, setVisualRevisions] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  )
  const onVisualChange = useCallback((id: string) => {
    setVisualRevisions((current) => new Map(current).set(id, (current.get(id) ?? 0) + 1))
  }, [])
  const sceneImages = useSceneImages(scenes, links, sceneModifiers, getExporter, visualRevisions)
  const linkedNodes = useMemo(() => new Set(links.map((link) => link.from)), [links])
  const mutedNodes = useMemo(() => {
    const muted = new Set(links.filter((link) => link.muted).map((link) => link.from))
    for (const link of links) if (!link.muted) muted.delete(link.from)
    return muted
  }, [links])
  const toggleOutgoingMute = useCallback((id: string) => {
    setLinks((current) => {
      const outgoing = current.filter((link) => link.from === id)
      if (!outgoing.length) return current
      const muted = outgoing.some((link) => !link.muted)
      return current.map((link) => (link.from === id ? { ...link, muted } : link))
    })
  }, [])
  // Hit areas exist for all linked range modifiers, independently of selection.
  const rangeModifiersByScene = useMemo(() => {
    const byId = new Map(modifiers.map((node) => [node.id, node]))
    const grouped = new Map<string, ModifierNode[]>()
    for (const link of links) {
      if (link.muted) continue
      const modifier = byId.get(link.from)
      if (
        modifier &&
        modifier.kind !== 'material' &&
        modifier.kind !== 'lighting' &&
        modifier.kind !== 'text'
      )
        grouped.set(link.to, [...(grouped.get(link.to) ?? []), modifier])
    }
    return grouped
  }, [modifiers, links])

  // Zoomed out far, node cards show only their headers (they're small, and it's less to draw).
  const compactCards = cardScale(view.zoom) < CARD_COMPACT_SCALE
  const fine = GRID * view.zoom
  const grid = {
    '--grid-x': `${view.x}px`,
    '--grid-y': `${view.y}px`,
    '--grid-fine': `${fine}px`,
    '--grid-major': `${fine * MAJOR}px`,
    '--grid-fine-color': fine < MIN_FINE_SPACING ? 'transparent' : undefined,
  } as CSSProperties

  // The selected scene's controls sit just right of it, top-aligned, kept on screen.
  const selected = scenes.find((node) => node.id === selection.activeId)

  // The links' curves, from each node's output to each scene's input.
  const sourcesById = new Map<string, ModifierNode | SceneNode>(
    [...modifiers, ...scenes].map((node) => [node.id, node]),
  )
  const targetsById = new Map<string, SceneNode | CompositionNode>(
    [...scenes, ...compositions].map((node) => [node.id, node]),
  )
  const linkPaths = links.flatMap((link) => {
    const from = sourcesById.get(link.from)
    const to = targetsById.get(link.to)
    if (!from || !to) return []
    const key = `${link.from}→${link.to}`
    return [{ key, from, to, muted: link.muted }]
  })
  const pendingSource = pending ? sourcesById.get(pending.from) : undefined
  const pendingPath =
    pending && pendingSource
      ? linkPath(sourcePort(pendingSource, view.zoom), pending, view.zoom)
      : null

  /** A point of the canvas element (px) in canvas px. */
  const toCanvasAt = (x: number, y: number) => ({
    x: (x - view.x) / view.zoom,
    y: (y - view.y) / view.zoom,
  })
  const subject = selection.ids.length > 1 ? 'selection' : menu?.target?.kind
  const disconnectTarget =
    menu?.target?.kind === 'scene' || menu?.target?.kind === 'composition' ? menu.target.id : null
  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: 'insert scene', onSelect: () => void insertScene(menu.x, menu.y) },
        { label: 'insert composition', onSelect: () => insertComposition(menu.x, menu.y) },
        { label: 'insert text', onSelect: () => insertModifier('text', menu.x, menu.y) },
        { label: 'insert twist', onSelect: () => insertModifier('twist', menu.x, menu.y) },
        { label: 'insert etch', onSelect: () => insertModifier('etch', menu.x, menu.y) },
        { label: 'insert pattern', onSelect: () => insertModifier('pattern', menu.x, menu.y) },
        { label: 'insert material', onSelect: () => insertModifier('material', menu.x, menu.y) },
        { label: 'insert lighting', onSelect: () => insertModifier('lighting', menu.x, menu.y) },
        { label: 'insert texture', onSelect: () => insertModifier('texture', menu.x, menu.y) },
        ...(disconnectTarget && links.some((link) => link.to === disconnectTarget)
          ? [
              {
                label: 'disconnect inputs',
                onSelect: () =>
                  setLinks((current) => current.filter((link) => link.to !== disconnectTarget)),
              },
            ]
          : []),
        ...(hasCopy
          ? [{ label: 'paste', onSelect: () => pasteCopy(toCanvasAt(menu.x, menu.y)) }]
          : []),
        ...(subject
          ? [
              { label: `copy ${subject}`, onSelect: () => copyNodes() },
              { label: `duplicate ${subject}`, onSelect: () => duplicateNodes() },
              { label: `delete ${subject}`, onSelect: () => deleteNodes(selectionRef.current.ids) },
            ]
          : []),
      ]
    : []

  return (
    <NodeDragContext.Provider value={dragController}>
      <main className="canvas-page">
        <section
          ref={canvasRef}
          className="infinite-canvas"
          aria-label="Canvas"
          style={grid}
          data-linking={pending ? 'on' : undefined}
          onPointerMove={(e) => {
            pointer.current = toCanvas(e.clientX, e.clientY)
          }}
          onPointerLeave={() => {
            pointer.current = null
          }}
          onFocusCapture={(e) => {
            const target = e.target
            if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains('rag-text'))
              return
            const sceneId = target.closest<HTMLElement>('[data-scene-node]')?.dataset.sceneId
            const source = links.findLast(
              (link) =>
                !link.muted &&
                link.to === sceneId &&
                modifiers.some((node) => node.id === link.from && node.kind === 'text'),
            )
            if (source) typing.stop(source.from)
          }}
          onContextMenu={(e) => {
            const target = e.target as Element
            if (target.closest(NATIVE_MENU) || target.closest('[data-scene-controls]')) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const sceneId = target.closest<HTMLElement>('[data-scene-node]')?.dataset.sceneId
            const compositionId =
              target.closest<HTMLElement>('[data-composition-node]')?.dataset.sceneId
            const nodeElement = target.closest<HTMLElement>('[data-canvas-node]')
            const nodeId = nodeElement?.dataset.nodeId
            const nodeKind = nodeElement?.dataset.kind as ModifierKind | undefined
            const menuTarget: MenuTarget = sceneId
              ? { kind: 'scene', id: sceneId }
              : compositionId
                ? { kind: 'composition', id: compositionId }
                : nodeId && nodeKind && nodeId !== MASTER_ID
                  ? { kind: nodeKind, id: nodeId }
                  : null
            if (menuTarget) selectNode(menuTarget.id)
            else if (nodeId === MASTER_ID) selectNode(MASTER_ID)
            setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, target: menuTarget })
          }}
        >
          <div
            className="infinite-canvas-world"
            style={
              {
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                '--zoom': view.zoom,
                '--card-scale': cardScale(view.zoom),
              } as CSSProperties
            }
          >
            {scenes.map((node) => (
              <CanvasScene
                key={node.id}
                node={node}
                selected={selectedIds.has(node.id)}
                getZoom={getZoom}
                renderZoom={renderZoom}
                modifiers={sceneModifiers.get(node.id) ?? NO_MODIFIERS}
                rangeModifiers={rangeModifiersByScene.get(node.id)}
                selectedRangeModifierIds={selectedIds}
                textNodeId={
                  links
                    .filter(
                      (link) =>
                        !link.muted &&
                        link.to === node.id &&
                        modifiers.some(
                          (modifier) => modifier.id === link.from && modifier.kind === 'text',
                        ),
                    )
                    .at(-1)?.from
                }
                selectedTextNodeIds={selectedIds}
                onRangeChange={setModifierParams}
                onRangeBoundary={checkpoint}
                onSelect={selectNode}
                onInputDown={pickUpLink}
                onOutputDown={startLink}
                onToggleMute={toggleOutgoingMute}
                muted={mutedNodes.has(node.id)}
                onMove={moveScene}
                onTextChange={setSceneText}
                onExporter={setExporter}
                onVisualChange={onVisualChange}
                onResize={resizeScene}
              />
            ))}
            {compositions.map((node) => {
              const link = links.findLast((item) => item.to === node.id && !item.muted)
              return (
                <CanvasComposition
                  key={node.id}
                  node={node}
                  selected={selectedIds.has(node.id)}
                  getZoom={getZoom}
                  imageUrl={link ? sceneImages.get(link.from) : undefined}
                  connected={Boolean(link)}
                  onSelect={selectNode}
                  onMove={moveComposition}
                  onInputDown={pickUpLink}
                  onResize={resizeComposition}
                  onImageChange={setCompositionImage}
                />
              )
            })}
            <svg className="node-links" aria-hidden="true">
              {linkPaths.map(({ key, from, to, muted }) => (
                <NodeLinkPath key={key} from={from} to={to} zoom={view.zoom} muted={muted} />
              ))}
              {pendingPath && <path d={pendingPath} data-pending />}
            </svg>
            <NodeCard
              node={master}
              selected={selectedIds.has(MASTER_ID)}
              getZoom={getZoom}
              connected={false}
              compact={compactCards}
              onCollapsedChange={setModifierCollapsed}
              onSelect={selectNode}
              onMove={moveModifier}
              onParamsChange={setModifierParams}
              onOutputDown={startLink}
            />
            {modifiers.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                selected={selectedIds.has(node.id)}
                getZoom={getZoom}
                connected={linkedNodes.has(node.id)}
                muted={mutedNodes.has(node.id)}
                onToggleMute={toggleOutgoingMute}
                pattern={patternStatuses.get(node.id)}
                typingSpeed={typing.speeds[node.id] ?? typing.defaultSpeed}
                typingPlaying={Boolean(typing.playing[node.id])}
                onTypingSpeed={typing.setSpeed}
                onTypingToggle={typing.toggle}
                compact={compactCards}
                onCollapsedChange={setModifierCollapsed}
                onSelect={selectNode}
                onMove={moveModifier}
                onParamsChange={setModifierParams}
                onOutputDown={startLink}
              />
            ))}
          </div>
          <SelectionMarquee canvasRef={canvasRef} onSelect={addSelected} onClear={clearSelected} />
          {scenes.length === 0 && compositions.length === 0 && modifiers.length === 0 && (
            <p className="canvas-hint">Right-click to insert a scene</p>
          )}
          {selected && (
            <PositionedSceneControls node={selected} view={view} size={size}>
              <SceneControls
                key={selected.id}
                node={selected}
                litByNode={sceneModifiers.get(selected.id)?.lighting !== undefined}
                onChange={updateScene}
                exporter={getExporter}
              />
            </PositionedSceneControls>
          )}
          {menu && (
            <ContextMenu
              x={clamp(menu.x, 0, Math.max(0, size.width - MENU_SIZE.width))}
              y={clamp(menu.y, 0, Math.max(0, size.height - MENU_SIZE.height))}
              items={menuItems}
              onClose={closeMenu}
            />
          )}
          <div className="canvas-page-tools" data-no-pan>
            {tools}
          </div>
          <div className="view-tools" data-no-pan>
            <output className="view-zoom" aria-label="Zoom">
              {Math.round(view.zoom * 100)}%
            </output>
            <button type="button" className="control-button" onClick={reset}>
              reset
            </button>
          </div>
        </section>
      </main>
    </NodeDragContext.Provider>
  )
}

function sourcePort(node: ModifierNode | SceneNode, zoom: number) {
  return 'frame' in node
    ? { x: node.x + node.frame.width, y: node.y + node.frame.height * 0.25 }
    : outputPort(node, zoom)
}

/** Edge previews subscribe only to their endpoints, not the entire canvas document. */
const NodeLinkPath = memo(function NodeLinkPath({
  from,
  to,
  zoom,
  muted,
}: {
  from: ModifierNode | SceneNode
  to: SceneNode | CompositionNode
  zoom: number
  muted?: boolean
}) {
  const source = useNodePosition(from.id, from)
  const destination = useNodePosition(to.id, to)
  return (
    <path
      data-muted={muted || undefined}
      d={linkPath(
        sourcePort({ ...from, ...source }, zoom),
        inputPort({ ...to, ...destination }),
        zoom,
      )}
    />
  )
})

function PositionedSceneControls({
  node,
  view,
  size,
  children,
}: {
  node: SceneNode
  view: { x: number; y: number; zoom: number }
  size: { width: number; height: number }
  children: ReactNode
}) {
  const position = useNodePosition(node.id, node)
  const { width, gap, inset, minHeight } = CONTROLS
  const left = clamp(
    view.x + (position.x + node.frame.width) * view.zoom + gap,
    inset,
    Math.max(inset, size.width - width - inset),
  )
  const top = clamp(
    view.y + position.y * view.zoom,
    inset,
    Math.max(inset, size.height - minHeight - inset),
  )
  return (
    <div
      className="scene-controls"
      data-scene-controls
      data-no-pan
      data-own-wheel
      style={{ left, top, width, maxHeight: Math.max(0, size.height - top - inset) }}
    >
      {children}
    </div>
  )
}

interface SceneControlsProps {
  node: SceneNode
  /** A lighting node is linked: its lighting is used, so the panel leaves its own out. */
  litByNode: boolean
  onChange: (id: string, update: (node: SceneNode) => SceneNode) => void
  /** The scene's image exporter, if it's mounted. */
  exporter: (id: string) => SceneExporter | undefined
}

/** The selected scene's control panel. Memoized: the page re-renders on every pan frame
 *  (only the panel's position changes), and the panel is the page's largest part. */
const SceneControls = memo(function SceneControls({
  node,
  litByNode,
  onChange,
  exporter,
}: SceneControlsProps) {
  const update = (patch: (node: SceneNode) => SceneNode) => onChange(node.id, patch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { imageExport: options, frame } = node
  const maxScale = maxImageScale(frame.width, frame.height)
  const scale = Math.min(options.scale, maxScale)
  const setOptions = (patch: Partial<ImageExportOptions>) =>
    update((current) => ({ ...current, imageExport: { ...current.imageExport, ...patch } }))

  const exportImage = async () => {
    const run = exporter(node.id)
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const blob = await run({ ...options, scale })
      const name = node.name.replace(/\s+/g, '-')
      const ext = options.format === 'png' ? 'png' : 'jpg'
      downloadBlob(blob, `rgd-${name}-${frame.width * scale}x${frame.height * scale}.${ext}`)
    } catch (e) {
      setError(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ControlPanel
      tools={<span className="scene-controls-name">{node.name}</span>}
      params={sceneParams(node)}
      onParamsChange={(patch) => update((current) => withParams(current, patch))}
      revealControls={false}
      hidden={litByNode ? MASTER_AND_LIGHTING_FIELDS : MASTER_FIELDS}
      frame={{
        width: frame.width,
        height: frame.height,
        presets: FRAME_PRESETS,
        // A new size fits the text and trophy to it.
        onSizeChange: (width, height) =>
          update((current) => fitSceneToFrame(current, { width, height })),
        onFit: () => update((current) => fitSceneToFrame(current)),
      }}
      imageExport={{
        format: options.format,
        onFormatChange: (format) => setOptions({ format }),
        scale,
        onScaleChange: (next) => setOptions({ scale: next }),
        maxScale,
        transparent: options.transparent,
        onTransparentChange: (transparent) => setOptions({ transparent }),
        size: `${frame.width * scale} × ${frame.height * scale}`,
        busy,
        error,
        onExport: () => void exportImage(),
      }}
      debug={node.debug}
      onDebugChange={(debug) => update((current) => ({ ...current, debug }))}
      revolve={node.revolve}
      onRevolveChange={(revolve) =>
        update((current) => ({ ...current, revolve, animateRevolve: true }))
      }
      perspective={node.perspective}
      onPerspectiveChange={(perspective) => update((current) => ({ ...current, perspective }))}
    />
  )
})
