import { useCallback, useRef, useState } from 'react'

export type ExportJob = (signal: AbortSignal, onProgress: (share: number) => void) => Promise<void>

export interface VideoExportHandle {
  /** 0–1 while exporting, else null. */
  progress: number | null
  /** The last export's failure, if any. */
  error: string | null
  start: (job: ExportJob) => void
  cancel: () => void
}

/** Runs one export job at a time, with progress, cancel, and its error. */
export function useVideoExport(): VideoExportHandle {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  const start = useCallback((job: ExportJob) => {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setError(null)
    setProgress(0)
    job(abort.signal, setProgress)
      .catch((reason: unknown) => {
        if (abort.signal.aborted) return
        console.error(reason)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        controller.current = null
        setProgress(null)
      })
  }, [])

  const cancel = useCallback(() => controller.current?.abort(), [])

  return { progress, error, start, cancel }
}
