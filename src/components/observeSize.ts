/**
 * Call `onResize` with the element's content size now and whenever it changes.
 * Returns a disposer. No-op where ResizeObserver is unavailable (e.g. jsdom).
 */
export function observeSize(
  element: HTMLElement,
  onResize: (width: number, height: number) => void,
): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return
    const { width, height } = entry.contentRect
    onResize(width, height)
  })
  observer.observe(element)
  return () => observer.disconnect()
}
