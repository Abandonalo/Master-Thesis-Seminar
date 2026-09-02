import { MarketSceneComparison } from "./market-scenes";
import { LocalMeshSurgeryScene } from "./local-mesh-surgery-scene";
import { SlideMotionController } from "./slide-motion";
import type { AnimationType, SlideLifecycleDetail } from "./presentation-types";

interface ShowSlideOptions {
  updateHash?: boolean;
}

interface DeckChangeDetail extends SlideLifecycleDetail {
  previousIndex: number;
}

/**
 * Controls slide preparation, viewport scaling, navigation, and lifecycle events.
 * Slide content and visual motion remain declarative in the HTML and CSS.
 */
class SlidePresentation {
  private readonly stage: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly slides: HTMLElement[];
  private readonly mainSlides: HTMLElement[];
  private readonly appendixSlides: HTMLElement[];
  private readonly closingIndex: number;

  private currentIndex = -1;
  private touchStartX: number | null = null;
  private wheelLocked = false;

  constructor() {
    this.stage = this.requireElement("deckStage");
    this.progress = this.requireElement("deckProgress");
    this.moveAppendixAfterClosing();
    this.slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
    this.mainSlides = this.slides.filter(
      (slide) => !slide.hasAttribute("data-appendix"),
    );
    this.appendixSlides = this.slides.filter((slide) =>
      slide.hasAttribute("data-appendix"),
    );
    const closingSlide = this.mainSlides[this.mainSlides.length - 1];
    if (!closingSlide) throw new Error("The main deck has no closing slide.");
    this.closingIndex = this.slides.indexOf(closingSlide);

    this.prepareSlides();
    this.bindNavigation();
    this.fitStage();
    this.showSlide(this.readHash());
  }

  /** Add numbering, accessibility labels, and default motion metadata. */
  private prepareSlides(): void {
    const titleSlide = this.mainSlides[0];
    const numberedSlides = this.mainSlides.filter((slide) => slide !== titleSlide);
    const total = String(numberedSlides.length).padStart(2, "0");
    let numberedIndex = 0;

    this.slides.forEach((slide, slideIndex) => {
      const heading = slide.querySelector<HTMLElement>("h1, h2, .eyebrow");
      const label = heading?.textContent?.trim() || `Slide ${slideIndex + 1}`;
      const appendixIndex = this.appendixSlides.indexOf(slide);
      const mainIndex = this.mainSlides.indexOf(slide);

      slide.dataset.slideIndex = String(slideIndex);
      if (appendixIndex >= 0) {
        slide.dataset.slideNumber = `A${appendixIndex + 1} / A${this.appendixSlides.length}`;
      } else if (slide === titleSlide) {
        slide.dataset.slideNumber = "";
      } else {
        numberedIndex += 1;
        slide.dataset.slideNumber = `${String(numberedIndex).padStart(2, "0")} / ${total}`;
      }
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute(
        "aria-label",
        appendixIndex >= 0
          ? `Appendix ${appendixIndex + 1} of ${this.appendixSlides.length}: ${label}`
          : `${mainIndex + 1} of ${this.mainSlides.length}: ${label}`,
      );

      this.prepareDefaultAnimations(slide);
    });
  }

  /**
   * Top-level elements receive a subtle CSS entrance by default. Authors can
   * override a target with data-anim or stagger a container with data-anim-group.
   */
  private prepareDefaultAnimations(slide: HTMLElement): void {
    this.elementChildren(slide).forEach((element, order) => {
      if (element.hasAttribute("data-anim-group")) {
        if (!element.hasAttribute("data-anim")) {
          element.dataset.anim = "none" satisfies AnimationType;
        }
        this.prepareAnimationGroup(element);
        return;
      }

      if (!element.hasAttribute("data-anim")) {
        element.dataset.anim = "fade-up" satisfies AnimationType;
      }
      this.setAnimationOrder(element, order);
    });

    slide
      .querySelectorAll<HTMLElement>("[data-anim-group]")
      .forEach((group) => {
        this.prepareAnimationGroup(group);
      });
  }

  private prepareAnimationGroup(group: HTMLElement): void {
    const animationType = (group.dataset.animGroup ||
      "fade-up") as AnimationType;

    this.elementChildren(group).forEach((element, order) => {
      if (!element.hasAttribute("data-anim")) {
        element.dataset.anim = animationType;
      }
      this.setAnimationOrder(element, order);
    });
  }

