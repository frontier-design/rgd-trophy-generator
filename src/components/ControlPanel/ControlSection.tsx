import { useId, type ReactNode } from 'react'

interface ControlSectionProps {
  /** Lowercase in the DOM (the accessible name); shown in Title Case by CSS. */
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** A named, collapsible group of sidebar fields. Its header toggles the body. */
export function ControlSection({ title, open, onOpenChange, children }: ControlSectionProps) {
  const bodyId = useId()
  return (
    <section className="control-section" aria-label={title}>
      <h2 className="control-section-heading">
        <button
          type="button"
          className="control-section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onOpenChange(!open)}
        >
          {title}
          <span className="control-section-icon" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      </h2>
      {/* Collapsed bodies stay in the layout (see global.css), so the label column keeps
          its width. */}
      <div id={bodyId} className="control-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
