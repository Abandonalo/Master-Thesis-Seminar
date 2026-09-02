# Master’s Thesis Seminar Speech

## Slide 1 — Title

Hello everyone. My thesis investigates how spatial proxy controls can complement text prompts in AI-assisted 3D scene generation.

The central idea is that text communicates what an object should be, while editable 3D controls communicate where it should be and how it should fit into a scene.

*Transition: “Let me begin with the production problem that motivates this work.”*

## Slide 2 — A story every studio knows by now

Imagine a game team setting up a marketplace.

They ask an AI model to generate two market stalls around a well, place some crates beside the left stall, and preserve a clear route to the gate.

On the left is what the designer intends. On the right is one possible interpretation by the model.

Every requested object is present, and the scene may even look plausible from one viewpoint. However, the scale, orientation, clearance, and relationships between the objects no longer match the intended layout.

This is also a production-workflow issue. Fukaya and colleagues studied 16 game designers and developers. They found that generative asset tools were considered most useful during early design, but that they also needed to integrate with existing tools and produce manipulable assets in common formats.

The challenge is therefore not only generating attractive objects. It is preserving spatial decisions while moving between design tools and generative models.

*Transition: “To understand why that handoff is difficult, I first looked at research on spatial representation and interaction.”*

## Slide 3 — Human foundations

Text can express spatial intent, but matching direct 3D control requires extensive specification.

Spatial-language research shows that terms such as “beside,” “around,” or “in front of” usually describe qualitative and context-dependent relationships. They do not fully specify distance, scale, orientation, contact, or occlusion.

External spatial representations reduce the need to translate these relationships into words.

In professional 3D scene design, blockout or greyboxing is a common way to test scale, navigation, flow, composition, and gameplay constraints before producing final assets.

This established workflow directly inspires the generation phase of my thesis. Instead of introducing a completely new way to specify spatial intent, I reuse the designer’s greybox geometry as input to AI generation. The rough geometry preserves the spatial decisions, while the model supplies visual and geometric detail.

Direct-manipulation research explains why this can help. Shneiderman emphasizes visible objects, physical actions, and rapid, reversible operations. Hutchins describes this as reducing the cognitive distance between a designer’s goal and the actions provided by an interface. Norman describes a related problem as the gulf of execution.

This leads to the human-side requirement: spatial intent should remain explicit, visible, and editable.

*Transition: “The next question is whether current generative methods can use this kind of structure.”*

## Slide 4 — Generative 3D capabilities

*[Click: generation and lifting]*

Text-to-3D methods such as DreamFusion, Magic3D, MVDream, Instant3D, and LGM demonstrate increasingly capable asset generation.

Image-to-3D methods such as TripoSR and Hunyuan3D make interactive workflows more practical by lifting a generated image into a mesh.

However, lifting inherits limitations from the source image. Viewpoint, framing, occlusion, and background content can become missing geometry, unwanted surfaces, or incorrect orientation.

Reconstruction provides geometry, but it does not decide how that geometry should fit into an existing scene.

*[Click: spatial conditioning]*

A second direction shows that generative models can respond to structural input.

Sketch2Scene combines text with a visual sketch, but the sketch remains viewpoint-dependent and does not define a complete 3D volume.

ControlRoom3D uses semantic proxy rooms, while SpaceControl accepts geometric conditions ranging from coarse primitives to detailed meshes. CommonScenes and Layout2Scene also improve object relationships through structured layouts.

These systems establish algorithmic controllability: models can use spatial conditions. They do not yet establish how designers should create, inspect, and revise those conditions throughout an authoring workflow.

*[Click: scene validation]*

SimuScene adds another important finding. A scene that looks correct in an image may still contain hidden intersections, invalid support relations, or unstable geometry when placed in 3D.

SimuScene exposes those problems through simulation and automatically repairs the reconstruction. This supports my motivation for evaluating generated assets after placement in a 3D environment.

However, it does not provide a designer-authored volume that communicates the intended placement.

*Transition: “Initial generation is only half of the workflow. Designers must also be able to change one part without losing the rest.”*

## Slide 5 — Refinement, initiative, and positioning

*[Click: local refinement]*

