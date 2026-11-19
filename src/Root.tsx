import { CanvasPage } from './components/CanvasPage'
import { SaveControls } from './components/SaveControls'

/** The canvas is the app; legacy /canvas URLs also render this workspace. */
export default function Root() {
  return <CanvasPage tools={<SaveControls />} />
}
