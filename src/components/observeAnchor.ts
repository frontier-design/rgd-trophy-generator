import { observeSize } from './observeSize'

/**
 * Call `onMove(x, y)` with `element`'s top-left position relative to `base`'s top-left,
 * now and whenever it may have changed: either element resizes (e.g. re-centering after a
 * layout change), the window resizes, or the page scrolls. Returns a disposer.
 */
export function observeAnchor(
  element: HTMLElement,
  base: HTMLElement,
  onMove: (x: number, y: number) => void,
): () => void {
  const sync = () => {
    const { x, y } = relativePosition(element, base)
    onMove(x, y)
  }
  const stopObservingElement = observeSize(element, sync)
  const stopObservingBase = observeSize(base, sync)
  window.addEventListener('scroll', sync, { passive: true })
  window.addEventListener('resize', sync)
  sync()
  return () => {
    stopObservingElement()
    stopObservingBase()
    window.removeEventListener('scroll', sync)
    window.removeEventListener('resize', sync)
  }
}

/** `element`'s top-left relative to `base`'s top-left, in CSS px. */
export function relativePosition(element: HTMLElement, base: HTMLElement) {
  const a = element.getBoundingClientRect()
  const b = base.getBoundingClientRect()
  return { x: a.left - b.left, y: a.top - b.top }
}
