import { useEffect, useState } from 'react'

/** `value` once it has stopped changing for `delay` ms (the first value at once): for
 *  expensive work that can wait out a gesture, like re-allocating canvases while zooming. */
export function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
