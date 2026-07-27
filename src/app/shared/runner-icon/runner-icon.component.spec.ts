import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunnerIconComponent } from './runner-icon.component';

describe('RunnerIconComponent', () => {
  let fixture: ComponentFixture<RunnerIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RunnerIconComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(RunnerIconComponent);
  });

  it('renders a consistently sized semantic SVG icon', () => {
    fixture.componentRef.setInput('name', 'play');
    fixture.componentRef.setInput('size', 20);
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.dataset['icon']).toBe('play');
    expect(svg.style.width).toBe('20px');
    expect(svg.style.height).toBe('20px');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('keeps decorative icons hidden from assistive technology', () => {
    fixture.componentRef.setInput('name', 'settings');
    fixture.detectChanges();

    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });
});
