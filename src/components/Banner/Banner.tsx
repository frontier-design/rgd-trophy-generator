import { useId } from 'react'
import { BANNER_LOGO_URL, bannerReveal, type BannerLayout } from '../../banner'

interface BannerProps {
  /** Where everything goes, in artboard px (banner/bannerLayout). */
  layout: BannerLayout
  /** 0–1 (banner/bannerReveal). */
  reveal: number
  /** The text's stagger (0–1), so the items move with the lines' timing. */
  stagger: number
  headline: string
  link: string
  fontFamily: string
}

/**
 * The banner over the artboard: the RGD logo, a headline and a link, as in RGD's artwork. One SVG in artboard px, so the type sits exactly on
 * its baselines and items can rise in clipped to the bar. Video export draws the same from
 * the same layout (export/composite).
 */
export function Banner({ layout, reveal, stagger, headline, link, fontFamily }: BannerProps) {
  const clipId = useId()
  const { bar, logo } = layout
  const state = bannerReveal(reveal, layout, stagger)
  const [logoOffset, headlineOffset, linkOffset] = state.offsets
  const shown = bar.height * state.background
  const text = {
    fontFamily: `"${fontFamily}"`,
    fontSize: layout.fontSize,
    fontWeight: layout.fontWeight,
    fill: 'var(--color-canvas-text)',
  }
  return (
    <svg
      className="banner"
      viewBox={`0 0 ${bar.width} ${bar.y + bar.height}`}
      width={bar.width}
      height={bar.y + bar.height}
      aria-label="Banner"
      role="img"
      data-testid="banner"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} />
        </clipPath>
      </defs>
      {/* The bar grows up from its bottom edge, covering what's under it. */}
      <rect
        x={bar.x}
        y={bar.y + bar.height - shown}
        width={bar.width}
        height={shown}
        fill="var(--color-artboard-bg)"
      />
      {/* The items rise from the bar's bottom, clipped to it. */}
      <g clipPath={`url(#${clipId})`}>
        <image
          href={BANNER_LOGO_URL}
          x={logo.x}
          y={logo.y + logoOffset}
          width={logo.width}
          height={logo.height}
        />
        <text x={layout.headline.x} y={layout.headline.baseline + headlineOffset} {...text}>
          {headline}
        </text>
        <text
          x={layout.link.right}
          y={layout.link.baseline + linkOffset}
          textAnchor="end"
          {...text}
        >
          {link}
        </text>
      </g>
    </svg>
  )
}
