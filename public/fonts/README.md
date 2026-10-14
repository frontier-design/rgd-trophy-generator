# Local fonts

Drop `.woff2` files here and declare them with `@font-face` in `src/styles/global.css`.

Currently: `PPMori-Variable.woff2` (family `PP Mori`, weights 100–900), the default text font.
Files in `public/` are served from the site root, e.g. `/fonts/MyFont-Regular.woff2`.

Measurement waits for the chosen font to load (`ensureFontLoaded` in `src/measure/font.ts`),
because Pretext measures with canvas and would otherwise measure a fallback font.