Existing editing systems demonstrate several forms of local change.

Instruct-NeRF2NeRF edits scenes through instructions. SKED adds multi-view sketches. GaussianEditor traces edits through a Gaussian representation, while NeRFiller completes missing regions through multi-view inpainting.

These methods support localized editing, but their controls are tied to neural scene representations. They are not directly equivalent to selecting and replacing a bounded part of an explicit mesh in a game engine.

*[Click: 3D continuity]*

BlockFusion and WorldGrow preserve context by conditioning generated content on neighbouring 3D structure. However, they focus on scene expansion rather than interactive object-level selection.

Local refinement is therefore both a generation problem and an interaction problem: the user must specify what may change and what should remain unchanged.

*[Click: allocation of initiative]*

Programmatic systems such as 3D-GPT and SceneCode preserve parameters and component structure, but they are limited to forms supported by their procedures.

Agentic systems such as WorldClaw and SceneSmith instead plan, generate, inspect, and repair scenes automatically.

My thesis takes a different position: the model generates detail, while the designer retains control over placement, scale, orientation, occupied volume, and refinement boundaries.

*[Click: research gap]*

The research gap is therefore not whether AI can use spatial information. It is how user-authored spatial constraints can be integrated into an established 3D authoring environment and evaluated as interaction techniques.

*[Click: practical inspiration]*

Hyper3D Rodin provides a practical inspiration for addressing this gap. Its CLAY research supports generation from spatial inputs such as bounding boxes, voxels, and point clouds. Its BANG method extends this direction to controlled part-level decomposition using bounding boxes and surface regions.

However, Hyper3D is a commercial, credit-based service. My thesis integrates spatial controls directly into Unity and focuses on how designers use them throughout scene creation and refinement.

The prototype is assembled from freely available components, allowing the workflow to be installed, inspected, and adapted independently, although running the models can still introduce compute costs.

Hyper3D demonstrates the technical potential of spatially controlled generation. My thesis investigates the authoring workflow and user interaction around that control.

*Transition: “I implemented this division of control in the following workflow.”*

## Slide 6 — Generation workflow

*[Reveal the Unity layer]*

The generation workflow begins with ordinary greybox geometry in Unity.

The designer places a primitive proxy in the same way they would place a blockout object. Its position, volume, and orientation describe the intended spatial role of the final asset. Text specifies the scene style and object identity.

The workflow therefore builds on an existing game-design practice: it turns the greybox from a temporary placeholder into a spatial condition for AI generation.

*[Reveal the render constraints]*

The proxy is rendered into depth and edge conditions. These communicate the object’s intended spatial extent to the image-generation stage.

*[Reveal the ComfyUI layer]*

The backend applies a prompt policy intended to produce one isolated low-poly object. The textual prompt and rendered constraints then guide the generated image.

*[Reveal object extraction]*

The generated object is separated from its background so that the following stage receives one isolated subject rather than a complete scene.

*[Reveal mesh lifting]*

The isolated image is converted into a 3D mesh using an image-to-3D model.

*[Reveal orientation and fitting]*

The mesh is corrected to an upright orientation and fitted to the proxy volume.

*[Reveal the result]*

The resulting mesh is returned to Unity and remains editable inside the scene.

Although the pipeline contains several technical stages, the important design principle is simple: the model supplies visual and geometric detail, while the proxy preserves the designer-authored spatial commitment.

*Transition: “The implementation demonstrates a possible mechanism. The research question is whether that mechanism improves the workflow.”*

## Slide 7 — Research questions

My central research question is:

> How do editable spatial proxies affect control, workload, and output quality in AI-assisted 3D scene creation and refinement?

For generation, I ask how proxy-guided generation affects spatial fit, effort, and predictability compared with text-only prompting.

For refinement, I ask how 3D region selection affects edit locality, preservation, and predictability compared with global regeneration.

*Transition: “These questions lead to three hypotheses.”*

## Slide 8 — Hypotheses

H1 concerns generation. I expect proxy-guided generation to produce objects that fit the intended spatial layout more closely than text-only prompting.

H2 concerns the interaction experience. I expect spatial controls to increase predictability and agency and reduce mental demand or frustration.

