import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemInfoDialogComponent } from './system-info-dialog.component';
import { snapshotFixture } from '../../../testing/runner-fixtures';

describe('SystemInfoDialogComponent', () => {
  let fixture: ComponentFixture<SystemInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemInfoDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SystemInfoDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('info', snapshotFixture.systemInfo);
    fixture.componentRef.setInput('nodeVersions', {
      detected: true,
      manager: 'nvm-sh',
      versions: ['24.15.0', '22.12.0'],
      message: '2 versões encontradas.',
    });
    fixture.detectChanges();
  });

  it('shows system, hardware and runtime information', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('macOS');
    expect(text).toContain('Apple M4');
    expect(text).toContain('16 GB');
    expect(text).toContain('v24.15.0');
    expect(text).toContain('v43.2.0');
    expect(text).toContain('Versões Node instaladas · NVM');
  });

  it('closes without exposing or changing machine state', () => {
    spyOn(fixture.componentInstance.dismiss, 'emit');
    const closeButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('footer button');
    closeButton.click();
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalled();
  });

  it('closes the system information modal with Escape', () => {
    spyOn(fixture.componentInstance.dismiss, 'emit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalledOnceWith();
  });

  it('uses light theme tokens for system information surfaces', () => {
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    const section: HTMLElement = fixture.nativeElement.querySelector('.info-section');

    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(dialog).color).toBe('rgb(24, 32, 51)');
    expect(getComputedStyle(section).backgroundColor).toBe('rgb(238, 241, 246)');
  });
});
