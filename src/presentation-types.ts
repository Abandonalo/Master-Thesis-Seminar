export type AnimationType =
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "rise-in"
  | "zoom-pop"
  | "blur-in"
  | "none";

export interface SlideLifecycleDetail {
  index: number;
  slide: HTMLElement;
  direction: -1 | 0 | 1;
}
