# Master’s Thesis Seminar Slides

A zero-build HTML presentation for the master’s thesis seminar:

> Augmenting Text Prompts with Spatial Proxy Controls in AI-Assisted 3D Scene Generation within Unity

The complete deck—content, styling, diagrams, navigation, and motion—lives in [`thesis_seminar_slides.html`](thesis_seminar_slides.html). Keeping it self-contained makes the presentation easy to archive, email, or open on another computer.

## Run the deck

Open the HTML file in a modern browser:

```bash
open thesis_seminar_slides.html
```

Navigation:

- `←`, `Page Up`, or clicking the left quarter: previous slide
- `→`, `Page Down`, `Space`, or clicking elsewhere: next slide
- `Home` / `End`: first / last slide
- `F`: toggle fullscreen
- Swipe or mouse wheel: previous / next slide
- A direct URL hash such as `#15` opens slide 15

## File organization

The HTML is deliberately divided into stable layers:

1. **Theme tokens** — colors, typography, spacing, and motion timing
2. **Viewport and slide stage** — fixed 16:9 presentation behavior
3. **Typography and layout primitives** — reusable visual rules
4. **Components** — cards, tags, status markers, tables, and references
5. **SVG diagram system** — shared diagram styles and arrow markers
6. **Motion hooks** — reusable entrance effects
7. **Slide content** — one commented `<section>` per slide
8. **`SlidePresentation` controller** — scaling, navigation, numbering, and events

Search for the numbered CSS section comments or slide comments such as `<!-- 14 · Study design -->` to jump directly to the relevant code.

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

Slide numbers and the total are generated automatically. The controller also uses the first `h1` or `h2` as the slide’s accessibility label.

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

For custom JavaScript motion, listen for lifecycle events without changing navigation code:

```javascript
document.addEventListener("slide:enter", (event) => {
  const { index, slide } = event.detail;
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
git add thesis_seminar_slides.html README.md
git commit -m "Describe the slide update"
```

The adjacent thesis PDFs are intentionally ignored so this repository stays focused on the presentation source.

