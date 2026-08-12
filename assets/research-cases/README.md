# SimuScene case-study images

The opening problem slide uses two frames from the authors' published SAM3D result video, `sc09_sam3d.mp4`. The frames show one continuous reconstruction before and after physics reveals its hidden support failure. Additional PNGs are crops from Figure 1 of:

Lee, I., Baik, S., Kim, S., Kim, H., Cha, H., & Joo, H. (2026). *SimuScene: Simulation-Ready Compositional 3D Scene Reconstruction from a Single Image*. arXiv:2606.03994.

Source: https://arxiv.org/abs/2606.03994

The pen-cup sequence illustrates the exact failure used on slide `01 / 19`: a front-view projection can imply that the pen sits inside the cup, while an orbit and gravity reveal that the same reconstructed object is outside and unsupported.

Files:

- `simuscene-sc09-front.png` - frame at 0.0 s from the SAM3D result video; the front view appears plausible
- `simuscene-sc09-physics.png` - frame at 1.5 s from the same video; physics exposes the unsupported placement
- `simuscene-input.png` - synthetic single-image input
- `simuscene-lifted-preview.png` - SAM3D composition before simulation
- `simuscene-physics-failure.png` - the SAM3D composition under physics, showing collapsed/interpenetrating objects

These excerpts are included with an on-slide citation and a complete reference in the deck.
