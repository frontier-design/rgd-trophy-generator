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
 * Save and open, beside the page dropdown. Everything autosaves to the browser as you work
 * (the status says when it last did); **save** (⌘/Ctrl+S) writes a project file with both
 * pages and the timeline: where the browser can, the first save asks where and later ones
 * overwrite that file (⇧ asks again); elsewhere it downloads a copy. **Open** loads a project
 * file back (the page reloads into it).
 */
export function SaveControls() {
  const status = useSaveStatus()
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  const line =
    status.error ??
    message ??
    (status.savedAt ? `autosaved ${time(status.savedAt)}` : 'autosave on')

  return (
    <div className="save-controls">
      <button
        type="button"
        className="control-button"
        title="Save a project file (⌘S; ⇧⌘S to pick a new file)"
        onClick={(e) => void save(e.shiftKey)}
      >
        save
      </button>
      <button type="button" className="control-button" onClick={() => inputRef.current?.click()}>
        open
      </button>
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
      <output className="save-status" data-error={status.error ? 'on' : undefined} role="status">
        {line}
      </output>
    </div>
  )
}
