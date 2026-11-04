import { useCallback, useEffect, useState } from 'react'

/** The app's pages, each with its own URL. */
export const PAGES = ['generator', 'canvas'] as const
export type Page = (typeof PAGES)[number]

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/** A page's URL path. */
export function pathFor(page: Page): string {
  return page === 'generator' ? `${BASE}/` : `${BASE}/${page}`
}

/** The page a URL path shows (anything unknown shows the generator). */
export function pageFromPath(path: string): Page {
  const rest = path.slice(BASE.length).replace(/^\/+|\/+$/g, '')
  return (PAGES as readonly string[]).includes(rest) ? (rest as Page) : 'generator'
}

/**
 * The current page, from the URL, and a way to go to another: it pushes the page's URL
 * (so back and forward work) and the browser's back/forward buttons switch pages too.
 * No router library: two pages don't need one.
 */
export function usePage(): [Page, (page: Page) => void] {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: Page) => {
    if (pageFromPath(window.location.pathname) !== next) {
      window.history.pushState(null, '', pathFor(next))
    }
    setPage(next)
  }, [])

  return [page, navigate]
}
