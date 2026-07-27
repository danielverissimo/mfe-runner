import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusPillComponent } from './status-pill.component';

describe('StatusPillComponent', () => {
  let fixture: ComponentFixture<StatusPillComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusPillComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(StatusPillComponent);
  });

  it('renders a localized status and a semantic class', () => {
    fixture.componentRef.setInput('status', 'healthy');
    fixture.detectChanges();

    const pill = fixture.nativeElement.querySelector('.status');
    expect(pill.textContent).toContain('Saudável');
    expect(pill.classList).toContain('status--healthy');
  });

  it('shows a dedicated label while a library link script is running', () => {
    fixture.componentRef.setInput('status', 'linking');
    fixture.detectChanges();

    const pill = fixture.nativeElement.querySelector('.status');
    expect(pill.textContent).toContain('Vinculando');
    expect(pill.classList).toContain('status--linking');
  });
});
