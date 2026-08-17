import { gsap } from "gsap";

type MotionType = "fade-up" | "fade-left" | "fade-right" | "scale" | "draw" | "none";

interface SlideLifecycleDetail {
  index: number;
  slide: HTMLElement;
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
  private hoverCleanups: Array<() => void> = [];
  private inlineStyleCleanups: Array<() => void> = [];
  private allowMotion = true;
  private allowHover = false;

  private readonly handleSlideEnter = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide) return;

    this.activeSlide = detail.slide;
    this.play(detail.slide);
  };

  private readonly handleSlideLeave = (event: Event): void => {
    const detail = (event as CustomEvent<SlideLifecycleDetail>).detail;
    if (!detail?.slide || detail.slide !== this.activeSlide) return;

    this.teardownActiveMotion();
    this.activeSlide = null;
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

  private play(slide: HTMLElement): void {
    this.teardownActiveMotion();
    if (!this.allowMotion) return;

    this.activeContext = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { duration: 0.56, ease: "power3.out" }
      });

      this.activeTimeline = timeline;
      this.buildEntranceTimeline(timeline, slide);
      if (this.allowHover) this.bindCardHover(slide);
    }, slide);
  }

  private buildEntranceTimeline(timeline: gsap.core.Timeline, slide: HTMLElement): void {
    const handled = new Set<Element>();

    if (slide.classList.contains("title")) {
      this.addTitleSequence(timeline, slide, handled);
    } else {
      this.addSlideChrome(timeline, slide, handled);
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
      (card) => !card.classList.contains("related-work-card") && !card.closest(".spatial-story")
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

  private teardownActiveMotion(): void {
    this.hoverCleanups.splice(0).forEach((cleanup) => cleanup());
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
