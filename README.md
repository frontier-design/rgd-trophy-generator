# RGD Generator

Measure the rag of a block of text, turn it into 2D vector shapes, and render it in 3D.

**Status:** early. Type directly into the text block; it's mirrored on the other side of
the edge, and the shape between the line boxes and the edge is revolved around it into a
3D trophy (Three.js; drag to orbit) that sits between the two text blocks. The page opens
in 3D; **2D Sketch** shows the flat Paper.js shape. The sidebar tunes the type, the shape
and the trophy's gradient material.

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
