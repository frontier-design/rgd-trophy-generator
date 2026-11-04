import type { KeyframeControl } from '../../types'

const TITLES = {
  static: 'Animate: add a keyframe at the playhead',
  animated: 'Add a keyframe at the playhead',
  key: 'Remove the keyframe at the playhead',
} as const

/** A field's timeline keyframe toggle: a diamond, outlined when the param is static,
 *  dark-edged when it's animated, filled on a keyframe at the playhead. */
export function KeyframeButton({ label, keyframe }: { label: string; keyframe?: KeyframeControl }) {
  if (!keyframe) return null
  return (
    <button
      type="button"
      className="keyframe-button"
      data-state={keyframe.state}
      aria-label={`keyframe ${label}`}
      aria-pressed={keyframe.state === 'key'}
      title={TITLES[keyframe.state]}
      onClick={keyframe.onToggle}
    />
  )
}
