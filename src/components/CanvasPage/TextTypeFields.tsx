import { RangeField } from '../ControlPanel/RangeField'
import { LineHeightIcon, SizeIcon } from '../icons'
import { TEXT_LEADING_RANGE, TEXT_SIZE_RANGE, type TextParams } from './textLines'

interface TextTypeFieldsProps {
  params: TextParams
  /** What linked scenes show while the node sets none (the first linked scene's type). */
  fallback: { fontSize: number; leading: number }
  set: (patch: Pick<TextParams, 'fontSize' | 'leading'>) => void
}

/** A text node's type: size and line height for every linked scene (always PP Mori). Until
 *  it's set, each scene keeps its own, fitted to its frame. */
export function TextTypeFields({ params, fallback, set }: TextTypeFieldsProps) {
  const fontSize = params.fontSize ?? fallback.fontSize
  const leading = params.leading ?? fallback.leading
  return (
    <>
      <RangeField
        label="size"
        icon={<SizeIcon />}
        value={fontSize}
        {...TEXT_SIZE_RANGE}
        digits={1}
        onChange={(next) => {
          if (next > 0) set({ fontSize: next })
        }}
      />
      <RangeField
        label="line height"
        icon={<LineHeightIcon />}
        value={leading}
        {...TEXT_LEADING_RANGE}
        digits={2}
        unit="×"
        onChange={(next) => set({ leading: next })}
      />
    </>
  )
}
