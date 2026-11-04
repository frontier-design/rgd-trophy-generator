import { useId } from 'react'
import { PAGES, type Page } from '../../hooks'

interface PageSwitchProps {
  page: Page
  onChange: (page: Page) => void
}

/** The page dropdown at the top of the sidebar: generator or canvas (each its own URL). */
export function PageSwitch({ page, onChange }: PageSwitchProps) {
  const id = useId()
  return (
    <div className="page-switch">
      <label className="control-label" htmlFor={id}>
        page
      </label>
      <select
        id={id}
        className="control-select"
        value={page}
        onChange={(e) => onChange(e.target.value as Page)}
      >
        {PAGES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}
