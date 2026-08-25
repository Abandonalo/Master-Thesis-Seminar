import { gsap } from "gsap";

type MotionType = "fade-up" | "fade-left" | "fade-right" | "scale" | "draw" | "none";

interface SlideLifecycleDetail {
  index: number;
  slide: HTMLElement;
  direction: -1 | 0 | 1;
}

interface MotionConditions {
  allowMotion?: boolean;
  allowHover?: boolean;
}

interface MotionStartState {
  autoAlpha: number;
  x?: number;
  y?: number;
  scale?: number;
}

interface PromptPolicyHandoffRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Builds a fresh, slide-scoped GSAP timeline whenever a slide becomes active.
 * Timelines, pointer listeners, and event-created tweens are removed on exit so
 * revisiting a slide always replays from a clean state.
 */
export class SlideMotionController {
  private readonly media = gsap.matchMedia();

  private activeSlide: HTMLElement | null = null;
  private activeContext: gsap.Context | null = null;
  private activeTimeline: gsap.core.Timeline | null = null;
  private activeProgressiveTimeline: gsap.core.Timeline | null = null;
  private activeProgressiveTween: gsap.core.Tween | null = null;
  private progressiveStep = 0;
  private progressiveStepCount = 0;
  private progressiveStartsComplete = false;
  private pendingPromptPolicyHandoff: PromptPolicyHandoffRect | null = null;
  private hoverCleanups: Array<() => void> = [];
  private inlineStyleCleanups: Array<() => void> = [];
  private allowMotion = true;
  private allowHover = false;

