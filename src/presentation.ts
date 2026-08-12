type MotionType = "fade-up" | "fade-left" | "fade-right" | "scale" | "draw" | "none";

interface ShowSlideOptions {
  updateHash?: boolean;
}

interface SlideLifecycleDetail {
  index: number;
  slide: HTMLElement;
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

  private currentIndex = -1;
  private touchStartX: number | null = null;
  private wheelLocked = false;

  constructor() {
    this.stage = this.requireElement("deckStage");
    this.progress = this.requireElement("deckProgress");
    this.slides = Array.from(document.querySelectorAll<HTMLElement>(".slide"));

    this.prepareSlides();
    this.bindNavigation();
    this.fitStage();
    this.showSlide(this.readHash());
  }

  /** Add numbering, accessibility labels, and default motion metadata. */
  private prepareSlides(): void {
    const total = String(this.slides.length).padStart(2, "0");

    this.slides.forEach((slide, slideIndex) => {
      const heading = slide.querySelector<HTMLElement>("h1, h2");
      const label = heading?.textContent?.trim() || `Slide ${slideIndex + 1}`;

      slide.dataset.slideIndex = String(slideIndex);
      slide.dataset.slideNumber = `${String(slideIndex + 1).padStart(2, "0")} / ${total}`;
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", `${slideIndex + 1} of ${this.slides.length}: ${label}`);

      this.prepareDefaultMotion(slide);
    });
  }

  /**
   * Top-level elements receive a subtle fade-up by default. Authors can override
   * a target with data-motion or stagger a container with data-motion-group.
   */
  private prepareDefaultMotion(slide: HTMLElement): void {
    this.elementChildren(slide).forEach((element, order) => {
      if (element.hasAttribute("data-motion-group")) {
        element.dataset.motion = "none" satisfies MotionType;
        this.prepareMotionGroup(element);
        return;
      }

      if (!element.hasAttribute("data-motion")) {
        element.dataset.motion = "fade-up" satisfies MotionType;
      }
      this.setMotionOrder(element, order);
    });

    slide.querySelectorAll<HTMLElement>("[data-motion-group]").forEach((group) => {
      this.prepareMotionGroup(group);
    });
  }

  private prepareMotionGroup(group: HTMLElement): void {
    const motionType = (group.dataset.motionGroup || "fade-up") as MotionType;

    this.elementChildren(group).forEach((element, order) => {
      if (!element.hasAttribute("data-motion")) {
        element.dataset.motion = motionType;
      }
      this.setMotionOrder(element, order);
    });
  }

  private setMotionOrder(element: HTMLElement, fallbackOrder: number): void {
    const order = element.dataset.motionOrder || String(fallbackOrder);
    element.style.setProperty("--motion-order", order);
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
    document.addEventListener("wheel", (event) => this.handleWheel(event), { passive: true });
    document.addEventListener("touchstart", (event) => this.handleTouchStart(event), { passive: true });
    document.addEventListener("touchend", (event) => this.handleTouchEnd(event), { passive: true });
  }

  private showSlide(index: number, { updateHash = true }: ShowSlideOptions = {}): void {
    const nextIndex = this.clamp(index, 0, this.slides.length - 1);
    const previousIndex = this.currentIndex;

    this.slides.forEach((slide, slideIndex) => {
      const isCurrent = slideIndex === nextIndex;
      slide.classList.toggle("active", isCurrent);
      slide.classList.toggle("visible", isCurrent);
      slide.setAttribute("aria-hidden", String(!isCurrent));
    });

    if (previousIndex >= 0 && previousIndex !== nextIndex) {
      this.emitSlideEvent(this.slides[previousIndex], "slide:leave", previousIndex);
    }

    this.currentIndex = nextIndex;
    this.updateProgress();

    if (updateHash) {
      history.replaceState(null, "", `#${nextIndex + 1}`);
    }

    this.emitSlideEvent(this.slides[nextIndex], "slide:enter", nextIndex);

    const detail: DeckChangeDetail = {
      index: nextIndex,
      previousIndex,
      slide: this.slides[nextIndex]
    };
    document.dispatchEvent(new CustomEvent<DeckChangeDetail>("deck:change", { detail }));
  }

  private emitSlideEvent(slide: HTMLElement, name: "slide:enter" | "slide:leave", index: number): void {
    const detail: SlideLifecycleDetail = { index, slide };
    slide.dispatchEvent(new CustomEvent<SlideLifecycleDetail>(name, { bubbles: true, detail }));
  }

  private updateProgress(): void {
    const denominator = Math.max(1, this.slides.length - 1);
    this.progress.style.width = `${(this.currentIndex / denominator) * 100}%`;
  }

  private fitStage(): void {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const offsetX = (window.innerWidth - 1920 * scale) / 2;
    const offsetY = (window.innerHeight - 1080 * scale) / 2;

    this.stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const nextKeys = ["ArrowRight", "PageDown", " "];
    const previousKeys = ["ArrowLeft", "PageUp"];

    if (nextKeys.includes(event.key)) {
      event.preventDefault();
      this.showSlide(this.currentIndex + 1);
    } else if (previousKeys.includes(event.key)) {
      event.preventDefault();
      this.showSlide(this.currentIndex - 1);
    } else if (event.key === "Home") {
      this.showSlide(0);
    } else if (event.key === "End") {
      this.showSlide(this.slides.length - 1);
    } else if (event.key.toLowerCase() === "f") {
      this.toggleFullscreen();
    }
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const interactiveTarget = target?.closest(
      "a, button, input, textarea, select, [contenteditable='true']"
    );
    if (interactiveTarget) return;

    const direction = event.clientX < window.innerWidth * 0.25 ? -1 : 1;
    this.showSlide(this.currentIndex + direction);
  }

  private handleWheel(event: WheelEvent): void {
    if (this.wheelLocked || Math.abs(event.deltaY) < 18) return;

    this.wheelLocked = true;
    this.showSlide(this.currentIndex + (event.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => { this.wheelLocked = false; }, 420);
  }

  private handleTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].clientX;
  }

  private handleTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null) return;

    const distance = event.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(distance) > 45) {
      this.showSlide(this.currentIndex + (distance < 0 ? 1 : -1));
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

  private elementChildren(element: HTMLElement): HTMLElement[] {
    return Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
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

new SlidePresentation();

