import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  Renderer2,
} from '@angular/core';

/**
 * Completes the native tooltip of action buttons that do not declare a more
 * specific title. Explicit titles always win.
 */
@Directive({
  selector: 'button',
  standalone: true,
})
export class ActionTooltipDirective implements AfterViewInit, OnDestroy {
  private generatedTitle = false;
  private observer?: MutationObserver;

  constructor(
    private readonly elementRef: ElementRef<HTMLButtonElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngAfterViewInit(): void {
    const button = this.elementRef.nativeElement;
    if (!button.hasAttribute('title')) {
      this.generatedTitle = true;
      this.updateTitle();
      this.observer = new MutationObserver(() => this.updateTitle());
      this.observer.observe(button, {
        attributes: true,
        attributeFilter: ['aria-label'],
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private updateTitle(): void {
    if (!this.generatedTitle) return;

    const button = this.elementRef.nativeElement;
    const accessibleLabel = button.getAttribute('aria-label')?.trim();
    const visibleLabel = (button.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[^\p{L}\p{N}]+/u, '');
    const tooltip = accessibleLabel || visibleLabel;

    if (tooltip) {
      this.renderer.setAttribute(button, 'title', tooltip);
    }
  }
}
