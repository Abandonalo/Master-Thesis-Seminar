import { gsap } from "gsap";
import type { MotionType, SlideLifecycleDetail } from "./presentation-types";

interface MotionConditions {
  allowMotion?: boolean;
  reduceMotion?: boolean;
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
  private allowMotion = true;

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
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const conditions = (context.conditions || {}) as MotionConditions;
        this.allowMotion = Boolean(conditions.allowMotion);

        if (this.activeSlide) this.play(this.activeSlide);

        return () => this.teardownActiveMotion();
      },
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
      this.activeSlide?.classList.contains("generation-detail-slide") &&
      nextStep === 2;

    this.activeProgressiveTween = timeline.tweenTo(label, {
      duration: isSourceComparisonTransition ? 1.08 : 0.46,
      ease: isSourceComparisonTransition ? "none" : "power2.inOut",
      onComplete: () => {
        this.activeProgressiveTween = null;
      },
    });
    return true;
  }

  /**
   * Arms the slide-6 → slide-7 shared-element handoff only after the full
   * generation architecture has been revealed and the prompt-policy card was clicked.
   */
  preparePromptPolicyHandoff(target: Element | null): boolean {
    if (
      !this.activeSlide?.classList.contains("generation-architecture-slide") ||
      this.progressiveStep < this.progressiveStepCount
    )
      return false;

    const policy = target?.closest<HTMLElement>(".policy-cell");
    if (!policy || !this.activeSlide.contains(policy)) return false;

    const rect = policy.getBoundingClientRect();
    this.pendingPromptPolicyHandoff = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    return true;
  }

  private play(slide: HTMLElement): void {
    this.teardownActiveMotion();
    const progressiveSetup = this.progressiveSetupFor(slide);
    if (!this.allowMotion && !progressiveSetup) return;

    this.activeContext = gsap.context(() => {
      if (this.allowMotion) {
        const timeline = gsap.timeline({
          defaults: { duration: 0.56, ease: "power3.out" },
        });

        this.activeTimeline = timeline;
        this.buildEntranceTimeline(timeline, slide, Boolean(progressiveSetup));
      }

      progressiveSetup?.();
      if (slide.classList.contains("generation-architecture-slide")) {
        this.bindPromptPolicyInteraction(slide);
      }
    }, slide);
  }

  private progressiveSetupFor(slide: HTMLElement): (() => void) | null {
    const sequences: Array<[string, () => void]> = [
      ["problem-story-slide", () => this.setupProblemStorySequence(slide)],
      [
        "human-foundations-slide",
        () => this.setupHumanFoundationsSequence(slide),
      ],
      ["ai-landscape-slide", () => this.setupAiLandscapeSequence(slide)],
      [
        "research-opportunity-slide",
        () => this.setupResearchQuestionSequence(slide),
      ],
      [
        "generation-architecture-slide",
        () => this.setupGenerationArchitectureSequence(slide),
      ],
      [
        "generation-detail-slide",
        () => this.setupGenerationDetailSequence(slide),
      ],
      [
        "refinement-architecture-slide",
        () => this.setupRefinementArchitectureSequence(slide),
      ],
      ["study-design-slide", () => this.setupStudyDesignSequence(slide)],
      ["measurement-slide", () => this.setupMeasurementSequence(slide)],
      ["study-roadmap-slide", () => this.setupRoadmapSequence(slide)],
      ["threejs-option-slide", () => this.setupThreeJsOptionSequence(slide)],
    ];

    return (
      sequences.find(([className]) =>
        slide.classList.contains(className),
      )?.[1] ?? null
    );
  }

  private buildEntranceTimeline(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    isProgressive: boolean,
  ): void {
    const handled = new Set<Element>();

    if (slide.classList.contains("title")) {
      this.addTitleSequence(timeline, slide, handled);
    } else {
      const isHumanFoundations = slide.classList.contains(
        "human-foundations-slide",
      );
      this.addSlideChrome(timeline, slide, handled, !isHumanFoundations);
      if (isProgressive) return;

      timeline.addLabel("content", 0.24);
      this.addGenericContent(timeline, slide, handled);
    }
  }

  private addTitleSequence(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>,
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
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.42,
          clearProps: "transform,opacity,visibility",
        },
        0.04,
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
          clearProps: "transform,opacity,visibility,transformOrigin",
        },
        0.12,
      );
    }

    if (rule) {
      handled.add(rule);
      timeline.fromTo(
        rule,
        { scaleX: 0, transformOrigin: "left center" },
        {
          scaleX: 1,
          duration: 0.72,
          ease: "power3.inOut",
          clearProps: "transform,transformOrigin",
        },
        0.38,
      );
    }

    [subtitle, meta].forEach((element, index) => {
      if (!element) return;
      handled.add(element);
      timeline.fromTo(
        element,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          clearProps: "transform,opacity,visibility",
        },
        0.58 + index * 0.09,
      );
    });
  }

  private addSlideChrome(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>,
    includeHeading = true,
  ): void {
    const eyebrow = this.directChild(slide, ".eyebrow");
    const heading = this.directChild(slide, "h1, h2");
    const rule = this.directChild(slide, ".rule");

    if (eyebrow) {
      handled.add(eyebrow);
      timeline.fromTo(
        eyebrow,
        { autoAlpha: 0, y: -8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.34,
          clearProps: "transform,opacity,visibility",
        },
        0,
      );
    }

    if (heading && includeHeading) {
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
          clearProps: "transform,opacity,visibility,transformOrigin",
        },
        0.04,
      );
    }

    if (rule) {
      handled.add(rule);
      timeline.fromTo(
        rule,
        { scaleX: 0, transformOrigin: "left center" },
        {
          scaleX: 1,
          duration: 0.55,
          ease: "power3.inOut",
          clearProps: "transform,transformOrigin",
        },
        0.12,
      );
    }
  }

  /**
   * Builds slide 2 as a four-click narrative: intended arrangement, the text
   * description, the inference arrow, and finally the model's spatial guess.
   */
  private setupProblemStorySequence(slide: HTMLElement): void {
    const intended = slide.querySelector<HTMLElement>(".scene-plan.intended");
    const promptTag = slide.querySelector<HTMLElement>(
      ".prompt-bottleneck > .tag",
    );
    const quote = slide.querySelector<HTMLElement>(
      ".prompt-bottleneck > blockquote",
    );
    const arrow = slide.querySelector<HTMLElement>(
      ".prompt-bottleneck > .guess-arrow",
    );
    const guessed = slide.querySelector<HTMLElement>(".scene-plan.guessed");

    if (!intended || !promptTag || !quote || !arrow || !guessed) return;

    gsap.set(intended, {
      autoAlpha: 0,
      x: -34,
      scale: 0.975,
      transformOrigin: "50% 50%",
    });
    gsap.set(promptTag, {
      autoAlpha: 0,
      y: 8,
      scale: 0.9,
      transformOrigin: "left center",
    });
    gsap.set(quote, { autoAlpha: 0, y: 16 });
    gsap.set(arrow, {
      autoAlpha: 0,
      x: -12,
      scale: 0.86,
      transformOrigin: "50% 50%",
    });
    gsap.set(guessed, {
      autoAlpha: 0,
      x: 34,
      scale: 0.975,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(4, 0.48);

    progressive.addLabel("step-0", 0);

    progressive.to(
      intended,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.62 },
      "step-0",
    );
    progressive.addLabel("step-1");

    progressive.to(
      promptTag,
      { autoAlpha: 1, y: 0, scale: 1, ease: "back.out(1.55)", duration: 0.34 },
      "step-1",
    );
    progressive.to(
      quote,
      { autoAlpha: 1, y: 0, duration: 0.5 },
      "step-1+=0.08",
    );
    progressive.addLabel("step-2");

    progressive.to(
      arrow,
      { autoAlpha: 1, x: 0, scale: 1, ease: "back.out(1.8)", duration: 0.4 },
      "step-2",
    );
    progressive.addLabel("step-3");

    progressive.to(
      guessed,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.62 },
      "step-3",
    );
    progressive.addLabel("step-4");
    this.applyProgressiveEntryState(progressive);
  }

  /**
   * Builds slide 3 as a four-click argument: language exposes ambiguity,
   * blockout externalizes constraints, direct manipulation restores agency,
   * and the final requirement states the resulting design implication.
   */
  private setupHumanFoundationsSequence(slide: HTMLElement): void {
    const heading = this.directChild(slide, "h2");
    const language = slide.querySelector<HTMLElement>(
      ".human-foundation.language",
    );
    const blockout = slide.querySelector<HTMLElement>(
      ".human-foundation.blockout",
    );
    const manipulation = slide.querySelector<HTMLElement>(
      ".human-foundation.manipulation",
    );
    const requirement = slide.querySelector<HTMLElement>(
      ".human-foundation-requirement",
    );

    if (!heading || !language || !blockout || !manipulation || !requirement)
      return;

    gsap.set(heading, {
      autoAlpha: 0,
      y: 20,
      rotationX: -4,
      transformOrigin: "0% 50%",
    });
    gsap.set(language, {
      autoAlpha: 0,
      x: -30,
      scale: 0.975,
      transformOrigin: "50% 50%",
    });
    gsap.set(blockout, {
      autoAlpha: 0,
      y: 18,
      scale: 0.975,
      transformOrigin: "50% 50%",
    });
    gsap.set(manipulation, {
      autoAlpha: 0,
      x: 30,
      scale: 0.975,
      transformOrigin: "50% 50%",
    });
    gsap.set(requirement, {
      autoAlpha: 0,
      y: 14,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(4, 0.48);

    progressive.addLabel("step-0", 0);

    progressive.to(
      heading,
      { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.58 },
      "step-0",
    );
    progressive.to(
      language,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.58 },
      "step-0+=0.08",
    );
    progressive.addLabel("step-1");

    progressive.to(
      blockout,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.58 },
      "step-1",
    );
    progressive.addLabel("step-2");

    progressive.to(
      manipulation,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.58 },
      "step-2",
    );
    progressive.addLabel("step-3");

    progressive.to(
      requirement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-3",
    );
    progressive.addLabel("step-4");
    this.applyProgressiveEntryState(progressive);
  }

  /** Restores slide 4 as an eight-click comparison, ending with the open gap. */
  private setupAiLandscapeSequence(slide: HTMLElement): void {
    const capabilities = slide.querySelector<HTMLElement>(
      ".ai-capability-stack",
    );
    const systemsLabel = slide.querySelector<HTMLElement>(
      ".ai-system-routes > .ai-landscape-label",
    );
    const layoutRoute = slide.querySelector<HTMLElement>(
      ".ai-system-route.layout-route",
    );
    const agentRoute = slide.querySelector<HTMLElement>(
      ".ai-system-route.agent-route",
    );
    const layoutHeader = layoutRoute?.querySelector<HTMLElement>("header");
    const layoutDescription = layoutRoute?.querySelector<HTMLElement>(
      ":scope > p",
    );
    const layoutOutput =
      layoutRoute?.querySelector<HTMLElement>(".layout-output");
    const agentHeader = agentRoute?.querySelector<HTMLElement>("header");
    const agentDescription = agentRoute?.querySelector<HTMLElement>("p");
    const agentOutput =
      agentRoute?.querySelector<HTMLElement>(".ai-route-output");
    const gap = slide.querySelector<HTMLElement>(".ai-landscape-gap");

    const required = [
      capabilities,
      systemsLabel,
      layoutRoute,
      layoutHeader,
      layoutDescription,
      layoutOutput,
      agentRoute,
      agentHeader,
      agentDescription,
      agentOutput,
      gap,
    ];
    if (required.some((element) => !element)) return;

    gsap.set(capabilities, {
      autoAlpha: 0,
      x: -30,
      scale: 0.985,
      transformOrigin: "50% 50%",
    });
    gsap.set(systemsLabel, { autoAlpha: 0, y: 8 });
    gsap.set([layoutRoute, agentRoute], {
      autoAlpha: 0,
      x: 18,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(
      [
        layoutHeader,
        layoutDescription,
        layoutOutput,
        agentHeader,
        agentDescription,
      ],
      {
        autoAlpha: 0,
        x: 24,
        y: 4,
      },
    );
    gsap.set(agentOutput as HTMLElement, {
      autoAlpha: 0,
      x: 14,
      scale: 0.94,
      transformOrigin: "50% 50%",
    });
    gsap.set(gap, {
      autoAlpha: 0,
      y: 14,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(8, 0.5);

    progressive.addLabel("step-0", 0);

    progressive.to(
      capabilities,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.62 },
      "step-0",
    );
    progressive.addLabel("step-1");

    progressive.to(
      systemsLabel,
      { autoAlpha: 1, y: 0, duration: 0.34 },
      "step-1",
    );
    progressive.addLabel("step-2");

    progressive.to(
      layoutRoute as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.48 },
      "step-2",
    );
    progressive.to(
      layoutHeader as HTMLElement,
      { autoAlpha: 1, x: 0, y: 0, duration: 0.46 },
      "step-2+=0.04",
    );
    progressive.addLabel("step-3");

    progressive.to(
      layoutDescription as HTMLElement,
      { autoAlpha: 1, x: 0, y: 0, duration: 0.46 },
      "step-3",
    );
    progressive.to(
      layoutOutput as HTMLElement,
      { autoAlpha: 1, x: 0, y: 0, duration: 0.46 },
      "step-3+=0.08",
    );
    progressive.addLabel("step-4");

    progressive.to(
      agentRoute as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.48 },
      "step-4",
    );
    progressive.to(
      agentHeader as HTMLElement,
      { autoAlpha: 1, x: 0, y: 0, duration: 0.46 },
      "step-4+=0.04",
    );
    progressive.addLabel("step-5");

    progressive.to(
      agentDescription as HTMLElement,
      { autoAlpha: 1, x: 0, y: 0, duration: 0.46 },
      "step-5",
    );
    progressive.addLabel("step-6");

    progressive.to(
      agentOutput as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.46 },
      "step-6",
    );
    progressive.addLabel("step-7");

    progressive.to(
      gap,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 },
      "step-7",
    );
    progressive.addLabel("step-8");
    this.applyProgressiveEntryState(progressive);
  }

  private setupResearchQuestionSequence(slide: HTMLElement): void {
    const convergence = slide.querySelector<HTMLElement>(
      ".research-convergence",
    );
    const sources = Array.from(
      slide.querySelectorAll<HTMLElement>(".convergence-source"),
    );
    const thesis = slide.querySelector<HTMLElement>(".thesis-control-layer");
    const arrows = Array.from(
      slide.querySelectorAll<HTMLElement>(".convergence-arrow"),
    );
    const questionBlock = slide.querySelector<HTMLElement>(
      ".research-question-block",
    );
    const rq = slide.querySelector<HTMLElement>(".research-question-header h3");
    const rq1 = slide.querySelector<HTMLElement>(".generationstage");
    const rq2 = slide.querySelector<HTMLElement>(".refinementstage");

    if (
      !convergence ||
      sources.length !== 2 ||
      !thesis ||
      arrows.length !== 2 ||
      !questionBlock ||
      !rq ||
      !rq1 ||
      !rq2
    )
      return;

    const [humanSource, modelSource] = sources as [HTMLElement, HTMLElement];

    gsap.set(convergence, {
      autoAlpha: 0,
      y: 14,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(humanSource, { autoAlpha: 0, x: -24 });
    gsap.set(modelSource, { autoAlpha: 0, x: 24 });
    gsap.set(arrows, {
      autoAlpha: 0,
      scale: 0.82,
      transformOrigin: "50% 50%",
    });
    gsap.set(thesis, { autoAlpha: 0, y: 12, scale: 0.985 });
    gsap.set(questionBlock, {
      autoAlpha: 0,
      y: 14,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(rq, { autoAlpha: 0, y: 10 });
    gsap.set(rq1, { autoAlpha: 0, x: -20 });
    gsap.set(rq2, { autoAlpha: 0, x: 20 });

    const progressive = this.beginProgressiveSequence(5, 0.5);

    progressive.addLabel("step-0", 0);

    progressive.to(
      convergence,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-0",
    );
    progressive.to(
      [humanSource, modelSource],
      { autoAlpha: 1, x: 0, duration: 0.58 },
      "step-0+=0.08",
    );
    progressive.addLabel("step-1");

    progressive.to(
      [arrows, thesis],
      { autoAlpha: 1, scale: 1, duration: 0.34 },
      "step-1",
    );
    progressive.addLabel("step-2");

    progressive.to(
      questionBlock,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 },
      "step-2",
    );
    progressive.to(rq, { autoAlpha: 1, y: 0, duration: 0.4 }, "step-3+=0.08");
    progressive.addLabel("step-3");

    progressive.to(rq1, { autoAlpha: 1, x: 0, duration: 0.46 }, "step-3");
    progressive.addLabel("step-4");

    progressive.to(rq2, { autoAlpha: 1, x: 0, duration: 0.46 }, "step-4");
    progressive.addLabel("step-5");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds the eleven click stops requested for the generation architecture. */
  private setupGenerationArchitectureSequence(slide: HTMLElement): void {
    const unityTier = slide.querySelector<HTMLElement>(".unity-tier");
    const serviceTier = slide.querySelector<HTMLElement>(".service-tier");
    const proxy = slide.querySelector<HTMLElement>(".proxy-cell");
    const textualPrompt = slide.querySelector<HTMLElement>(
      ".textual-prompt-cell",
    );
    const constraints = slide.querySelector<HTMLElement>(".constraints-cell");
    const result = slide.querySelector<HTMLElement>(".result-cell");
    const policy = slide.querySelector<HTMLElement>(".policy-cell");
    const imageGeneration = slide.querySelector<HTMLElement>(
      ".image-generation-cell",
    );
    const extraction = slide.querySelector<HTMLElement>(".extraction-cell");
    const lifting = slide.querySelector<HTMLElement>(".lifting-cell");
    const fit = slide.querySelector<HTMLElement>(".fit-cell");
    const promptFlow = slide.querySelector<HTMLElement>(".prompt-flow");
    const constraintsFlow =
      slide.querySelector<HTMLElement>(".constraints-flow");
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
      upFlow,
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
      fit,
    ] as HTMLElement[];
    const horizontalArrowSources = [
      proxy,
      textualPrompt,
      policy,
      imageGeneration,
      extraction,
      lifting,
    ] as HTMLElement[];
    const transfers = [promptFlow, constraintsFlow, upFlow] as HTMLElement[];

    gsap.set([unityTier, serviceTier], {
      autoAlpha: 0,
      y: 8,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(cards, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(horizontalArrowSources, {
      "--flow-arrow-opacity": 0,
    } as gsap.TweenVars);
    transfers.forEach((transfer) => this.prepareTransferReveal(transfer));

    const progressive = this.beginProgressiveSequence(11, 0.42);

    const revealCard = { autoAlpha: 1, y: 0, scale: 1 };
    const revealTier = { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 };
    const revealArrow = {
      "--flow-arrow-opacity": 1,
      duration: 0.24,
    } as gsap.TweenVars;

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
    this.addTransferReveal(
      progressive,
      promptFlow as HTMLElement,
      "step-5",
      "down",
    );
    progressive.addLabel("step-6");

    progressive.to(imageGeneration as HTMLElement, revealCard, "step-6");
    progressive.to(policy as HTMLElement, revealArrow, "step-6+=0.12");
    this.addTransferReveal(
      progressive,
      constraintsFlow as HTMLElement,
      "step-6",
      "down",
    );
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
    const unityTier = slide.querySelector<HTMLElement>(
      ".refinement-unity-tier",
    );
    const serviceTier = slide.querySelector<HTMLElement>(
      ".refinement-service-tier",
    );
    const select = slide.querySelector<HTMLElement>(".refinement-select-cell");
    const capture = slide.querySelector<HTMLElement>(
      ".refinement-capture-cell",
    );
    const inpaint = slide.querySelector<HTMLElement>(
      ".refinement-inpaint-cell",
    );
    const prepare = slide.querySelector<HTMLElement>(
      ".refinement-prepare-cell",
    );
    const lift = slide.querySelector<HTMLElement>(".refinement-lift-cell");
    const result = slide.querySelector<HTMLElement>(".refinement-result-cell");
    const downFlow = slide.querySelector<HTMLElement>(
      ".refinement-capture-flow",
    );
    const upFlow = slide.querySelector<HTMLElement>(
      ".refinement-replacement-flow",
    );

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
      upFlow,
    ];
    if (required.some((element) => !element)) return;

    const cards = [
      select,
      capture,
      inpaint,
      prepare,
      lift,
      result,
    ] as HTMLElement[];
    const horizontalArrowSources = [select, inpaint, prepare] as HTMLElement[];
    const transfers = [downFlow, upFlow] as HTMLElement[];

    gsap.set([unityTier, serviceTier], {
      autoAlpha: 0,
      y: 8,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(cards, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(horizontalArrowSources, {
      "--flow-arrow-opacity": 0,
    } as gsap.TweenVars);
    transfers.forEach((transfer) => this.prepareTransferReveal(transfer));

    const progressive = this.beginProgressiveSequence(6, 0.42);

    const revealCard = { autoAlpha: 1, y: 0, scale: 1 };
    const revealTier = { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 };
    const revealArrow = {
      "--flow-arrow-opacity": 1,
      duration: 0.24,
    } as gsap.TweenVars;

    progressive.addLabel("step-0", 0);

    progressive.to(unityTier as HTMLElement, revealTier, "step-0");
    progressive.to(select as HTMLElement, revealCard, "step-0+=0.08");
    progressive.addLabel("step-1");

    progressive.to(capture as HTMLElement, revealCard, "step-1");
    progressive.to(select as HTMLElement, revealArrow, "step-1+=0.12");
    progressive.addLabel("step-2");

    progressive.to(serviceTier as HTMLElement, revealTier, "step-2");
    progressive.to(inpaint as HTMLElement, revealCard, "step-2+=0.08");
    this.addTransferReveal(
      progressive,
      downFlow as HTMLElement,
      "step-2+=0.08",
      "down",
    );
    progressive.addLabel("step-3");

    progressive.to(prepare as HTMLElement, revealCard, "step-3");
    progressive.to(inpaint as HTMLElement, revealArrow, "step-3+=0.12");
    progressive.addLabel("step-4");

    progressive.to(lift as HTMLElement, revealCard, "step-4");
    progressive.to(prepare as HTMLElement, revealArrow, "step-4+=0.12");
    progressive.addLabel("step-5");

    progressive.to(result as HTMLElement, revealCard, "step-5");
    this.addTransferReveal(
      progressive,
      upFlow as HTMLElement,
      "step-5+=0.04",
      "up",
    );
    progressive.addLabel("step-6");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds the nine click stops requested for the generation-detail comparison. */
  private setupGenerationDetailSequence(slide: HTMLElement): void {
    const photograph = slide.querySelector<HTMLElement>(".photograph-source");
    const photographOutcome = photograph?.querySelector<HTMLElement>("h3");
    const comparisonArrow = slide.querySelector<HTMLElement>(
      ".source-comparison-mid",
    );
    const lowpoly = slide.querySelector<HTMLElement>(".lowpoly-source");
    const comparisonBut = slide.querySelector<HTMLElement>(
      ".source-comparison-but",
    );
    const tilted = slide.querySelector<HTMLElement>(".tilted-output");
    const recovery = slide.querySelector<HTMLElement>(".orientation-recovery");
    const recoverySteps = Array.from(
      slide.querySelectorAll<HTMLElement>(".recovery-step"),
    );
    const recoveryArrows = Array.from(
      slide.querySelectorAll<HTMLElement>(".recovery-flow > i"),
    );
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
    )
      return;

    const slideRect = slide.getBoundingClientRect();
    const photographRect = photograph.getBoundingClientRect();
    const scaleX =
      slide.offsetWidth > 0 ? slideRect.width / slide.offsetWidth : 1;
    const scaleY =
      slide.offsetHeight > 0 ? slideRect.height / slide.offsetHeight : 1;
    const initialX =
      (slideRect.left +
        slideRect.width / 2 -
        (photographRect.left + photographRect.width / 2)) /
      scaleX;
    const initialY =
      (slideRect.top +
        slideRect.height / 2 -
        (photographRect.top + photographRect.height / 2)) /
      scaleY;
    const promptPolicyHandoff = this.pendingPromptPolicyHandoff;
    this.pendingPromptPolicyHandoff = null;

    if (promptPolicyHandoff && this.allowMotion) {
      const sourceScale = Math.max(
        0.35,
        Math.min(
          promptPolicyHandoff.width / photographRect.width,
          promptPolicyHandoff.height / photographRect.height,
        ),
      );
      const sourceX =
        (promptPolicyHandoff.left +
          promptPolicyHandoff.width / 2 -
          (photographRect.left + photographRect.width / 2)) /
        scaleX;
      const sourceY =
        (promptPolicyHandoff.top +
          promptPolicyHandoff.height / 2 -
          (photographRect.top + photographRect.height / 2)) /
        scaleY;

      gsap.fromTo(
        photograph,
        {
          autoAlpha: 0,
          x: sourceX,
          y: sourceY,
          scale: sourceScale,
          transformOrigin: "50% 50%",
        },
        {
          autoAlpha: 1,
          x: initialX,
          y: initialY,
          scale: 2,
          duration: 0.86,
          delay: 0.08,
          ease: "back.out(1.32)",
          overwrite: "auto",
        },
      );
    } else {
      gsap.set(photograph, {
        autoAlpha: 1,
        x: initialX,
        y: initialY,
        scale: 2,
        transformOrigin: "50% 50%",
      });
    }
    gsap.set(photographOutcome, { autoAlpha: 0, y: 8 });
    gsap.set(comparisonArrow, { autoAlpha: 0, x: -20, scale: 0.82 });
    gsap.set(lowpoly, {
      autoAlpha: 0,
      x: -32,
      scaleX: 0.82,
      transformOrigin: "left center",
    });
    gsap.set(comparisonBut, { autoAlpha: 0, x: -10 });
    gsap.set(tilted, {
      autoAlpha: 0,
      x: -24,
      scale: 0.97,
      transformOrigin: "left center",
    });
    gsap.set(recovery, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(recoverySteps, {
      autoAlpha: 0,
      y: 8,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(recoveryArrows, {
      autoAlpha: 0,
      scaleX: 0,
      transformOrigin: "left center",
    });
    gsap.set(recoveryResult, {
      autoAlpha: 0,
      y: 10,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(9, 0.42);

    const revealStep = { autoAlpha: 1, y: 0, scale: 1, duration: 0.38 };
    const revealArrow = { autoAlpha: 1, scaleX: 1, duration: 0.24 };

    progressive.addLabel("step-0", 0);

    progressive.to(
      photographOutcome as HTMLElement,
      { autoAlpha: 1, y: 0 },
      "step-0",
    );
    progressive.addLabel("step-1");

    progressive.to(
      photograph as HTMLElement,
      { x: 0, y: 0, scale: 1, duration: 1.08, ease: "power3.inOut" },
      "step-1",
    );
    progressive.to(
      comparisonArrow as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.34, ease: "back.out(1.45)" },
      "step-1+=0.46",
    );
    progressive.to(
      lowpoly as HTMLElement,
      { autoAlpha: 1, x: 0, scaleX: 1, duration: 0.5, ease: "power3.out" },
      "step-1+=0.56",
    );
    progressive.addLabel("step-2");

    progressive.to(
      comparisonBut as HTMLElement,
      { autoAlpha: 1, x: 0, duration: 0.28 },
      "step-2",
    );
    progressive.to(
      tilted as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.5 },
      "step-2+=0.08",
    );
    progressive.addLabel("step-3");

    progressive.to(
      recovery as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-3",
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
      "step-8",
    );
    progressive.addLabel("step-9");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds slide 10 as a six-click explanation of the study design. */
  private setupStudyDesignSequence(slide: HTMLElement): void {
    const primary = slide.querySelector<HTMLElement>(".study-primary");
    const conditionComparison = slide.querySelector<HTMLElement>(
      ".condition-comparison",
    );
    const studyMeta = slide.querySelector<HTMLElement>(".study-meta");
    const sameShell = slide.querySelector<HTMLElement>(".same-shell");
    const phaseLine = slide.querySelector<HTMLElement>(".study-phase-line");
    const phases = Array.from(
      slide.querySelectorAll<HTMLElement>(".study-phase"),
    );
    const secondary = slide.querySelector<HTMLElement>(
      ".study-secondary-block",
    );
    const modelComparison = slide.querySelector<HTMLElement>(
      ".study-model-comparison",
    );

    if (
      !primary ||
      !conditionComparison ||
      !studyMeta ||
      !sameShell ||
      !phaseLine ||
      phases.length !== 3 ||
      !secondary ||
      !modelComparison
    )
      return;

    gsap.set(primary, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(conditionComparison, {
      autoAlpha: 0,
      y: 10,
      scale: 0.985,
      transformOrigin: "50% 50%",
    });
    gsap.set(studyMeta, { autoAlpha: 0, x: 14 });
    gsap.set(sameShell, { autoAlpha: 0, y: 7 });
    gsap.set(phaseLine, { autoAlpha: 0, y: 9 });
    gsap.set(phases, {
      autoAlpha: 0,
      y: 10,
      scale: 0.96,
      transformOrigin: "50% 50%",
    });
    gsap.set(secondary, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(modelComparison, { autoAlpha: 0, y: 9 });

    const progressive = this.beginProgressiveSequence(6, 0.48);

    progressive.addLabel("step-0", 0);
    progressive.to(
      primary,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.56 },
      "step-0",
    );
    progressive.to(
      conditionComparison,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5 },
      "step-0+=0.08",
    );
    progressive.addLabel("step-1");

    progressive.to(studyMeta, { autoAlpha: 1, x: 0, duration: 0.4 }, "step-1");
    progressive.addLabel("step-2");

    progressive.to(sameShell, { autoAlpha: 1, y: 0, duration: 0.42 }, "step-2");
    progressive.addLabel("step-3");

    progressive.to(phaseLine, { autoAlpha: 1, y: 0, duration: 0.34 }, "step-3");
    progressive.to(
      phases,
      { autoAlpha: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.42 },
      "step-3+=0.06",
    );
    progressive.addLabel("step-4");

    progressive.to(
      secondary,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 },
      "step-4",
    );
    progressive.addLabel("step-5");

    progressive.to(
      modelComparison,
      { autoAlpha: 1, y: 0, duration: 0.5 },
      "step-5",
    );
    progressive.addLabel("step-6");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds slide 11 as a five-click evaluation-measure hierarchy. */
  private setupMeasurementSequence(slide: HTMLElement): void {
    const phaseBlock = slide.querySelector<HTMLElement>(
      ".measurement-phase-block",
    );
    const sharedMeasures = slide.querySelector<HTMLElement>(
      ".measurement-shared",
    );
    const generation = slide.querySelector<HTMLElement>(
      ".measurement-column.creation",
    );
    const refinement = slide.querySelector<HTMLElement>(
      ".measurement-column.refinement",
    );
    const workflow = slide.querySelector<HTMLElement>(
      ".measurement-workflow-block",
    );

    if (
      !phaseBlock ||
      !sharedMeasures ||
      !generation ||
      !refinement ||
      !workflow
    )
      return;

    gsap.set(phaseBlock, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(sharedMeasures, {
      autoAlpha: 0,
      y: 9,
      scale: 0.985,
      transformOrigin: "50% 50%",
    });
    gsap.set(generation, { autoAlpha: 0, x: -20 });
    gsap.set(refinement, { autoAlpha: 0, x: 20 });
    gsap.set(workflow, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(5, 0.5);

    progressive.addLabel("step-0", 0);
    progressive.to(
      phaseBlock,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.56 },
      "step-0",
    );
    progressive.addLabel("step-1");

    progressive.to(
      sharedMeasures,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.48 },
      "step-1",
    );
    progressive.addLabel("step-2");

    progressive.to(
      generation,
      { autoAlpha: 1, x: 0, duration: 0.48 },
      "step-2",
    );
    progressive.addLabel("step-3");

    progressive.to(
      refinement,
      { autoAlpha: 1, x: 0, duration: 0.48 },
      "step-3",
    );
    progressive.addLabel("step-4");

    progressive.to(
      workflow,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.56 },
      "step-4",
    );
    progressive.addLabel("step-5");
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds slide 12 as a twelve-click status walkthrough. */
  private setupRoadmapSequence(slide: HTMLElement): void {
    const roadmap = slide.querySelector<HTMLElement>(".study-roadmap");
    const rail = slide.querySelector<HTMLElement>(".roadmap-rail");
    const completeLabel = slide.querySelector<HTMLElement>(
      ".roadmap-phase-labels .complete",
    );
    const currentLabel = slide.querySelector<HTMLElement>(
      ".roadmap-phase-labels .current",
    );
    const upcomingLabel = slide.querySelector<HTMLElement>(
      ".roadmap-phase-labels .upcoming",
    );
    const completed = Array.from(
      slide.querySelectorAll<HTMLElement>(".roadmap-milestone.done"),
    );
    const active = slide.querySelector<HTMLElement>(
      ".roadmap-milestone.active",
    );
    const upcoming = Array.from(
      slide.querySelectorAll<HTMLElement>(".roadmap-milestone.upcoming"),
    );
    const focus = slide.querySelector<HTMLElement>(".roadmap-focus");

    if (
      !roadmap ||
      !rail ||
      !completeLabel ||
      !currentLabel ||
      !upcomingLabel ||
      completed.length !== 5 ||
      !active ||
      upcoming.length !== 3 ||
      !focus
    )
      return;

    const totalSegments = completed.length + upcoming.length;

    gsap.set(roadmap, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set(rail, {
      "--roadmap-line-mask": "100%",
    } as gsap.TweenVars);
    gsap.set([completeLabel, currentLabel, upcomingLabel], {
      autoAlpha: 0,
      y: -7,
    });
    gsap.set([...completed, active, ...upcoming], {
      autoAlpha: 0,
      y: 11,
      scale: 0.94,
      transformOrigin: "50% 30%",
    });
    gsap.set(focus, {
      autoAlpha: 0,
      y: 12,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(
      10 + upcoming.length,
      0.44,
    );

    progressive.addLabel("step-0", 0);
    progressive.to(
      roadmap,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.54 },
      "step-0",
    );
    progressive.to(
      completeLabel,
      { autoAlpha: 1, y: 0, duration: 0.34 },
      "step-0+=0.1",
    );
    progressive.addLabel("step-1");

    completed.forEach((milestone, index) => {
      const lineProgress = index / totalSegments;
      progressive.to(
        milestone,
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          ease: "back.out(1.45)",
          duration: 0.42,
        },
        `step-${index + 1}`,
      );
      progressive.to(
        rail,
        {
          "--roadmap-line-mask": `${(1 - lineProgress) * 100}%`,
          duration: 0.38,
          ease: "power2.inOut",
        } as gsap.TweenVars,
        `step-${index + 1}`,
      );
      progressive.addLabel(`step-${index + 2}`);
    });

    progressive.to(
      currentLabel,
      { autoAlpha: 1, y: 0, duration: 0.34 },
      "step-6",
    );
    progressive.addLabel("step-7");

    progressive.to(
      active,
      { autoAlpha: 1, y: 0, scale: 1, ease: "back.out(1.55)", duration: 0.46 },
      "step-7",
    );
    progressive.to(
      rail,
      {
        "--roadmap-line-mask": `${(upcoming.length / totalSegments) * 100}%`,
        duration: 0.4,
        ease: "power2.inOut",
      } as gsap.TweenVars,
      "step-7",
    );
    progressive.addLabel("step-8");

    progressive.to(
      upcomingLabel,
      { autoAlpha: 1, y: 0, duration: 0.34 },
      "step-8",
    );
    progressive.addLabel("step-9");

    upcoming.forEach((milestone, index) => {
      const step = 9 + index;
      const remainingSegments = upcoming.length - index - 1;
      progressive.to(
        milestone,
        { autoAlpha: 1, y: 0, scale: 1 },
        `step-${step}`,
      );
      progressive.to(
        rail,
        {
          "--roadmap-line-mask": `${(remainingSegments / totalSegments) * 100}%`,
          duration: 0.4,
          ease: "power2.inOut",
        } as gsap.TweenVars,
        `step-${step}`,
      );
      progressive.addLabel(`step-${step + 1}`);
    });

    const focusStep = 9 + upcoming.length;

    progressive.to(
      focus,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 },
      `step-${focusStep}`,
    );
    progressive.addLabel(`step-${focusStep + 1}`);
    this.applyProgressiveEntryState(progressive);
  }

  /** Builds slide 13 as a ten-click benefit-to-feasibility argument. */
  private setupThreeJsOptionSequence(slide: HTMLElement): void {
    const kicker = slide.querySelector<HTMLElement>(".threejs-kicker");
    const benefitPanel = slide.querySelector<HTMLElement>(
      ".threejs-panel.benefit",
    );
    const benefitHeader = benefitPanel?.querySelector<HTMLElement>(
      ".threejs-panel-heading",
    );
    const benefitGrid = benefitPanel?.querySelector<HTMLElement>(
      ".threejs-benefit-grid",
    );
    const componentTree = benefitPanel?.querySelector<HTMLElement>(
      ".threejs-component-tree",
    );
    const takeaway = benefitPanel?.querySelector<HTMLElement>(
      ".threejs-panel-takeaway",
    );
    const feasibilityPanel = slide.querySelector<HTMLElement>(
      ".threejs-panel.feasibility",
    );
    const feasibilityHeader = feasibilityPanel?.querySelector<HTMLElement>(
      ".threejs-panel-heading",
    );
    const flowRow =
      feasibilityPanel?.querySelector<HTMLElement>(".threejs-flow-row");
    const qualityGate = feasibilityPanel?.querySelector<HTMLElement>(
      ".threejs-quality-gate",
    );
    const exportRow = feasibilityPanel?.querySelector<HTMLElement>(
      ".threejs-export-row",
    );
    const checks = Array.from(
      feasibilityPanel?.querySelectorAll<HTMLElement>(
        ".threejs-feasibility-checks > span",
      ) ?? [],
    );

    const required = [
      kicker,
      benefitPanel,
      benefitHeader,
      benefitGrid,
      componentTree,
      takeaway,
      feasibilityPanel,
      feasibilityHeader,
      flowRow,
      qualityGate,
      exportRow,
      ...checks,
    ];
    if (checks.length !== 3 || required.some((element) => !element)) return;

    gsap.set(kicker, { autoAlpha: 0, y: 8 });
    gsap.set(benefitPanel, {
      autoAlpha: 0,
      x: -18,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set([benefitHeader, benefitGrid], { autoAlpha: 0, y: 9 });
    gsap.set(componentTree as HTMLElement, {
      autoAlpha: 0,
      y: 9,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(takeaway as HTMLElement, {
      autoAlpha: 0,
      y: 9,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(feasibilityPanel, {
      autoAlpha: 0,
      x: 18,
      scale: 0.99,
      transformOrigin: "50% 50%",
    });
    gsap.set([feasibilityHeader, flowRow], { autoAlpha: 0, y: 9 });
    gsap.set([qualityGate, exportRow], {
      autoAlpha: 0,
      y: 9,
      scale: 0.98,
      transformOrigin: "50% 50%",
    });
    gsap.set(checks, {
      autoAlpha: 0,
      y: 8,
      scale: 0.96,
      transformOrigin: "50% 50%",
    });

    const progressive = this.beginProgressiveSequence(10, 0.46);

    progressive.addLabel("step-0", 0);
    progressive.to(
      kicker as HTMLElement,
      { autoAlpha: 1, y: 0, duration: 0.42 },
      "step-0",
    );
    progressive.addLabel("step-1");

    progressive.to(
      benefitPanel as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.54 },
      "step-1",
    );
    progressive.to(
      [benefitHeader, benefitGrid] as HTMLElement[],
      { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.42 },
      "step-1+=0.06",
    );
    progressive.addLabel("step-2");

    progressive.to(
      componentTree as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 },
      "step-2",
    );
    progressive.addLabel("step-3");

    progressive.to(
      takeaway as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 },
      "step-3",
    );
    progressive.addLabel("step-4");

    progressive.to(
      feasibilityPanel as HTMLElement,
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.54 },
      "step-4",
    );
    progressive.to(
      [feasibilityHeader, flowRow] as HTMLElement[],
      { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.42 },
      "step-4+=0.06",
    );
    progressive.addLabel("step-5");

    progressive.to(
      qualityGate as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 },
      "step-5",
    );
    progressive.addLabel("step-6");

    progressive.to(
      exportRow as HTMLElement,
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 },
      "step-6",
    );
    progressive.addLabel("step-7");

    checks.forEach((check, index) => {
      progressive.to(
        check,
        { autoAlpha: 1, y: 0, scale: 1, ease: "back.out(1.4)", duration: 0.42 },
        `step-${index + 7}`,
      );
      progressive.addLabel(`step-${index + 8}`);
    });

    this.applyProgressiveEntryState(progressive);
  }

  private beginProgressiveSequence(
    stepCount: number,
    duration: number,
  ): gsap.core.Timeline {
    const timeline = gsap.timeline({
      paused: true,
      defaults: { duration, ease: "power3.out" },
    });
    this.activeProgressiveTimeline = timeline;
    this.progressiveStep = 0;
    this.progressiveStepCount = stepCount;
    return timeline;
  }

  private applyProgressiveEntryState(timeline: gsap.core.Timeline): void {
    if (!this.progressiveStartsComplete) return;

    timeline.seek(`step-${this.progressiveStepCount}`, false);
    this.progressiveStep = this.progressiveStepCount;
  }

  private prepareTransferReveal(transfer: HTMLElement): void {
    const line = transfer.querySelector<HTMLElement>("i");
    const label = transfer.querySelector<HTMLElement>("span");
    const preserveLabelTransform =
      transfer.closest(
        ".generation-architecture-slide, .refinement-architecture-slide",
      ) !== null;
    gsap.set(transfer, { autoAlpha: 0 });
    if (line) gsap.set(line, { scaleY: 0 });
    if (label) {
      gsap.set(
        label,
        preserveLabelTransform ? { autoAlpha: 0 } : { autoAlpha: 0, y: 3 },
      );
    }
  }

  private addTransferReveal(
    timeline: gsap.core.Timeline,
    transfer: HTMLElement,
    position: string,
    direction: "down" | "up",
  ): void {
    const line = transfer.querySelector<HTMLElement>("i");
    const label = transfer.querySelector<HTMLElement>("span");
    const preserveLabelTransform =
      transfer.closest(
        ".generation-architecture-slide, .refinement-architecture-slide",
      ) !== null;

    timeline.set(transfer, { autoAlpha: 1 }, position);
    if (line) {
      timeline.to(
        line,
        {
          scaleY: 1,
          duration: 0.38,
          ease: "power2.inOut",
          transformOrigin: direction === "up" ? "center bottom" : "center top",
        },
        position,
      );
    }
    if (label) {
      timeline.to(
        label,
        preserveLabelTransform
          ? { autoAlpha: 1, duration: 0.26 }
          : { autoAlpha: 1, y: 0, duration: 0.26 },
        `${position}+=0.08`,
      );
    }
  }

  private addGenericContent(
    timeline: gsap.core.Timeline,
    slide: HTMLElement,
    handled: Set<Element>,
  ): void {
    const targets = Array.from(
      slide.querySelectorAll<HTMLElement>(
        "[data-motion]:not([data-motion='none'])",
      ),
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
          clearProps: "transform,opacity,visibility",
        },
        `content+=${(order * 0.055).toFixed(3)}`,
      );
    });
  }

  private bindPromptPolicyInteraction(slide: HTMLElement): void {
    const policy = slide.querySelector<HTMLElement>(".policy-cell");
    if (!policy) return;

    const originalTransform = policy.style.getPropertyValue("transform");
    const originalTransformPriority =
      policy.style.getPropertyPriority("transform");
    const restoreTransform = (): void => {
      if (originalTransform) {
        policy.style.setProperty(
          "transform",
          originalTransform,
          originalTransformPriority,
        );
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
        onComplete: hovered ? undefined : restoreTransform,
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
        overwrite: "auto",
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

  private directChild(
    slide: HTMLElement,
    selector: string,
  ): HTMLElement | null {
    return (
      Array.from(slide.children).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches(selector),
      ) || null
    );
  }
}
