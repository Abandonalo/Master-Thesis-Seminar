# SimuScene case-study images

The three PNGs in this folder are crops from Figure 1 of:

Lee, I., Baik, S., Kim, S., Kim, H., Cha, H., & Joo, H. (2026). *SimuScene: Simulation-Ready Compositional 3D Scene Reconstruction from a Single Image*. arXiv:2606.03994.

Source: https://arxiv.org/abs/2606.03994

The selected cosmetic-organizer scene is one of the paper project's synthetic prompt/image examples. It illustrates the exact failure used on slide `01 / 19`: a plausible 2D input and image-aligned pre-simulation lift can still produce interpenetrating or unsupported 3D objects when physics exposes the hidden geometry.

Files:

- `simuscene-input.png` - synthetic single-image input
- `simuscene-lifted-preview.png` - SAM3D composition before simulation
- `simuscene-physics-failure.png` - the SAM3D composition under physics, showing collapsed/interpenetrating objects

These excerpts are included with an on-slide citation and a complete reference in the deck.

