import { KeyframeTimeline } from './KeyframeTimeline'
import { useFieldAnim } from './fieldAnim'

/**
 * A slider's animation toggle on node cards: a keyframe diamond, outlined while the property
 * is static and filled once it has keyframes; it opens the property's keyframe timeline
 * (FieldAnimPanel). Nothing where the slider can't animate.
 */
export function FieldAnimButton({
  label,
  param,
  open,
  onToggle,
}: {
  label: string
  param?: string
  open: boolean
  onToggle: () => void
}) {
  const anims = useFieldAnim()
  if (!param || !anims) return null
  const animated = anims.keyframes(param).length > 0
  return (
    <button
      type="button"
      className="field-anim-fold"
      aria-label={`${label} animation`}
      aria-expanded={open}
      data-animated={animated || undefined}
      title={animated ? 'Animated: edit its keyframes' : 'Animate it with keyframes'}
      onClick={onToggle}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" />
      </svg>
    </button>
  )
}

/** A slider's keyframe timeline (KeyframeTimeline), under it. */
export function FieldAnimPanel({
  label,
  param,
  value,
}: {
  label: string
  param?: string
  /** The slider's value now: what a new keyframe holds. */
  value: number
}) {
  const anims = useFieldAnim()
  if (!param || !anims) return null
  return <KeyframeTimeline label={label} param={param} value={value} />
}