However, spatial controls may also require more direct manipulation. This is therefore a trade-off rather than an assumption that proxies reduce every kind of effort.

H3 concerns refinement. I expect region-based refinement to produce more intended change inside the selected region, less unintended change outside it, and stronger user preference than global regeneration.

*Transition: “The study will compare these workflows directly.”*

## Slide 9 — Study design

The study will use a within-subjects, counterbalanced design.

Each participant will experience both conditions, with the order varied to reduce learning and ordering effects.

Condition A uses text-only interaction. Condition B provides spatial controls.

Within each condition, participants complete a generation phase and a refinement phase.

The generation phase examines multi-object scene setup.

The refinement phase asks participants to modify a bounded region while preserving the surrounding geometry. Both conditions will use equivalent goals and the same authoring environment.

Lightweight measures are collected after each phase, followed by overall measures at the end of the condition.

*Transition: “The evaluation separates phase-specific effects from the overall workflow experience.”*

## Slide 10 — Measures and hypothesis mapping

After each phase, I use the same three lightweight measures.

SEQ captures perceived task difficulty. The Paas scale captures mental effort. CSI captures creativity support.

For H1, generation is evaluated through spatial agreement, including 3D IoU, Chamfer distance, blind spatial-fit ratings, completion time, and number of attempts.

For H2, I combine predictability and agency ratings with interaction logs and overall workload and usability measures.

For H3, I measure whether the requested edit was achieved inside the selected region, how much unintended change occurred outside it, and whether the connection between the retained and replacement geometry remains valid.

At condition level, NASA-TLX, UMUX-LITE, overall output ratings, agency, and preference describe the complete experience.

This separation should help identify which phase produces a difference instead of reducing the whole workflow to one score.

*Transition: “These measurements are collected around two corresponding study phases.”*

## Slide 11 — Study procedure and analysis

I will begin with a pilot involving one or two participants. The pilot will identify unclear instructions, logging problems, and tasks that are obviously too easy or too difficult.

The main analysis will use paired comparisons between conditions. I will also account for condition order and combine spatial logs, questionnaires, and participants’ qualitative comments.

*Transition: “The prototype is working, and the next step is testing it through a complete scene workflow.”*

## Slide 12 — Current status and next steps

The Unity frontend, proxy-based generation, region-based refinement, Linux backend, and study logging are implemented.

The implementation still has two constraints.

First, image lifting can reconstruct background content, bake perspective into the mesh, produce irregular topology, and make dimensions difficult to reproduce.

Second, backend cost remains a practical constraint. The Linux pipeline works through Colab, but repeated use—particularly with the higher-quality model—is expensive.

The current step is setting up target scenes. I will then test the complete workflow for multi-object scene construction, run the pilot, revise the procedure, and prepare the main study.

*Transition: “I am considering one alternative approach to reduce the geometry problems.”*

## Slide 13 — Three.js as a considered alternative

Image-to-3D output can be difficult to refine reliably in general.

For assets with regular structure, such as houses, I am considering a procedural Three.js provider.

A prompt would be converted into a validated specification, and Three.js would construct predictable geometry before exporting it as a GLB for Unity.

This could provide cleaner topology, repeatable dimensions, and editable components such as roofs, doors, and windows.

It would not replace generative models. The possible direction is hybrid: procedural generation where structure can be described explicitly, and Hunyuan3D for open-ended forms.

*Transition: “The remaining slides collect the sources behind these decisions.”*

## Slides 14–16 — References

These references are grouped into three areas: human interaction and spatial authoring, generative and editable 3D systems, and the models and measures used in the implementation and evaluation.

*Advance these slides quickly without reading the individual entries.*

## Slide 17 — Closing

To summarize, this thesis investigates whether spatial proxies can preserve designer-authored spatial intent while still benefiting from generative models.

Previous work establishes the value of direct manipulation, the ability of generative models to use spatial conditions, and the importance of preservation during local editing.

My contribution is to combine these ideas in one authoring workflow and evaluate their effect on control, workload, and output quality.

The prototype is working. The next stage is complete scene testing, followed by the pilot and main study.

Thank you.
