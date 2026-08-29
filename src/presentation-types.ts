export type MotionType =
  | "fade-up"
  | "fade-left"
  | "fade-right"
  | "scale"
  | "draw"
  | "none";

export interface SlideLifecycleDetail {
  index: number;
  slide: HTMLElement;
  direction: -1 | 0 | 1;
}
