import type { SVGProps } from 'react'

/**
 * Small field icons (16 × 16, drawn in the text color). Letters are paths, not text, so they
 * look the same whatever fonts load. Decorative: the field's label stays its accessible name.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/** Type size: a capital A. */
export function SizeIcon() {
  return (
    <Icon>
      <path d="M3.5 13.5 8 2.5l4.5 11M5.3 9.5h5.4" />
    </Icon>
  )
}

/** Line height: a small A between a rule above and one below. */
export function LineHeightIcon() {
  return (
    <Icon>
      <path d="M2.5 2h11M2.5 14h11" />
      <path d="M5.5 11.5 8 5l2.5 6.5M6.4 9.3h3.2" />
    </Icon>
  )
}

/** Tracking (letter spacing): a small A between two upright bars. */
export function TrackingIcon() {
  return (
    <Icon>
      <path d="M2 3v10M14 3v10" />
      <path d="M5.5 11.5 8 5l2.5 6.5M6.4 9.3h3.2" />
    </Icon>
  )
}

/** Backspace: the delete key, a tag pointing left with an × in it. */
export function BackspaceIcon() {
  return (
    <Icon strokeLinejoin="round">
      <path d="M5.5 3.5h8v9h-8L1.5 8z" />
      <path d="m7.5 6 3.5 4M11 6l-3.5 4" />
    </Icon>
  )
}

/** Corner radius: a square's four rounded corners, its sides left open. */
export function RadiusIcon() {
  return (
    <Icon>
      <path d="M2.5 6.5V5.5a3 3 0 0 1 3-3h1M9.5 2.5h1a3 3 0 0 1 3 3v1M13.5 9.5v1a3 3 0 0 1-3 3h-1M6.5 13.5h-1a3 3 0 0 1-3-3v-1" />
    </Icon>
  )
}

/** Typing: a text cursor (I-beam). */
export function CursorIcon() {
  return (
    <Icon>
      <path d="M5 2.5h1.5A1.5 1.5 0 0 1 8 4v8a1.5 1.5 0 0 1-1.5 1.5H5M11 2.5H9.5A1.5 1.5 0 0 0 8 4M8 12a1.5 1.5 0 0 0 1.5 1.5H11M6.25 8h3.5" />
    </Icon>
  )
}