  private setAnimationOrder(element: HTMLElement, fallbackOrder: number): void {
    const order = element.dataset.animOrder || String(fallbackOrder);
    element.dataset.animOrder = order;
    element.style.setProperty("--anim-order", order);
  }

  private bindNavigation(): void {
    window.addEventListener("resize", () => this.fitStage());
    window.addEventListener("hashchange", () => {
      const requestedIndex = this.readHash();
      if (requestedIndex !== this.currentIndex) {
        this.showSlide(requestedIndex, { updateHash: false });
      }
    });

    document.addEventListener("keydown", (event) => this.handleKeydown(event));
    document.addEventListener("click", (event) => this.handleClick(event));
    document.addEventListener("wheel", (event) => this.handleWheel(event), {
      passive: true,
    });
    document.addEventListener(
      "touchstart",
      (event) => this.handleTouchStart(event),
      { passive: true },
    );
    document.addEventListener(
      "touchend",
      (event) => this.handleTouchEnd(event),
      { passive: true },
    );
  }

  private showSlide(
    index: number,
    { updateHash = true }: ShowSlideOptions = {},
  ): void {
    const nextIndex = this.clamp(index, 0, this.slides.length - 1);
    const previousIndex = this.currentIndex;
    const direction =
      previousIndex < 0 || previousIndex === nextIndex
        ? 0
        : nextIndex > previousIndex
          ? 1
          : -1;

    this.slides.forEach((slide, slideIndex) => {
      const isCurrent = slideIndex === nextIndex;
      slide.classList.toggle("active", isCurrent);
      slide.classList.toggle("is-active", isCurrent);
      slide.classList.toggle("visible", isCurrent);
      slide.setAttribute("aria-hidden", String(!isCurrent));
    });

    if (previousIndex >= 0 && previousIndex !== nextIndex) {
      this.emitSlideEvent(
        this.slides[previousIndex],
        "slide:leave",
        previousIndex,
        direction,
      );
    }

    this.currentIndex = nextIndex;
    this.updateProgress();

    if (updateHash) {
      history.replaceState(null, "", `#${nextIndex + 1}`);
    }

    this.emitSlideEvent(
      this.slides[nextIndex],
      "slide:enter",
      nextIndex,
      direction,
    );

    const detail: DeckChangeDetail = {
      index: nextIndex,
      previousIndex,
      direction,
      slide: this.slides[nextIndex],
    };
    document.dispatchEvent(
      new CustomEvent<DeckChangeDetail>("deck:change", { detail }),
    );
  }

  private emitSlideEvent(
    slide: HTMLElement,
    name: "slide:enter" | "slide:leave",
    index: number,
    direction: -1 | 0 | 1,
  ): void {
    const detail: SlideLifecycleDetail = { index, slide, direction };
    slide.dispatchEvent(
      new CustomEvent<SlideLifecycleDetail>(name, { bubbles: true, detail }),
    );
  }

  private updateProgress(): void {
    const activeSlide = this.slides[this.currentIndex];
    if (activeSlide?.hasAttribute("data-appendix")) {
      this.progress.style.width = "100%";
      return;
    }

    const mainIndex = this.mainSlides.indexOf(activeSlide);
    const denominator = Math.max(1, this.mainSlides.length - 1);
    this.progress.style.width = `${(Math.max(0, mainIndex) / denominator) * 100}%`;
  }

  private fitStage(): void {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const offsetX = (window.innerWidth - 1920 * scale) / 2;
    const offsetY = (window.innerHeight - 1080 * scale) / 2;

    this.stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (this.isInteractiveTarget(target)) return;

    const nextKeys = ["ArrowRight", "PageDown", " "];
    const previousKeys = ["ArrowLeft", "PageUp"];

    if (nextKeys.includes(event.key)) {
      event.preventDefault();
      if (slideMotionController?.advanceActiveSequence()) return;
      this.navigateRelative(1);
    } else if (previousKeys.includes(event.key)) {
      event.preventDefault();
      this.navigateRelative(-1);
    } else if (event.key === "Home") {
      this.showCollectionBoundary("start");
    } else if (event.key === "End") {
      this.showCollectionBoundary("end");
    } else if (event.key.toLowerCase() === "a") {
      event.preventDefault();
      this.toggleAppendix();
    } else if (
      event.key === "Escape" &&
      this.slides[this.currentIndex]?.hasAttribute("data-appendix")
    ) {
      event.preventDefault();
      this.showSlide(this.closingIndex);
    } else if (event.key.toLowerCase() === "f") {
      this.toggleFullscreen();
    }
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (this.isInteractiveTarget(target)) return;

    const rawDirection = event.clientX < window.innerWidth * 0.25 ? -1 : 1;
    const isPromptPolicyClick = Boolean(
      target?.closest(".generation-architecture-slide .policy-cell"),
    );
    if (
      (rawDirection > 0 || isPromptPolicyClick) &&
      slideMotionController?.advanceActiveSequence()
    )
      return;

    this.navigateRelative(rawDirection);
  }

