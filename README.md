# RGD Generator

Measure the rag of a block of text, turn it into 2D vector shapes, and render it in 3D.

The app opens on an infinite canvas at `/` (`/canvas` remains compatible). Right-click to
insert a scene, then edit its text directly and select it to tune its typography, shape,
material, frame size, and PNG/JPEG export. Connect twist, etch, pattern, and texture nodes
to scenes to modify their trophies. **2D sketch** shows the flat Paper.js profile.

Click to select a node; Shift-click toggles membership. Shift-drag empty space to add
intersecting nodes to the selection. Drag a selected node to move the group; ordinary
background dragging pans. Copy/paste and duplicate preserve the selected graph's internal
connections. All selected modifiers keep their editable range lines on linked artboards.
Click empty space or press Escape to clear selection.

Right-click to insert a composition, then drag a scene's right-hand output to its input.
The composition accepts one scene as a live image: drag the image and its corner handles
inside the frame, or resize the frame using its edge handles. Select the composition to
export it as a PNG. Command-click a source node to mute or restore its outgoing links.

Work autosaves in the browser; **save** / **open** use portable JSON project files.
The standalone generator page has been removed. Animation/video modules and legacy
project data are retained, but timeline, reveal, and banner editing aren't exposed on the
canvas yet.

```
text + settings → line widths (Pretext) → rag points → 2D path (Paper.js) → 3D mesh (Three.js)
```

## Getting started

Requires Node 22.12+ (developed on Node 26).

```sh
npm install
npm run dev
```

| Command             | What it does                   |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start the Vite dev server      |
| `npm run build`     | Typecheck and build to `dist/` |
| `npm run typecheck` | Run TypeScript only            |
| `npm run lint`      | Run ESLint                     |
| `npm run format`    | Format with Prettier           |
| `npm test`          | Run Vitest once                |

## Stack

Vite, React 19, TypeScript (strict), [@chenglou/pretext](https://github.com/chenglou/pretext),
[Paper.js](http://paperjs.org/reference/), [Three.js](https://threejs.org/docs/),
Vitest + React Testing Library, ESLint + Prettier.

See [CLAUDE.md](./CLAUDE.md) for the module layout and conventions.
