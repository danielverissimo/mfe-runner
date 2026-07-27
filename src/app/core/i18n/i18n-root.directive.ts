import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  effect,
  inject,
} from '@angular/core';
import { I18nService } from './i18n.service';

interface TranslationState {
  source: string;
  rendered: string;
}

const TRANSLATED_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt'];

@Directive({
  selector: '[appI18nRoot]',
  standalone: true,
})
export class I18nRootDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly i18n = inject(I18nService);
  private readonly textStates = new WeakMap<Text, TranslationState>();
  private readonly attributeStates =
    new WeakMap<Element, Map<string, TranslationState>>();
  private observer?: MutationObserver;
  private initialized = false;

  constructor() {
    effect(() => {
      this.i18n.language();
      if (this.initialized) this.translateTree(this.element.nativeElement);
    });
  }

  ngAfterViewInit(): void {
    this.initialized = true;
    this.translateTree(this.element.nativeElement);
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          this.translateText(mutation.target as Text);
          continue;
        }
        for (const node of mutation.addedNodes) this.translateTree(node);
        if (mutation.type === 'attributes') {
          this.translateAttributes(mutation.target as Element);
        }
      }
    });
    this.observer.observe(this.element.nativeElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATED_ATTRIBUTES,
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private translateTree(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      this.translateText(node as Text);
      return;
    }
    if (!(node instanceof Element) || this.ignored(node)) return;
    this.translateAttributes(node);
    for (const child of node.childNodes) this.translateTree(child);
  }

  private translateText(node: Text): void {
    if (this.ignored(node.parentElement)) return;
    const current = node.data;
    const previous = this.textStates.get(node);
    const source = previous && current === previous.rendered
      ? previous.source
      : current;
    const rendered = this.translatePreservingWhitespace(source);
    this.textStates.set(node, { source, rendered });
    if (current !== rendered) node.data = rendered;
  }

  private translateAttributes(element: Element): void {
    if (this.ignored(element)) return;
    const states = this.attributeStates.get(element) ?? new Map();
    for (const attribute of TRANSLATED_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      const previous = states.get(attribute);
      const source = previous && current === previous.rendered
        ? previous.source
        : current;
      const rendered = this.i18n.translate(source.trim());
      states.set(attribute, { source, rendered });
      if (current !== rendered) element.setAttribute(attribute, rendered);
    }
    this.attributeStates.set(element, states);
  }

  private translatePreservingWhitespace(value: string): string {
    const content = value.trim();
    if (!content) return value;
    const translated = this.i18n.translate(content);
    if (translated === content) return value;
    const start = value.indexOf(content);
    return `${value.slice(0, start)}${translated}${value.slice(start + content.length)}`;
  }

  private ignored(element: Element | null): boolean {
    return !!element?.closest(
      '[data-i18n-ignore], pre, code, script, style, .log-lines',
    );
  }
}