  private handleWheel(event: WheelEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (this.isInteractiveTarget(target)) return;
    if (this.wheelLocked || Math.abs(event.deltaY) < 18) return;
    if (event.deltaY > 0 && slideMotionController?.advanceActiveSequence())
      return;

    this.wheelLocked = true;
    this.navigateRelative(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => {
      this.wheelLocked = false;
    }, 420);
  }

  private handleTouchStart(event: TouchEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (this.isInteractiveTarget(target)) {
      this.touchStartX = null;
      return;
    }
    this.touchStartX = event.changedTouches[0].clientX;
  }

  private handleTouchEnd(event: TouchEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (this.isInteractiveTarget(target)) {
      this.touchStartX = null;
      return;
    }
    if (this.touchStartX === null) return;

    const distance = event.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(distance) > 45) {
      if (distance < 0 && slideMotionController?.advanceActiveSequence()) {
        this.touchStartX = null;
        return;
      }
      this.navigateRelative(distance < 0 ? 1 : -1);
    }
    this.touchStartX = null;
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }

  private readHash(): number {
    const requestedSlide = Number.parseInt(window.location.hash.slice(1), 10);
    return Number.isNaN(requestedSlide) ? 0 : requestedSlide - 1;
  }

  /** Keep appendix source blocks maintainable while presenting them after the closing slide. */
  private moveAppendixAfterClosing(): void {
    const slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));
    const closing = slides.find((slide) =>
      slide.classList.contains("closing-slide"),
    );
    const parent = closing?.parentElement;
    if (!closing || !parent) return;

    slides
      .filter((slide) => slide.hasAttribute("data-appendix"))
      .forEach((slide) => parent.append(slide));
  }

  private navigateRelative(direction: -1 | 1): void {
    const activeSlide = this.slides[this.currentIndex];
    const collection = activeSlide?.hasAttribute("data-appendix")
      ? this.appendixSlides
      : this.mainSlides;
    const position = collection.indexOf(activeSlide);
    const nextPosition = this.clamp(position + direction, 0, collection.length - 1);
    const nextSlide = collection[nextPosition];
    if (nextSlide) this.showSlide(this.slides.indexOf(nextSlide));
  }

  private showCollectionBoundary(boundary: "start" | "end"): void {
    const activeSlide = this.slides[this.currentIndex];
    const collection = activeSlide?.hasAttribute("data-appendix")
      ? this.appendixSlides
      : this.mainSlides;
    const nextSlide =
      boundary === "start" ? collection[0] : collection[collection.length - 1];
    if (nextSlide) this.showSlide(this.slides.indexOf(nextSlide));
  }

  private toggleAppendix(): void {
    const activeSlide = this.slides[this.currentIndex];
    if (activeSlide?.hasAttribute("data-appendix")) {
      this.showSlide(this.closingIndex);
      return;
    }

    const firstAppendix = this.appendixSlides[0];
    if (firstAppendix) this.showSlide(this.slides.indexOf(firstAppendix));
  }

  private elementChildren(element: HTMLElement): HTMLElement[] {
    return Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  }

  private isInteractiveTarget(target: Element | null): boolean {
    return Boolean(
      target?.closest(
        "a, button, input, textarea, select, [contenteditable='true'], [data-market-scene-viewport], [data-local-surgery-viewport]",
      ),
    );
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Required deck element #${id} was not found.`);
    }
    return element as T;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(value, maximum));
  }
}

const slideMotionController = SlideMotionController.mount();
slideMotionController?.initialize();

const marketSceneComparison = MarketSceneComparison.mount();
marketSceneComparison?.initialize();

const localMeshSurgeryScene = LocalMeshSurgeryScene.mount();
localMeshSurgeryScene?.initialize();
new SlidePresentation();