  private readonly handleSlideEnter = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide) return;

    this.activeSlide = detail.slide;
    this.progressiveStartsComplete = detail.direction === -1;
    this.play(detail.slide);
  };

  private readonly handleSlideLeave = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide || detail.slide !== this.activeSlide) return;

    this.teardownActiveMotion();
    this.activeSlide = null;
    this.progressiveStartsComplete = false;
  };

  private constructor() {}

  static mount(): SlideMotionController | null {
    const slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
    return slides.length > 0 ? new SlideMotionController() : null;
  }

  initialize(): void {
    document.documentElement.classList.add("gsap-motion");
    document.addEventListener("slide:enter", this.handleSlideEnter);
    document.addEventListener("slide:leave", this.handleSlideLeave);

    this.media.add(
      {
        allowMotion: "(prefers-reduced-motion: no-preference)",
        allowHover: "(hover: hover) and (pointer: fine)"
      },
      (context) => {
        const conditions = (context.conditions || {}) as MotionConditions;
        this.allowMotion = Boolean(conditions.allowMotion);
        this.allowHover = Boolean(conditions.allowHover);

        if (this.activeSlide) this.play(this.activeSlide);

        return () => this.teardownActiveMotion();
      }
    );
  }

  /**
   * Advances one click-controlled reveal on the active slide. Returning true
   * tells the deck to consume the navigation input instead of changing slides.
   */
  advanceActiveSequence(): boolean {
    const timeline = this.activeProgressiveTimeline;
    if (!timeline) return false;
    if (this.activeProgressiveTween?.isActive()) {
      this.activeProgressiveTween.progress(1);
      this.activeProgressiveTween = null;
    }
    if (this.progressiveStep >= this.progressiveStepCount) return false;

    const nextStep = this.progressiveStep + 1;
    const label = `step-${nextStep}`;
    this.progressiveStep = nextStep;

    if (!this.allowMotion) {
      timeline.seek(label, false);
      return true;
    }

    const isSourceComparisonTransition =
      this.activeSlide?.classList.contains("generation-detail-slide") && nextStep === 2;

    this.activeProgressiveTween = timeline.tweenTo(label, {
      duration: isSourceComparisonTransition ? 1.08 : 0.46,
      ease: isSourceComparisonTransition ? "none" : "power2.inOut",
      onComplete: () => { this.activeProgressiveTween = null; }
    });
    return true;
  }

  /**
   * Arms the slide-7 → slide-8 shared-element handoff only after the full
   * generation architecture has been revealed and the prompt-policy card was clicked.
   */
  preparePromptPolicyHandoff(target: Element | null): boolean {
    if (
      !this.activeSlide?.classList.contains("generation-architecture-slide") ||
      this.progressiveStep < this.progressiveStepCount
    ) return false;

    const policy = target?.closest<HTMLElement>(".policy-cell");
    if (!policy || !this.activeSlide.contains(policy)) return false;

    const rect = policy.getBoundingClientRect();
    this.pendingPromptPolicyHandoff = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    return true;
  }

  private play(slide: HTMLElement): void {
    this.teardownActiveMotion();
    const isProgressiveArchitecture = slide.classList.contains("generation-architecture-slide");
    const isProgressiveGenerationDetail = slide.classList.contains("generation-detail-slide");
    const isProgressiveRefinementArchitecture = slide.classList.contains(
      "refinement-architecture-slide"
    );
    const isProgressiveSlide =
      isProgressiveArchitecture ||
      isProgressiveGenerationDetail ||
      isProgressiveRefinementArchitecture;
    if (!this.allowMotion && !isProgressiveSlide) return;

    this.activeContext = gsap.context(() => {
      if (this.allowMotion) {
        const timeline = gsap.timeline({
          defaults: { duration: 0.56, ease: "power3.out" }
        });

        this.activeTimeline = timeline;
        this.buildEntranceTimeline(timeline, slide);
      }

      if (isProgressiveArchitecture) this.setupGenerationArchitectureSequence(slide);
      if (isProgressiveGenerationDetail) this.setupGenerationDetailSequence(slide);
      if (isProgressiveRefinementArchitecture) {
        this.setupRefinementArchitectureSequence(slide);
      }
      if (isProgressiveArchitecture) this.bindPromptPolicyInteraction(slide);
      if (this.allowHover) this.bindCardHover(slide);
    }, slide);
  }

  private buildEntranceTimeline(timeline: gsap.core.Timeline, slide: HTMLElement): void {
    const handled = new Set<Element>();

    if (slide.classList.contains("title")) {
      this.addTitleSequence(timeline, slide, handled);
    } else {
      this.addSlideChrome(timeline, slide, handled);
      if (
        slide.classList.contains("generation-architecture-slide") ||
        slide.classList.contains("generation-detail-slide") ||
        slide.classList.contains("refinement-architecture-slide")
      ) return;

      timeline.addLabel("content", 0.24);

      if (slide.querySelector(".spatial-story")) {
        this.addSpatialStory(timeline, slide, handled);
      }

      this.addSvgSequences(timeline, slide, handled);
      this.addGenericContent(timeline, slide, handled);
      this.addTagAccents(timeline, slide, handled);
    }
  }

  private addTitleSequence(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const wrap = slide.querySelector<HTMLElement>(".title-wrap");
    if (!wrap) return;

    handled.add(wrap);
    const eyebrow = wrap.querySelector<HTMLElement>(".eyebrow");
    const heading = wrap.querySelector<HTMLElement>("h1, h2");
    const rule = wrap.querySelector<HTMLElement>(".rule");
    const subtitle = wrap.querySelector<HTMLElement>(".sub");
    const meta = wrap.querySelector<HTMLElement>(".meta");

    if (eyebrow) {
      handled.add(eyebrow);
      timeline.fromTo(
        eyebrow,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.42, clearProps: "transform,opacity,visibility" },
        0.04
      );
    }

    if (heading) {
      handled.add(heading);
      timeline.fromTo(
        heading,
        { autoAlpha: 0, y: 34, rotationX: -5, transformOrigin: "0% 50%" },
        {
          autoAlpha: 1,
          y: 0,
          rotationX: 0,
          duration: 0.86,
          ease: "power4.out",
          clearProps: "transform,opacity,visibility,transformOrigin"
        },
        0.12
      );
    }

    if (rule) {
      handled.add(rule);
      timeline.fromTo(
        rule,
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.72, ease: "power3.inOut", clearProps: "transform,transformOrigin" },
        0.38
      );
    }

    [subtitle, meta].forEach((element, index) => {
      if (!element) return;
      handled.add(element);
      timeline.fromTo(
        element,
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.5, clearProps: "transform,opacity,visibility" },
        0.58 + index * 0.09
      );
    });
  }

  private addSlideChrome(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const eyebrow = this.directChild(slide, ".eyebrow");
    const heading = this.directChild(slide, "h1, h2");
    const rule = this.directChild(slide, ".rule");

    if (eyebrow) {
      handled.add(eyebrow);
      timeline.fromTo(
        eyebrow,
        { autoAlpha: 0, y: -8 },
        { autoAlpha: 1, y: 0, duration: 0.34, clearProps: "transform,opacity,visibility" },
        0
      );
    }

    if (heading) {
      handled.add(heading);
      timeline.fromTo(
        heading,
        { autoAlpha: 0, y: 22, rotationX: -4, transformOrigin: "0% 50%" },
        {
          autoAlpha: 1,
          y: 0,
          rotationX: 0,
          duration: 0.64,
          ease: "power4.out",
          clearProps: "transform,opacity,visibility,transformOrigin"
        },
        0.04
      );
    }

    if (rule) {
      handled.add(rule);
      timeline.fromTo(
        rule,
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.55, ease: "power3.inOut", clearProps: "transform,transformOrigin" },
        0.12
      );
    }
  }

  /** Builds the eleven click stops requested for the generation architecture. */
  private setupGenerationArchitectureSequence(slide: HTMLElement): void {
    const unityTier = slide.querySelector<HTMLElement>(".unity-tier");
    const serviceTier = slide.querySelector<HTMLElement>(".service-tier");
    const proxy = slide.querySelector<HTMLElement>(".proxy-cell");
    const textualPrompt = slide.querySelector<HTMLElement>(".textual-prompt-cell");
    const constraints = slide.querySelector<HTMLElement>(".constraints-cell");
    const result = slide.querySelector<HTMLElement>(".result-cell");
    const policy = slide.querySelector<HTMLElement>(".policy-cell");
    const imageGeneration = slide.querySelector<HTMLElement>(".image-generation-cell");
    const extraction = slide.querySelector<HTMLElement>(".extraction-cell");
    const lifting = slide.querySelector<HTMLElement>(".lifting-cell");
    const fit = slide.querySelector<HTMLElement>(".fit-cell");
    const promptFlow = slide.querySelector<HTMLElement>(".prompt-flow");
    const constraintsFlow = slide.querySelector<HTMLElement>(".constraints-flow");
    const upFlow = slide.querySelector<HTMLElement>(".up-flow");

    const required = [
      unityTier,
      serviceTier,
      proxy,
      textualPrompt,
      constraints,
      result,
      policy,
      imageGeneration,
      extraction,
      lifting,
      fit,
      promptFlow,
      constraintsFlow,
      upFlow
    ];
    if (required.some((element) => !element)) return;

    const cards = [
      proxy,
      textualPrompt,
      constraints,
      result,
      policy,
      imageGeneration,
      extraction,
      lifting,
      fit
    ] as HTMLElement[];
    const horizontalArrowSources = [
      proxy,
      textualPrompt,
      policy,
      imageGeneration,
      extraction,
      lifting
    ] as HTMLElement[];
    const transfers = [promptFlow, constraintsFlow, upFlow] as HTMLElement[];

    gsap.set([unityTier, serviceTier], {
      autoAlpha: 0,
      y: 8,
      scale: 0.99,
      transformOrigin: "50% 50%"
    });
    gsap.set(cards, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%"
    });
    gsap.set(horizontalArrowSources, { "--flow-arrow-opacity": 0 } as gsap.TweenVars);
    transfers.forEach((transfer) => this.prepareTransferReveal(transfer));

    const progressive = gsap.timeline({
      paused: true,
      defaults: { duration: 0.42, ease: "power3.out" }
    });
    this.activeProgressiveTimeline = progressive;
    this.progressiveStep = 0;
    this.progressiveStepCount = 11;

    const revealCard = { autoAlpha: 1, y: 0, scale: 1 };
    const revealTier = { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 };
    const revealArrow = { "--flow-arrow-opacity": 1, duration: 0.24 } as gsap.TweenVars;

    progressive.addLabel("step-0", 0);

    progressive.to(unityTier as HTMLElement, revealTier, "step-0");
    progressive.addLabel("step-1");

    progressive.to(proxy as HTMLElement, revealCard, "step-1");
    progressive.addLabel("step-2");

    progressive.to(textualPrompt as HTMLElement, revealCard, "step-2");
    progressive.to(proxy as HTMLElement, revealArrow, "step-2+=0.12");
    progressive.addLabel("step-3");

    progressive.to(constraints as HTMLElement, revealCard, "step-3");
    progressive.to(textualPrompt as HTMLElement, revealArrow, "step-3+=0.12");
    progressive.addLabel("step-4");

    progressive.to(serviceTier as HTMLElement, revealTier, "step-4");
    progressive.addLabel("step-5");

    progressive.to(policy as HTMLElement, revealCard, "step-5");
    this.addTransferReveal(progressive, promptFlow as HTMLElement, "step-5", "down");
    progressive.addLabel("step-6");

    progressive.to(imageGeneration as HTMLElement, revealCard, "step-6");
    progressive.to(policy as HTMLElement, revealArrow, "step-6+=0.12");
    this.addTransferReveal(progressive, constraintsFlow as HTMLElement, "step-6", "down");
    progressive.addLabel("step-7");

    progressive.to(extraction as HTMLElement, revealCard, "step-7");
    progressive.to(imageGeneration as HTMLElement, revealArrow, "step-7+=0.12");
    progressive.addLabel("step-8");

    progressive.to(lifting as HTMLElement, revealCard, "step-8");
    progressive.to(extraction as HTMLElement, revealArrow, "step-8+=0.12");
    progressive.addLabel("step-9");

    progressive.to(fit as HTMLElement, revealCard, "step-9");
    progressive.to(lifting as HTMLElement, revealArrow, "step-9+=0.12");
    progressive.addLabel("step-10");

    progressive.to(result as HTMLElement, revealCard, "step-10");
    this.addTransferReveal(progressive, upFlow as HTMLElement, "step-10", "up");
    progressive.addLabel("step-11");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds the six click stops requested for the refinement architecture. */
  private setupRefinementArchitectureSequence(slide: HTMLElement): void {
    const unityTier = slide.querySelector<HTMLElement>(".refinement-unity-tier");
    const serviceTier = slide.querySelector<HTMLElement>(".refinement-service-tier");
    const select = slide.querySelector<HTMLElement>(".refinement-select-cell");
    const capture = slide.querySelector<HTMLElement>(".refinement-capture-cell");
    const inpaint = slide.querySelector<HTMLElement>(".refinement-inpaint-cell");
    const prepare = slide.querySelector<HTMLElement>(".refinement-prepare-cell");
    const lift = slide.querySelector<HTMLElement>(".refinement-lift-cell");
    const result = slide.querySelector<HTMLElement>(".refinement-result-cell");
    const downFlow = slide.querySelector<HTMLElement>(".refinement-capture-flow");
    const upFlow = slide.querySelector<HTMLElement>(".refinement-replacement-flow");

    const required = [
      unityTier,
      serviceTier,
      select,
      capture,
      inpaint,
      prepare,
      lift,
      result,
      downFlow,
      upFlow
    ];
    if (required.some((element) => !element)) return;

    const cards = [select, capture, inpaint, prepare, lift, result] as HTMLElement[];
    const horizontalArrowSources = [select, inpaint, prepare] as HTMLElement[];
    const transfers = [downFlow, upFlow] as HTMLElement[];

    gsap.set([unityTier, serviceTier], {
      autoAlpha: 0,
      y: 8,
      scale: 0.99,
      transformOrigin: "50% 50%"
    });
    gsap.set(cards, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%"
    });
    gsap.set(horizontalArrowSources, { "--flow-arrow-opacity": 0 } as gsap.TweenVars);
    transfers.forEach((transfer) => this.prepareTransferReveal(transfer));

    const progressive = gsap.timeline({
      paused: true,
      defaults: { duration: 0.42, ease: "power3.out" }
    });
    this.activeProgressiveTimeline = progressive;
    this.progressiveStep = 0;
    this.progressiveStepCount = 6;

    const revealCard = { autoAlpha: 1, y: 0, scale: 1 };
    const revealTier = { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 };
    const revealArrow = { "--flow-arrow-opacity": 1, duration: 0.24 } as gsap.TweenVars;

    progressive.addLabel("step-0", 0);

    progressive.to(unityTier as HTMLElement, revealTier, "step-0");
    progressive.to(select as HTMLElement, revealCard, "step-0+=0.08");
    progressive.addLabel("step-1");

    progressive.to(capture as HTMLElement, revealCard, "step-1");
    progressive.to(select as HTMLElement, revealArrow, "step-1+=0.12");
    progressive.addLabel("step-2");

    progressive.to(serviceTier as HTMLElement, revealTier, "step-2");
    progressive.to(inpaint as HTMLElement, revealCard, "step-2+=0.08");
    this.addTransferReveal(progressive, downFlow as HTMLElement, "step-2+=0.08", "down");
    progressive.addLabel("step-3");

    progressive.to(prepare as HTMLElement, revealCard, "step-3");
    progressive.to(inpaint as HTMLElement, revealArrow, "step-3+=0.12");
    progressive.addLabel("step-4");

    progressive.to(lift as HTMLElement, revealCard, "step-4");
    progressive.to(prepare as HTMLElement, revealArrow, "step-4+=0.12");
    progressive.addLabel("step-5");

    progressive.to(result as HTMLElement, revealCard, "step-5");
    this.addTransferReveal(progressive, upFlow as HTMLElement, "step-5+=0.04", "up");
    progressive.addLabel("step-6");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds the nine click stops requested for the generation-detail comparison. */
  private setupGenerationDetailSequence(slide: HTMLElement): void {
    const photograph = slide.querySelector<HTMLElement>(".photograph-source");
    const photographOutcome = photograph?.querySelector<HTMLElement>("h3");
    const comparisonArrow = slide.querySelector<HTMLElement>(".source-comparison-mid");
    const lowpoly = slide.querySelector<HTMLElement>(".lowpoly-source");
    const comparisonBut = slide.querySelector<HTMLElement>(".source-comparison-but");
    const tilted = slide.querySelector<HTMLElement>(".tilted-output");
    const recovery = slide.querySelector<HTMLElement>(".orientation-recovery");
    const recoverySteps = Array.from(slide.querySelectorAll<HTMLElement>(".recovery-step"));
    const recoveryArrows = Array.from(slide.querySelectorAll<HTMLElement>(".recovery-flow > i"));
    const recoveryResult = slide.querySelector<HTMLElement>(".recovery-result");

    if (
      !photograph ||
      !photographOutcome ||
      !comparisonArrow ||
      !lowpoly ||
      !comparisonBut ||
      !tilted ||
      !recovery ||
      !recoveryResult ||
      recoverySteps.length !== 4 ||
      recoveryArrows.length !== 3
    ) return;

    const slideRect = slide.getBoundingClientRect();
    const photographRect = photograph.getBoundingClientRect();
    const scaleX = slide.offsetWidth > 0 ? slideRect.width / slide.offsetWidth : 1;
    const scaleY = slide.offsetHeight > 0 ? slideRect.height / slide.offsetHeight : 1;
    const initialX = (
      slideRect.left + slideRect.width / 2 -
      (photographRect.left + photographRect.width / 2)
    ) / scaleX;
    const initialY = (
      slideRect.top + slideRect.height / 2 -
      (photographRect.top + photographRect.height / 2)
    ) / scaleY;
    const promptPolicyHandoff = this.pendingPromptPolicyHandoff;
    this.pendingPromptPolicyHandoff = null;

    if (promptPolicyHandoff && this.allowMotion) {
      const sourceScale = Math.max(
        0.35,
        Math.min(
          promptPolicyHandoff.width / photographRect.width,
          promptPolicyHandoff.height / photographRect.height
        )
      );
      const sourceX = (
        promptPolicyHandoff.left + promptPolicyHandoff.width / 2 -
        (photographRect.left + photographRect.width / 2)
      ) / scaleX;
      const sourceY = (
        promptPolicyHandoff.top + promptPolicyHandoff.height / 2 -
        (photographRect.top + photographRect.height / 2)
      ) / scaleY;

      gsap.fromTo(
        photograph,
        {
          autoAlpha: 0,
          x: sourceX,
          y: sourceY,
          scale: sourceScale,
          transformOrigin: "50% 50%"
        },
        {
          autoAlpha: 1,
          x: initialX,
          y: initialY,
          scale: 2,
          duration: 0.86,
          delay: 0.08,
          ease: "back.out(1.32)",
          overwrite: "auto"
        }
      );
    } else {
      gsap.set(photograph, {
        autoAlpha: 1,
        x: initialX,
        y: initialY,
        scale: 2,
        transformOrigin: "50% 50%"
      });
    }
    gsap.set(photographOutcome, { autoAlpha: 0, y: 8 });
    gsap.set(comparisonArrow, { autoAlpha: 0, x: -20, scale: 0.82 });
    gsap.set(lowpoly, {
      autoAlpha: 0,
      x: -32,
      scaleX: 0.82,
      transformOrigin: "left center"
    });
    gsap.set(comparisonBut, { autoAlpha: 0, x: -10 });
    gsap.set(tilted, {
      autoAlpha: 0,
      x: -24,
      scale: 0.97,
      transformOrigin: "left center"
    });
    gsap.set(recovery, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%"
    });
    gsap.set(recoverySteps, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%"
    });
    gsap.set(recoveryArrows, {
      autoAlpha: 0,
      scaleX: 0,
      transformOrigin: "left center"
    });
    gsap.set(recoveryResult, {
      autoAlpha: 0,
      y: 10,
      scale: 0.98,
      transformOrigin: "50% 50%"
    });

    const progressive = gsap.timeline({
      paused: true,
      defaults: { duration: 0.42, ease: "power3.out" }
    });
    this.activeProgressiveTimeline = progressive;
    this.progressiveStep = 0;
    this.progressiveStepCount = 9;

    const revealStep = { autoAlpha: 1, y: 0, scale: 1, duration: 0.38 };
    const revealArrow = { autoAlpha: 1, scaleX: 1, duration: 0.24 };

    progressive.addLabel("step-0", 0);

    progressive.to(photographOutcome as HTMLElement, { autoAlpha: 1, y: 0 }, "step-0");
    progressive.addLabel("step-1");

    progressive.to(
      photograph as HTMLElement,
      { x: 0, y: 0, scale: 1, duration: 1.08, ease: "power3.inOut" },
      "step-1"
    );
    progressive.to(
      comparisonArrow as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.34, ease: "back.out(1.45)" },
      "step-1+=0.46"
    );
    progressive.to(
      lowpoly as HTMLElement,
      { autoAlpha: 1, x: 0, scaleX: 1, duration: 0.5, ease: "power3.out" },
      "step-1+=0.56"
    );
    progressive.addLabel("step-2");

    progressive.to(
      comparisonBut as HTMLElement,
      { autoAlpha: 1, x: 0, duration: 0.28 },
      "step-2"
    );
    progressive.to(
      tilted as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.5 },
      "step-2+=0.08"
    );
    progressive.addLabel("step-3");

    progressive.to(
      recovery as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-3"
    );
    progressive.addLabel("step-4");

    progressive.to(recoverySteps[0], revealStep, "step-4");
    progressive.addLabel("step-5");

    progressive.to(recoveryArrows[0], revealArrow, "step-5");
    progressive.to(recoverySteps[1], revealStep, "step-5+=0.08");
    progressive.addLabel("step-6");

    progressive.to(recoveryArrows[1], revealArrow, "step-6");
    progressive.to(recoverySteps[2], revealStep, "step-6+=0.08");
    progressive.addLabel("step-7");

    progressive.to(recoveryArrows[2], revealArrow, "step-7");
    progressive.to(recoverySteps[3], revealStep, "step-7+=0.08");
    progressive.addLabel("step-8");

    progressive.to(
      recoveryResult as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-8"
    );
    progressive.addLabel("step-9");
    this.applyProgressiveEntryState(progressive);
  }

  private applyProgressiveEntryState(timeline: gsap.core.Timeline): void {
    if (!this.progressiveStartsComplete) return;

    timeline.seek(`step-${this.progressiveStepCount}`, false);
    this.progressiveStep = this.progressiveStepCount;
  }

  private prepareTransferReveal(transfer: HTMLElement): void {
    const line = transfer.querySelector<HTMLElement>("i");
    const label = transfer.querySelector<HTMLElement>("span");
    const preserveLabelTransform = transfer.closest(
      ".generation-architecture-slide, .refinement-architecture-slide"
    ) !== null;
    gsap.set(transfer, { autoAlpha: 0 });
    if (line) gsap.set(line, { scaleY: 0 });
    if (label) {
      gsap.set(label, preserveLabelTransform ? { autoAlpha: 0 } : { autoAlpha: 0, y: 3 });
    }
  }

  private addTransferReveal(
    timeline: gsap.core.Timeline,
    transfer: HTMLElement,
    position: string,
    direction: "down" | "up"
  ): void {
    const line = transfer.querySelector<HTMLElement>("i");
    const label = transfer.querySelector<HTMLElement>("span");
    const preserveLabelTransform = transfer.closest(
      ".generation-architecture-slide, .refinement-architecture-slide"
    ) !== null;

    timeline.set(transfer, { autoAlpha: 1 }, position);
    if (line) {
      timeline.to(
        line,
        {
          scaleY: 1,
          duration: 0.38,
          ease: "power2.inOut",
          transformOrigin: direction === "up" ? "center bottom" : "center top"
        },
        position
      );
    }
    if (label) {
      timeline.to(
        label,
        preserveLabelTransform
          ? { autoAlpha: 1, duration: 0.26 }
          : { autoAlpha: 1, y: 0, duration: 0.26 },
        `${position}+=0.08`
      );
    }
  }

  private addSpatialStory(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const story = slide.querySelector<HTMLElement>(".spatial-story");
    const intended = story?.querySelector<HTMLElement>(".scene-plan.intended");
    const prompt = story?.querySelector<HTMLElement>(".prompt-bottleneck");
    const guessed = story?.querySelector<HTMLElement>(".scene-plan.guessed");
    if (!story || !intended || !prompt || !guessed) return;

    [story, intended, prompt, guessed].forEach((element) => handled.add(element));

    timeline.fromTo(
      intended,
      { autoAlpha: 0, x: -34, scale: 0.975 },
      {
        autoAlpha: 1,
        x: 0,
        scale: 1,
        duration: 0.72,
        clearProps: "transform,opacity,visibility"
      },
      "content"
    );
    timeline.fromTo(
      prompt,
      { autoAlpha: 0, y: 20, scale: 0.96 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.62,
        clearProps: "transform,opacity,visibility"
      },
      "content+=0.12"
    );
    timeline.fromTo(
      guessed,
      { autoAlpha: 0, x: 34, scale: 0.975 },
      {
        autoAlpha: 1,
        x: 0,
        scale: 1,
        duration: 0.72,
        clearProps: "transform,opacity,visibility"
      },
      "content+=0.24"
    );

    const losses = Array.from(prompt.querySelectorAll<HTMLElement>(".prompt-loss span"));
    if (losses.length > 0) {
      losses.forEach((element) => handled.add(element));
      timeline.fromTo(
        losses,
        { autoAlpha: 0, y: 9, scale: 0.92 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.32,
          stagger: 0.055,
          clearProps: "transform,opacity,visibility"
        },
        "content+=0.42"
      );
    }

    const arrow = prompt.querySelector<HTMLElement>(".guess-arrow");
    if (arrow) {
      handled.add(arrow);
      timeline.fromTo(
        arrow,
        { autoAlpha: 0, x: -9 },
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.48,
          ease: "back.out(1.8)",
          clearProps: "transform,opacity,visibility"
        },
        "content+=0.56"
      );
    }
  }

  private addSvgSequences(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const diagrams = Array.from(slide.querySelectorAll<SVGSVGElement>("svg[viewBox]"));

    diagrams.forEach((diagram, diagramIndex) => {
      handled.add(diagram);
      const start = `content+=${(0.08 + diagramIndex * 0.08).toFixed(2)}`;
      const boxes = Array.from(
        diagram.querySelectorAll<SVGGraphicsElement>(
          ".sv-box, .sv-box-a, .sv-box-w, .sv-box-g, .sv-box-r"
        )
      );
      const labels = Array.from(diagram.querySelectorAll<SVGTextElement>("text"));
      const arrows = Array.from(diagram.querySelectorAll<SVGGeometryElement>(".sv-arr"));
      const bars = Array.from(diagram.querySelectorAll<SVGGraphicsElement>("[data-gsap-bar]"));

      if (boxes.length > 0) {
        boxes.forEach((element) => handled.add(element));
        boxes.forEach((element) => this.trackInlineStyle(element, "transform-origin"));
        timeline.fromTo(
          boxes,
          { autoAlpha: 0, scale: 0.96, transformOrigin: "50% 50%" },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.42,
            stagger: 0.035,
            clearProps: "transform,opacity,visibility,transformOrigin"
          },
          start
        );
      }

      if (labels.length > 0) {
        labels.forEach((element) => handled.add(element));
        timeline.fromTo(
          labels,
          { autoAlpha: 0, y: 3 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.008,
            clearProps: "transform,transformOrigin,opacity,visibility"
          },
          `${start}+=0.12`
        );
      }

      arrows.forEach((arrow, arrowIndex) => {
        handled.add(arrow);
        const length = this.pathLength(arrow);
        if (length <= 0) return;

        gsap.set(arrow, { strokeDasharray: length, strokeDashoffset: length });
        timeline.to(
          arrow,
          {
            strokeDashoffset: 0,
            duration: 0.48,
            ease: "power2.inOut",
            clearProps: "stroke-dasharray,stroke-dashoffset"
          },
          `${start}+=${(0.2 + arrowIndex * 0.035).toFixed(3)}`
        );
      });

      if (bars.length > 0) {
        bars.forEach((element) => handled.add(element));
        bars.forEach((element) => this.trackInlineStyle(element, "transform-origin"));
        timeline.fromTo(
          bars,
          { scaleX: 0, transformOrigin: "left center" },
          {
            scaleX: 1,
            duration: 0.55,
            stagger: 0.08,
            ease: "power3.out",
            clearProps: "transform,transformOrigin"
          },
          `${start}+=0.18`
        );
      }
    });
  }

  private addGenericContent(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const targets = Array.from(
      slide.querySelectorAll<HTMLElement>("[data-motion]:not([data-motion='none'])")
    ).filter((element) => !handled.has(element) && !element.closest("svg"));

    targets.forEach((element) => {
      handled.add(element);
      const motion = (element.dataset.motion || "fade-up") as MotionType;
      const order = Number.parseFloat(element.dataset.motionOrder || "0") || 0;
      const duration = element.classList.contains("motion-slow")
        ? 0.8
        : element.classList.contains("motion-fast")
          ? 0.3
          : 0.52;

      timeline.fromTo(
        element,
        this.motionStart(motion),
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration,
          clearProps: "transform,opacity,visibility"
        },
        `content+=${(order * 0.055).toFixed(3)}`
      );
    });
  }

  private addTagAccents(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>
  ): void {
    const tags = Array.from(slide.querySelectorAll<HTMLElement>(".tag")).filter(
      (tag) => !handled.has(tag) && !tag.closest(".spatial-story")
    );
    if (tags.length === 0) return;

    tags.forEach((tag) => handled.add(tag));
    timeline.fromTo(
      tags,
      { autoAlpha: 0, scale: 0.9, transformOrigin: "left center" },
      {
        autoAlpha: 1,
        scale: 1,
        duration: 0.32,
        stagger: 0.055,
        ease: "back.out(1.6)",
        clearProps: "transform,opacity,visibility,transformOrigin"
      },
      "content+=0.34"
    );
  }

  private bindCardHover(slide: HTMLElement): void {
    const cards = Array.from(slide.querySelectorAll<HTMLElement>(".card")).filter(
      (card) => !card.closest(".spatial-story")
    );

    cards.forEach((card) => {
      const originalTransform = card.style.getPropertyValue("transform");
      const originalTransformPriority = card.style.getPropertyPriority("transform");
      const restoreTransform = (): void => {
        if (originalTransform) {
          card.style.setProperty("transform", originalTransform, originalTransformPriority);
        } else {
          card.style.removeProperty("transform");
        }
      };
      const enter = (): void => {
        gsap.to(card, {
          y: -3,
          scale: 1.008,
          duration: 0.22,
          ease: "power2.out",
          overwrite: "auto"
        });
      };
      const leave = (): void => {
        gsap.to(card, {
          y: 0,
          scale: 1,
          duration: 0.28,
          ease: "power3.out",
          overwrite: "auto",
          onComplete: restoreTransform
        });
      };

      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointerleave", leave);
      this.hoverCleanups.push(() => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointerleave", leave);
        gsap.killTweensOf(card);
        restoreTransform();
      });
    });
  }

  private bindPromptPolicyInteraction(slide: HTMLElement): void {
    const policy = slide.querySelector<HTMLElement>(".policy-cell");
    if (!policy) return;

    const originalTransform = policy.style.getPropertyValue("transform");
    const originalTransformPriority = policy.style.getPropertyPriority("transform");
    const restoreTransform = (): void => {
      if (originalTransform) {
        policy.style.setProperty("transform", originalTransform, originalTransformPriority);
      } else {
        policy.style.removeProperty("transform");
      }
    };
    const animateRestingState = (hovered: boolean): void => {
      if (!this.allowMotion) return;
      gsap.to(policy, {
        y: hovered ? -3 : 0,
        scale: hovered ? 1.012 : 1,
        duration: hovered ? 0.22 : 0.28,
        ease: hovered ? "power2.out" : "power3.out",
        overwrite: "auto",
        onComplete: hovered ? undefined : restoreTransform
      });
    };
    const enter = (): void => {
      policy.classList.add("is-policy-hovered");
      animateRestingState(true);
    };
    const leave = (): void => {
      policy.classList.remove("is-policy-hovered", "is-policy-pressed");
      animateRestingState(false);
    };
    const press = (): void => {
      policy.classList.add("is-policy-pressed");
      if (!this.allowMotion) return;
      gsap.to(policy, {
        y: 1,
        scale: 0.975,
        duration: 0.09,
        ease: "power2.out",
        overwrite: "auto"
      });
    };
    const release = (): void => {
      policy.classList.remove("is-policy-pressed");
      animateRestingState(policy.matches(":hover"));
    };

    policy.addEventListener("pointerenter", enter);
    policy.addEventListener("pointerleave", leave);
    policy.addEventListener("pointerdown", press);
    policy.addEventListener("pointerup", release);
    policy.addEventListener("pointercancel", leave);
    this.hoverCleanups.push(() => {
      policy.removeEventListener("pointerenter", enter);
      policy.removeEventListener("pointerleave", leave);
      policy.removeEventListener("pointerdown", press);
      policy.removeEventListener("pointerup", release);
      policy.removeEventListener("pointercancel", leave);
      policy.classList.remove("is-policy-hovered", "is-policy-pressed");
      gsap.killTweensOf(policy);
      restoreTransform();
    });
  }

  private teardownActiveMotion(): void {
    this.hoverCleanups.splice(0).forEach((cleanup) => cleanup());
    this.activeProgressiveTween?.kill();
    this.activeProgressiveTween = null;
    this.activeProgressiveTimeline?.kill();
    this.activeProgressiveTimeline = null;
    this.progressiveStep = 0;
    this.progressiveStepCount = 0;
    this.activeTimeline?.kill();
    this.activeTimeline = null;
    this.activeContext?.revert();
    this.activeContext = null;
    this.inlineStyleCleanups.splice(0).forEach((cleanup) => cleanup());
  }

  private motionStart(motion: MotionType): MotionStartState {
    switch (motion) {
      case "fade-left":
        return { autoAlpha: 0, x: -26 };
      case "fade-right":
        return { autoAlpha: 0, x: 26 };
      case "scale":
        return { autoAlpha: 0, scale: 0.965 };
      case "draw":
      case "fade-up":
      default:
        return { autoAlpha: 0, y: 18 };
    }
  }

  private directChild(slide: HTMLElement, selector: string): HTMLElement | null {
    return Array.from(slide.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.matches(selector)
    ) || null;
  }

  private pathLength(element: SVGGeometryElement): number {
    try {
      return element.getTotalLength();
    } catch {
      return 0;
    }
  }

  private trackInlineStyle(element: SVGGraphicsElement, property: string): void {
    const value = element.style.getPropertyValue(property);
    const priority = element.style.getPropertyPriority(property);

    this.inlineStyleCleanups.push(() => {
      if (value) {
        element.style.setProperty(property, value, priority);
      } else {
        element.style.removeProperty(property);
      }
    });
  }
}
