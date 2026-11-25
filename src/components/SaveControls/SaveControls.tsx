import { useCallback, useEffect, useRef, useState } from 'react'
import { useSaveStatus } from '../../hooks'
import {
  buildProjectFile,
  parseProjectFile,
  restoreProjectFile,
  saveProjectToDisk,
  suspendAutosave,
} from '../../state'
import { exportTimelineState } from '../../timeline'

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * Save and open, in a menu behind a hamburger button. Everything autosaves to the browser as
 * you work, quietly (only a save's result or a failure shows beside the button); **save**
 * (⌘/Ctrl+S) writes a project file with both pages and the timeline: where the browser can,
 * the first save asks where and later ones overwrite that file (⇧ asks again); elsewhere it
 * downloads a copy. **Open** loads a project file back (the page reloads into it).
 */
export function SaveControls() {
  const status = useSaveStatus()
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // The menu closes on Escape or a press anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const save = useCallback(async (saveAs = false) => {
    try {
      // Every pending autosave and its image writes are awaited before the file is written,
      // and its images are embedded: no save is reported with unresolved assets.
      const project = await buildProjectFile(exportTimelineState())
      const name = await saveProjectToDisk(project, { saveAs })
      if (name) setMessage(`saved ${name} at ${time(Date.now())}`)
    } catch (error) {
      setMessage(`couldn't save: ${String(error)}`)
    }
  }, [])

  // ⌘/Ctrl+S saves (instead of the browser saving the page); ⇧ picks a new file.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save(e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const open = async (file: File) => {
    const project = parseProjectFile(await file.text())
    if (!project) {
      setMessage(`${file.name} isn't an RGD project file`)
      return
    }
    try {
      // Assets are stored before the documents refer to them; failures are reported, not
      // mistaken for a successful open.
      await restoreProjectFile(project)
    } catch (error) {
      setMessage(`couldn't open ${file.name}: ${String(error)}`)
      return
    }
    // Don't let this page's closing autosave overwrite what was just opened.
    suspendAutosave()
    window.location.reload()
  }

  // Only what needs saying: a save's result or why saving failed (autosave itself is quiet).
  const line = status.error ?? message

  return (
    <div className="save-controls">
      <div className="save-menu" ref={menuRef}>
        <button
          type="button"
          className="save-menu-button"
          aria-label="menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M1.5 3.5h11M1.5 7h11M1.5 10.5h11" />
          </svg>
        </button>
        {menuOpen && (
          <div className="save-menu-items" role="menu">
            <button
              type="button"
              role="menuitem"
              className="save-menu-item"
              aria-label="save"
              title="Save a project file (⌘S; ⇧⌘S to pick a new file)"
              onClick={(e) => {
                setMenuOpen(false)
                void save(e.shiftKey)
              }}
            >
              save
              <kbd>⌘S</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="save-menu-item"
              onClick={() => {
                setMenuOpen(false)
                inputRef.current?.click()
              }}
            >
              open
            </button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Open project file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void open(file)
        }}
      />
      {line && (
        <output className="save-status" data-error={status.error ? 'on' : undefined} role="status">
          {line}
        </output>
      )}
    </div>
  )
}
