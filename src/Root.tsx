import App from './App'
import { CanvasPage } from './components/CanvasPage'
import { PageSwitch } from './components/PageSwitch'
import { SaveControls } from './components/SaveControls'
import { usePage } from './hooks'

/** Picks the page from the URL (/ = generator, /canvas = canvas); both carry the page
 *  dropdown and the save controls at their top left. */
export default function Root() {
  const [page, navigate] = usePage()
  const tools = (
    <div className="page-tools">
      <PageSwitch page={page} onChange={navigate} />
      <SaveControls />
    </div>
  )
  return page === 'canvas' ? <CanvasPage tools={tools} /> : <App tools={tools} />
}
