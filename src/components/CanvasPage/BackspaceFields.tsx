import { RangeField } from '../ControlPanel/RangeField'
import { ToggleField } from '../ControlPanel/ToggleField'
import { BackspaceIcon } from '../icons'
import {
  BACKSPACE_PAUSE_RANGE,
  BACKSPACE_SPEED_RANGE,
  DEFAULT_BACKSPACE,
  type TextBackspace,
} from './textLines'

interface BackspaceFieldsProps {
  backspace: TextBackspace | undefined
  set: (backspace: TextBackspace) => void
}

/** A text node's backspace: after typing, a pause on the whole text, then deleting it from
 *  the end at its own speed. */
export function BackspaceFields({ backspace = DEFAULT_BACKSPACE, set }: BackspaceFieldsProps) {
  const patch = (value: Partial<TextBackspace>) => set({ ...backspace, ...value })
  return (
    <>
      <ToggleField
        label="backspace"
        icon={<BackspaceIcon />}
        checked={backspace.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
      <RangeField
        label="pause"
        value={backspace.pause}
        {...BACKSPACE_PAUSE_RANGE}
        digits={1}
        unit=" s"
        disabled={!backspace.enabled}
        onChange={(pause) => patch({ pause })}
      />
      <RangeField
        label="delete speed"
        value={backspace.speed}
        {...BACKSPACE_SPEED_RANGE}
        unit="/s"
        disabled={!backspace.enabled}
        onChange={(speed) => patch({ speed })}
      />
    </>
  )
}
