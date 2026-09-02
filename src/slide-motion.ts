import type { AnimationType, SlideLifecycleDetail } from "./presentation-types";

type RevealAnimation = Exclude<AnimationType, "none">;

interface RevealItem {
  element: HTMLElement;
  animation: RevealAnimation;
}

interface RevealStep {
  items: RevealItem[];
  after?: () => void;
}

interface SlideSequence {
  steps: RevealStep[];
  initialize?: () => void;
  cleanup?: () => void;
}

const ANIMATION_CLASSES = [
  "anim-fade-up",
  "anim-fade-down",
  "anim-fade-left",
  "anim-fade-right",
  "anim-rise-in",
  "anim-zoom-pop",
  "anim-blur-in",
] as const;

/**
 * CSS-driven slide motion controller.
 *
 * The controller only manages reveal state and slide lifecycle. Motion curves,
 * durations, and transforms live in CSS so the deck has no animation runtime.
 */
export class SlideMotionController {
  private activeSlide: HTMLElement | null = null;
  private activeSteps: RevealStep[] = [];
  private activeCleanup: (() => void) | null = null;
  private progressiveStep = 0;
  private readonly allowMotion = !window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  private readonly handleSlideEnter = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide) return;
    this.play(detail.slide, detail.direction === -1);
  };

  private readonly handleSlideLeave = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide || detail.slide !== this.activeSlide) return;
    this.teardown();
  };

  private constructor() {}

  static mount(): SlideMotionController | null {
    return document.querySelector(".slide") ? new SlideMotionController() : null;
  }

  initialize(): void {
    document.documentElement.classList.add("css-slide-motion");
    document.addEventListener("slide:enter", this.handleSlideEnter);
    document.addEventListener("slide:leave", this.handleSlideLeave);
  }

  /** Consume a navigation input when the active slide has another reveal. */
  advanceActiveSequence(): boolean {
    if (this.progressiveStep >= this.activeSteps.length) return false;
    this.revealStep(this.activeSteps[this.progressiveStep], true);
    this.progressiveStep += 1;
    return true;
  }

  private play(slide: HTMLElement, startsComplete: boolean): void {
    this.teardown();
    this.activeSlide = slide;

    const sequence = this.sequenceFor(slide);
    if (sequence) {
      this.activeSteps = sequence.steps;
      this.activeCleanup = sequence.cleanup ?? null;
      sequence.initialize?.();
      this.prepareProgressiveTargets(sequence.steps);
      if (startsComplete) {
        sequence.steps.forEach((step) => this.revealStep(step, false));
        this.progressiveStep = sequence.steps.length;
      }
    }

    this.playEntrance(slide, Boolean(sequence));
  }

  private teardown(): void {
    this.activeCleanup?.();
    this.activeCleanup = null;
    this.activeSteps.flatMap((step) => step.items).forEach(({ element }) => {
      element.classList.remove("hpx-progressive", "is-revealed");
      this.removeAnimationClasses(element);
      element.style.removeProperty("--step-order");
    });
    this.activeSteps = [];
    this.progressiveStep = 0;
    this.activeSlide = null;
  }

  private prepareProgressiveTargets(steps: RevealStep[]): void {
    const seen = new Set<HTMLElement>();
    steps.forEach((step) => {
      step.items.forEach(({ element }) => {
        if (seen.has(element)) return;
        seen.add(element);
        this.removeAnimationClasses(element);
        element.classList.add("hpx-progressive");
        element.classList.remove("is-revealed");
      });
    });
  }

  private revealStep(step: RevealStep, animated: boolean): void {
    step.items.forEach(({ element, animation }, index) => {
      this.removeAnimationClasses(element);
      element.style.setProperty("--step-order", String(index));
      void element.offsetWidth;
      element.classList.add("is-revealed");
      if (animated && this.allowMotion) element.classList.add(`anim-${animation}`);
    });
    step.after?.();
  }

  private playEntrance(slide: HTMLElement, isProgressive: boolean): void {
    const targets: Array<{ element: HTMLElement; animation: RevealAnimation }> = [];

    if (slide.classList.contains("title")) {
      const titleTargets: Array<[string, RevealAnimation]> = [
        [".title-wrap > .eyebrow", "fade-down"],
        [".title-wrap > h1", "rise-in"],
        [".title-wrap > .sub", "fade-up"],
        [".title-wrap > .meta", "fade-up"],
        [".title-wrap > .closing-appendix-hint", "fade-up"],
      ];
      titleTargets.forEach(([selector, animation]) => {
        const element = slide.querySelector<HTMLElement>(selector);
        if (element) targets.push({ element, animation });
      });
    } else {
      const eyebrow = this.directChild(slide, ".eyebrow");
      const heading = this.directChild(slide, "h1, h2");
      if (eyebrow && !eyebrow.classList.contains("hpx-progressive")) {
        targets.push({ element: eyebrow, animation: "fade-down" });
      }
      if (heading && !heading.classList.contains("hpx-progressive")) {
        targets.push({ element: heading, animation: "rise-in" });
      }

      if (!isProgressive) {
        slide
          .querySelectorAll<HTMLElement>("[data-anim]:not([data-anim='none'])")
          .forEach((element) => {
            if (targets.some((target) => target.element === element)) return;
            targets.push({
              element,
              animation: this.animationFor(element.dataset.anim),
            });
          });
      }
    }

    targets.forEach(({ element }) => {
      this.removeAnimationClasses(element);
      element.classList.add("hpx-entry-pending");
    });

    window.requestAnimationFrame(() => {
      targets.forEach(({ element, animation }, index) => {
        element.classList.remove("hpx-entry-pending");
        element.style.setProperty("--anim-order", String(index));
        if (this.allowMotion) element.classList.add("hpx-entry", `anim-${animation}`);
      });
    });
  }

  private sequenceFor(slide: HTMLElement): SlideSequence | null {
    if (slide.classList.contains("problem-story-slide")) return this.problemStorySequence(slide);
    if (slide.classList.contains("human-foundations-slide")) return this.humanFoundationsSequence(slide);
    if (slide.classList.contains("related-capabilities-slide")) return this.relatedCapabilitiesSequence(slide);
    if (slide.classList.contains("related-positioning-slide")) return this.relatedPositioningSequence(slide);
    if (slide.classList.contains("practical-precedent-slide")) return this.practicalPrecedentSequence(slide);
    if (slide.classList.contains("generation-architecture-slide")) return this.generationArchitectureSequence(slide);
    if (slide.classList.contains("generation-detail-slide")) return this.generationDetailSequence(slide);
    if (slide.classList.contains("refinement-architecture-slide")) return this.refinementArchitectureSequence(slide);
    if (slide.classList.contains("research-questions-slide")) return this.researchQuestionsSequence(slide);
    if (slide.classList.contains("hypotheses-slide")) return this.hypothesesSequence(slide);
    if (slide.classList.contains("study-design-slide")) return this.studyDesignSequence(slide);
    if (slide.classList.contains("measurement-slide")) return this.measurementSequence(slide);
    if (slide.classList.contains("study-procedure-slide")) return this.studyProcedureSequence(slide);
    if (slide.classList.contains("study-roadmap-slide")) return this.roadmapSequence(slide);
    if (slide.classList.contains("threejs-consideration-slide")) return this.threeJsConsiderationSequence(slide);
    if (slide.classList.contains("model-choice-slide")) return this.modelChoiceSequence(slide);
    if (slide.classList.contains("threejs-option-slide")) return this.threeJsOptionSequence(slide);
    return null;
  }

  private problemStorySequence(slide: HTMLElement): SlideSequence {
    return {
      steps: [
        this.step(slide, ".scene-plan.intended", "fade-left"),
        this.step(slide, ".prompt-bottleneck > .tag", "fade-up"),
        this.step(slide, ".prompt-bottleneck > .guess-arrow", "zoom-pop"),
        this.step(slide, ".scene-plan.guessed", "fade-right"),
        this.step(slide, ".production-evidence", "fade-up"),
      ],
    };
  }

  private humanFoundationsSequence(slide: HTMLElement): SlideSequence {
    return {
      steps: [
        this.stepMany(slide, ["h2", ".human-foundation.language"], "fade-up"),
        this.step(slide, ".human-foundation.blockout", "fade-up"),
        this.step(slide, ".human-foundation.manipulation", "fade-up"),
        this.step(slide, ".human-foundation-requirement", "zoom-pop"),
      ],
    };
  }

  private relatedCapabilitiesSequence(slide: HTMLElement): SlideSequence {
    const rows = this.elements(slide, ".research-direction");
    return {
      steps: [
        ...rows.map((row) => this.stepFromElements([row], "fade-left")),
        this.step(slide, ".research-synthesis", "fade-up"),
      ],
    };
  }

  private relatedPositioningSequence(slide: HTMLElement): SlideSequence {
    const rows = this.elements(slide, ".refinement-direction");
    return {
      steps: [
        ...rows.map((row) => this.stepFromElements([row], "fade-up")),
        this.step(slide, ".positioning-gap", "zoom-pop"),
      ],
    };
  }

  private practicalPrecedentSequence(slide: HTMLElement): SlideSequence {
    return {
      steps: [
        this.step(slide, ".hyper3d-precedent", "fade-left"),
        this.stepMany(slide, [".precedent-vs", ".thesis-precedent"], "fade-right"),
      ],
    };
  }

  private researchQuestionsSequence(slide: HTMLElement): SlideSequence {
    const phases = this.elements(slide, ".rq-phase");
    return {
      steps: [
        this.step(slide, ".central-rq", "zoom-pop"),
        this.stepFromElements(phases.slice(0, 1), "fade-left"),
        this.stepFromElements(phases.slice(1, 2), "fade-right"),
      ],
    };
  }

  private hypothesesSequence(slide: HTMLElement): SlideSequence {
    const rows = this.elements(slide, ".hypothesis-row");
    return {
      steps: [
        ...rows.map((row) => this.stepFromElements([row], "fade-left")),
        this.step(slide, ".hypothesis-caveat", "zoom-pop"),
      ],
    };
  }

  private generationArchitectureSequence(slide: HTMLElement): SlideSequence {
    const sources = this.elements(
      slide,
      ".proxy-cell, .textual-prompt-cell, .policy-cell, .image-generation-cell, .extraction-cell, .lifting-cell",
    );
    const transfers = this.elements(slide, ".generation-transfer-item");
    const showArrow = (selector: string): (() => void) => () =>
      slide.querySelector<HTMLElement>(selector)?.classList.add("hpx-flow-visible");

    return {
      initialize: () => {
        sources.forEach((source) => {
          source.classList.add("hpx-flow-source");
          source.classList.remove("hpx-flow-visible");
        });
        transfers.forEach((transfer) => transfer.classList.add("hpx-transfer"));
      },
      cleanup: () => {
        sources.forEach((source) =>
          source.classList.remove("hpx-flow-source", "hpx-flow-visible"),
        );
        transfers.forEach((transfer) => transfer.classList.remove("hpx-transfer"));
      },
      steps: [
        this.step(slide, ".unity-tier", "zoom-pop"),
        this.step(slide, ".proxy-cell", "fade-up"),
        this.step(slide, ".textual-prompt-cell", "fade-up", showArrow(".proxy-cell")),
        this.step(slide, ".constraints-cell", "fade-up", showArrow(".textual-prompt-cell")),
        this.step(slide, ".service-tier", "zoom-pop"),
        this.stepMany(slide, [".prompt-flow", ".policy-cell"], "fade-up"),
        this.stepMany(
          slide,
          [".constraints-flow", ".image-generation-cell"],
          "fade-up",
          showArrow(".policy-cell"),
        ),
        this.step(slide, ".extraction-cell", "fade-up", showArrow(".image-generation-cell")),
        this.step(slide, ".lifting-cell", "fade-up", showArrow(".extraction-cell")),
        this.step(slide, ".fit-cell", "fade-up", showArrow(".lifting-cell")),
        this.stepMany(slide, [".up-flow", ".result-cell"], "fade-up"),
      ],
    };
  }

  private refinementArchitectureSequence(slide: HTMLElement): SlideSequence {
    const sources = this.elements(
      slide,
      ".refinement-select-cell, .refinement-inpaint-cell, .refinement-prepare-cell",
    );
    const transfers = this.elements(slide, ".generation-transfer-item");
    const showArrow = (selector: string): (() => void) => () =>
      slide.querySelector<HTMLElement>(selector)?.classList.add("hpx-flow-visible");

    return {
      initialize: () => {
        sources.forEach((source) => {
          source.classList.add("hpx-flow-source");
          source.classList.remove("hpx-flow-visible");
        });
        transfers.forEach((transfer) => transfer.classList.add("hpx-transfer"));
      },
      cleanup: () => {
        sources.forEach((source) =>
          source.classList.remove("hpx-flow-source", "hpx-flow-visible"),
        );
        transfers.forEach((transfer) => transfer.classList.remove("hpx-transfer"));
      },
      steps: [
        this.stepMany(slide, [".refinement-unity-tier", ".refinement-select-cell"], "zoom-pop"),
        this.step(slide, ".refinement-capture-cell", "fade-up", showArrow(".refinement-select-cell")),
        this.stepMany(
          slide,
          [".refinement-service-tier", ".refinement-capture-flow", ".refinement-inpaint-cell"],
          "fade-up",
        ),
        this.step(slide, ".refinement-prepare-cell", "fade-up", showArrow(".refinement-inpaint-cell")),
        this.step(slide, ".refinement-lift-cell", "fade-up", showArrow(".refinement-prepare-cell")),
        this.stepMany(slide, [".refinement-replacement-flow", ".refinement-result-cell"], "fade-up"),
      ],
    };
  }

  private generationDetailSequence(slide: HTMLElement): SlideSequence {
    const photograph = slide.querySelector<HTMLElement>(".photograph-source");
    const revealComparison = (): void => {
      slide.classList.remove("detail-stage-initial");
      slide.classList.add("detail-stage-comparison");
    };
    const positionPhotograph = (): void => {
      if (!photograph) return;
      const slideRect = slide.getBoundingClientRect();
      const photographRect = photograph.getBoundingClientRect();
      const scaleX = slide.offsetWidth > 0 ? slideRect.width / slide.offsetWidth : 1;
      const scaleY = slide.offsetHeight > 0 ? slideRect.height / slide.offsetHeight : 1;
      const x =
        (slideRect.left + slideRect.width / 2 - (photographRect.left + photographRect.width / 2)) /
        scaleX;
      const y =
        (slideRect.top + slideRect.height / 2 - (photographRect.top + photographRect.height / 2)) /
        scaleY;
      slide.style.setProperty("--detail-initial-x", `${x}px`);
      slide.style.setProperty("--detail-initial-y", `${y}px`);
    };

    const recoverySteps = this.elements(slide, ".recovery-step");
    const recoveryArrows = this.elements(slide, ".recovery-flow > i");
    return {
      initialize: () => {
        slide.classList.add("detail-stage-initial");
        slide.classList.remove("detail-stage-comparison");
        window.requestAnimationFrame(positionPhotograph);
      },
      cleanup: () => {
        slide.classList.remove("detail-stage-initial", "detail-stage-comparison");
        slide.style.removeProperty("--detail-initial-x");
        slide.style.removeProperty("--detail-initial-y");
      },
      steps: [
        this.step(slide, ".photograph-source h3", "fade-up"),
        this.stepMany(
          slide,
          [".source-comparison-mid", ".lowpoly-source"],
          "fade-left",
          revealComparison,
        ),
        this.stepMany(slide, [".source-comparison-but", ".tilted-output"], "fade-left"),
        this.step(slide, ".orientation-recovery", "zoom-pop"),
        this.stepFromElements(recoverySteps.slice(0, 1), "fade-up"),
        this.stepFromElements(
          [...recoveryArrows.slice(0, 1), ...recoverySteps.slice(1, 2)],
          "fade-left",
        ),
        this.stepFromElements(
          [...recoveryArrows.slice(1, 2), ...recoverySteps.slice(2, 3)],
          "fade-left",
        ),
        this.stepFromElements(
          [...recoveryArrows.slice(2, 3), ...recoverySteps.slice(3, 4)],
          "fade-left",
        ),
        this.step(slide, ".recovery-result", "zoom-pop"),
      ],
    };
  }

  private studyDesignSequence(slide: HTMLElement): SlideSequence {
    return {
      steps: [
        this.stepMany(slide, [".study-primary", ".condition-comparison"], "zoom-pop"),
        this.step(slide, ".study-meta", "fade-right"),
        this.step(slide, ".same-shell", "fade-up"),
        this.stepMany(slide, [".study-phase-line", ".study-phase"], "zoom-pop"),
      ],
    };
  }

  private measurementSequence(slide: HTMLElement): SlideSequence {
    const evidence = this.elements(slide, ".hypothesis-evidence");
    return {
      steps: [
        this.step(slide, ".hypothesis-scorecard", "zoom-pop"),
        this.step(slide, ".measurement-shared", "zoom-pop"),
        ...evidence.map((item) => this.stepFromElements([item], "fade-up")),
        this.step(slide, ".condition-measures", "fade-up"),
      ],
    };
  }

  private studyProcedureSequence(slide: HTMLElement): SlideSequence {
    const phases = this.elements(slide, ".procedure-phase");
    const analysis = this.elements(slide, ".procedure-analysis");
    return {
      steps: [
        this.stepFromElements(phases.slice(0, 1), "fade-left"),
        this.stepFromElements(
          [...this.elements(slide, ".procedure-arrow"), ...phases.slice(1, 2)],
          "fade-right",
        ),
        ...analysis.map((item) => this.stepFromElements([item], "fade-up")),
      ],
    };
  }

  private roadmapSequence(slide: HTMLElement): SlideSequence {
    const completed = this.elements(slide, ".roadmap-milestone.done");
    const upcoming = this.elements(slide, ".roadmap-milestone.upcoming");
    const rail = slide.querySelector<HTMLElement>(".roadmap-rail");
    const segmentCount = Math.max(1, completed.length + upcoming.length);
    const revealRailTo = (position: number): (() => void) => () => {
      const visibleFraction = Math.max(0, Math.min(1, position / segmentCount));
      rail?.style.setProperty(
        "--roadmap-line-mask",
        `${(1 - visibleFraction) * 100}%`,
      );
    };

    return {
      initialize: () => rail?.style.setProperty("--roadmap-line-mask", "100%"),
      cleanup: () => rail?.style.removeProperty("--roadmap-line-mask"),
      steps: [
        this.stepMany(slide, [".study-roadmap", ".roadmap-phase-labels .complete"], "zoom-pop"),
        ...completed.map((milestone, index) =>
          this.stepFromElements([milestone], "zoom-pop", revealRailTo(index)),
        ),
        this.step(slide, ".roadmap-phase-labels .current", "fade-down"),
        this.step(slide, ".roadmap-milestone.active", "zoom-pop", revealRailTo(completed.length)),
        this.step(slide, ".roadmap-phase-labels .upcoming", "fade-down"),
        ...upcoming.map((milestone, index) =>
          this.stepFromElements(
            [milestone],
            "zoom-pop",
            revealRailTo(completed.length + index + 1),
          ),
        ),
        this.step(slide, ".roadmap-focus", "fade-up"),
      ],
    };
  }

  private threeJsConsiderationSequence(slide: HTMLElement): SlideSequence {
    return {
      steps: [
        this.step(slide, ".threejs-problem", "zoom-pop"),
        this.step(slide, ".threejs-candidate-flow", "fade-left"),
        this.step(slide, ".threejs-benefit-line", "fade-up"),
        this.step(slide, ".hybrid-direction", "zoom-pop"),
      ],
    };
  }

  private modelChoiceSequence(slide: HTMLElement): SlideSequence {
    const options = this.elements(slide, ".appendix-model-option");
    return {
      steps: [
        this.stepFromElements(options.slice(0, 1), "fade-left"),
        this.stepFromElements(
          [...this.elements(slide, ".appendix-model-vs"), ...options.slice(1, 2)],
          "fade-right",
        ),
        this.step(slide, ".appendix-model-question", "zoom-pop"),
      ],
    };
  }

  private threeJsOptionSequence(slide: HTMLElement): SlideSequence {
    const checks = this.elements(slide, ".threejs-feasibility-checks > span");
    return {
      steps: [
        this.step(slide, ".threejs-kicker", "fade-up"),
        this.stepMany(
          slide,
          [
            ".threejs-panel.benefit",
            ".threejs-panel.benefit .threejs-panel-heading",
            ".threejs-panel.benefit .threejs-benefit-grid",
          ],
          "zoom-pop",
        ),
        this.step(slide, ".threejs-component-tree", "zoom-pop"),
        this.step(slide, ".threejs-panel-takeaway", "zoom-pop"),
        this.stepMany(
          slide,
          [
            ".threejs-panel.feasibility",
            ".threejs-panel.feasibility .threejs-panel-heading",
            ".threejs-flow-row",
          ],
          "fade-right",
        ),
        this.step(slide, ".threejs-quality-gate", "zoom-pop"),
        this.step(slide, ".threejs-export-row", "zoom-pop"),
        ...checks.map((check) => this.stepFromElements([check], "zoom-pop")),
      ],
    };
  }

  private step(
    slide: HTMLElement,
    selector: string,
    animation: RevealAnimation,
    after?: () => void,
  ): RevealStep {
    return this.stepFromElements(this.elements(slide, selector), animation, after);
  }

  private stepMany(
    slide: HTMLElement,
    selectors: string[],
    animation: RevealAnimation,
    after?: () => void,
  ): RevealStep {
    return this.stepFromElements(
      selectors.flatMap((selector) => this.elements(slide, selector)),
      animation,
      after,
    );
  }

  private stepFromElements(
    elements: HTMLElement[],
    animation: RevealAnimation,
    after?: () => void,
  ): RevealStep {
    return {
      items: Array.from(new Set(elements)).map((element) => ({ element, animation })),
      after,
    };
  }

  private elements(slide: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(slide.querySelectorAll<HTMLElement>(selector));
  }

  private directChild(slide: HTMLElement, selector: string): HTMLElement | null {
    return (
      Array.from(slide.children).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches(selector),
      ) ?? null
    );
  }

  private animationFor(value: string | undefined): RevealAnimation {
    switch (value) {
      case "fade-down":
      case "fade-left":
      case "fade-right":
      case "rise-in":
      case "zoom-pop":
      case "blur-in":
        return value;
      case "fade-up":
      default:
        return "fade-up";
    }
  }

  private removeAnimationClasses(element: HTMLElement): void {
    element.classList.remove("hpx-entry", "hpx-entry-pending", ...ANIMATION_CLASSES);
  }
}
