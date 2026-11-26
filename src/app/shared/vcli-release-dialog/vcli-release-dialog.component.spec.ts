import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VcliReleaseDialogComponent } from './vcli-release-dialog.component';

describe('VcliReleaseDialogComponent', () => {
  let fixture: ComponentFixture<VcliReleaseDialogComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VcliReleaseDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(VcliReleaseDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('defaults to validation, requires an explicit version and never emits on open', () => {
    const component = fixture.componentInstance;
    spyOn(component.launch, 'emit');
    expect(component.operation).toBe('validate');
    expect(component.includeUntracked).toBeFalse();
    expect(component.canLaunch()).toBeFalse();
    component.submit();
    expect(component.launch.emit).not.toHaveBeenCalled();
    component.version = '0.14.0';
    component.ghUser = 'example-user';
    component.submit();
    expect(component.launch.emit).toHaveBeenCalledOnceWith({
      version: '0.14.0', target: 'all', mode: 'local', dryRun: true,
      includeUntracked: false, ghUser: 'example-user',
    });
  });

  it('emits publication only after the operator selects it and preserves optional file paths', () => {
    const component = fixture.componentInstance;
    spyOn(component.launch, 'emit');
    component.version = ' 1.2.3 ';
    component.target = 'linux-x64';
    component.mode = 'actions';
    component.operation = 'publish';
    component.notesFile = '/tmp/release notes.md';
    component.submit();
    expect(component.launch.emit).toHaveBeenCalledOnceWith({
      version: '1.2.3', target: 'linux-x64', mode: 'actions', dryRun: false,
      includeUntracked: false, notesFile: '/tmp/release notes.md',
    });
  });

  it('blocks invalid input, unsupported hosts and repeated submits while starting', () => {
    const component = fixture.componentInstance;
    for (const version of ['--help', '01.2.3', '1.2', '1.2.3;echo']) {
      component.version = version;
      expect(component.canLaunch()).toBeFalse();
    }
    component.version = '1.2.3';
    component.platform = 'linux';
    expect(component.canLaunch()).toBeFalse();
    component.mode = 'actions';
    component.target = 'windows-x64';
    expect(component.canLaunch()).toBeTrue();
    component.starting = true;
    expect(component.canLaunch()).toBeFalse();
  });

  it('shows launch failures in the dialog and keeps focus inside it', async () => {
    fixture.componentRef.setInput('error', 'Use um caminho absoluto.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('caminho absoluto');
    const first = fixture.nativeElement.querySelector('button');
    const last = fixture.nativeElement.querySelector('button[type="submit"]');
    const input = fixture.nativeElement.querySelector('#release-version');
    input.value = '1.2.3';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    fixture.componentInstance.onKeydown(event);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBeTrue();
  });
});
