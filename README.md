# Master’s Thesis Seminar Slides

A browser-based presentation for the master’s thesis seminar:

> Augmenting Text Prompts with Spatial Proxy Controls in AI-Assisted 3D Scene Generation within Unity

The project separates slide content, presentation styling, and typed interaction logic while keeping a compiled browser build in the repository. The deck therefore opens directly for presenting, but remains easy to maintain and extend.

## Run the deck

Open the HTML file in a modern browser:

```bash
open thesis_seminar_slides.html
```

The committed files in `dist/` mean no install or build is required just to present the deck.

Navigation:

- `←`, `Page Up`, or clicking the left quarter: previous slide
- `→`, `Page Down`, `Space`, or clicking elsewhere: next slide
- `Home` / `End`: first / last slide
- `F`: toggle fullscreen
- Swipe or mouse wheel: previous / next slide
- A direct URL hash such as `#15` opens slide 15

## Project structure

```text
thesis_seminar_slides.html   Slide content, diagrams, and canvas hooks
styles.css                  Theme, layout, components, and motion hooks
src/presentation.ts         Typed deck controller and slide interactions
src/market-scenes.ts        Paired Three.js market-scene comparison
assets/market-scene/        CC0 KayKit GLBs and retained license
dist/presentation.js        Bundled browser script (committed)
dist/presentation.js.map    Source map for browser debugging
package.json                Type-check, bundle, and watch commands
tsconfig.json               Strict TypeScript configuration
```

The CSS is divided into numbered sections for theme tokens, viewport behavior, typography, layout, components, diagrams, references, deck chrome, motion, and accessibility. The HTML has a numbered comment before every slide, such as `<!-- 14 · Study design -->`.

## Development

Install the local TypeScript, esbuild, and Three.js dependencies once:

```bash
npm install
```

Type-check and bundle after changing TypeScript source:

```bash
npm run build
```

Or keep the compiler running during development:

```bash
npm run watch
```

Commit the regenerated `dist/presentation.js` and source map whenever the TypeScript source changes.
The three `.glb` files are imported from TypeScript and embedded as data URLs by esbuild,
so the interactive comparison also works offline when the HTML is opened through `file://`.

## Add or change a slide

Add a new section inside `#deckStage`:

```html
<!-- 21 · New topic -->
<section class="slide">
  <div class="eyebrow">Section</div>
  <h2>Slide title</h2>
  <div class="rule"></div>
  <div class="card">Content</div>
</section>
```

Slide numbers and the total are generated automatically. A slide marked with the `hero` class is excluded from visible numbering; the opening slide uses this marker. The controller also uses the first `h1` or `h2` as the slide’s accessibility label.

## Motion system

Top-level elements automatically receive the deck’s default `fade-up` entrance. To override a particular element, add one of these hooks:

```html
<div data-motion="fade-left">...</div>
<div data-motion="fade-right">...</div>
<div data-motion="scale" class="motion-slow">...</div>
<div data-motion="none">...</div>
```

Available effects are `fade-up`, `fade-left`, `fade-right`, `scale`, `draw`, and `none`. Use `motion-fast` or `motion-slow` to adjust duration.

To stagger all direct children of a container:

```html
<div data-motion-group="scale">
  <article class="card">First</article>
  <article class="card">Second</article>
  <article class="card">Third</article>
</div>
```

To set a custom sequence position, add `data-motion-order="3"`. Global motion timing is controlled by `--motion-duration`, `--motion-stagger`, `--motion-distance`, and `--ease-out-expo` in `:root`.

For an SVG line-draw animation, normalize the path length and use the `draw` hook:

```html
<path pathLength="1" data-motion="draw" d="..." />
```

For custom TypeScript motion, listen for lifecycle events without changing navigation code:

```typescript
document.addEventListener("slide:enter", (event: Event) => {
  const { index, slide } = (event as CustomEvent).detail;
  // Start slide-specific motion here.
});

document.addEventListener("slide:leave", (event) => {
  // Stop or reset long-running effects here.
});

document.addEventListener("deck:change", (event) => {
  // React to any completed slide change.
});
```

The presentation honors `prefers-reduced-motion` automatically.

## Git workflow

The repository uses the `main` branch. A simple editing cycle is:

```bash
git status
git diff
git add thesis_seminar_slides.html styles.css src dist package.json package-lock.json tsconfig.json README.md
git commit -m "Describe the slide update"
```

The adjacent thesis PDFs are intentionally ignored so this repository stays focused on the presentation source.
