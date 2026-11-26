import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VcliReleaseDialogComponent } from './vcli-release-dialog.component';

describe('VcliReleaseDialogComponent', () => {
  let fixture: ComponentFixture<VcliReleaseDialogComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VcliReleaseDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(VcliReleaseDialogComponent);
    fixture.componentRef.setInput('accounts', {
      available: true,
      accounts: [
        { login: 'example-user', active: true, state: 'success' },
        { login: 'work-user', active: false, state: 'success' },
        { login: 'expired-user', active: false, state: 'error' },
      ],
      message: null,
    });
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

  it('lists computer accounts in a select and sends only the selected login', async () => {
    spyOn(fixture.componentInstance.launch, 'emit');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="ghUser"]');
    expect(fixture.nativeElement.querySelector('input[name="ghUser"]')).toBeNull();
    expect(Array.from(select.options, (option) => option.value)).toEqual(['', 'example-user', 'work-user', 'expired-user']);
    expect(select.options[3].disabled).toBeTrue();
    select.value = 'work-user';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.componentInstance.version = '1.2.3';
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.launch.emit).toHaveBeenCalledOnceWith({
      version: '1.2.3', target: 'all', mode: 'local', dryRun: true, includeUntracked: false, ghUser: 'work-user',
    });
  });

  it('shows loading, requests an explicit refresh and preserves a valid selection', async () => {
    spyOn(fixture.componentInstance.refreshAccounts, 'emit');
    fixture.componentInstance.version = '1.2.3';
    fixture.componentInstance.ghUser = 'work-user';
    fixture.componentRef.setInput('accountsLoading', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canLaunch()).toBeFalse();
    expect(fixture.nativeElement.querySelector('select[name="ghUser"]').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Carregando contas');
    fixture.componentRef.setInput('accountsLoading', false);
    fixture.detectChanges();
    const refresh = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Atualizar contas'))!;
    refresh.click();
    expect(fixture.componentInstance.refreshAccounts.emit).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.ghUser).toBe('work-user');
  });

  it('blocks a removed, invalid or unavailable account without silently switching to the active one', () => {
    fixture.componentInstance.version = '1.2.3';
    for (const login of ['expired-user', 'missing-user', '--help']) {
      fixture.componentInstance.ghUser = login;
      expect(fixture.componentInstance.canLaunch()).toBeFalse();
    }
    fixture.componentInstance.ghUser = 'work-user';
    fixture.componentRef.setInput('accounts', { available: true, accounts: [], message: null });
    fixture.detectChanges();
    expect(fixture.componentInstance.ghUser).toBe('work-user');
    expect(fixture.componentInstance.canLaunch()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('conta selecionada não está disponível');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="ghUser"]');
    expect(Array.from(select.options).filter((option) => option.value === 'work-user').length).toBe(1);
  });

  it('shows an empty/error catalog and allows the explicit active-account fallback', () => {
    fixture.componentRef.setInput('accounts', {
      available: false, accounts: [], message: 'GitHub CLI não encontrado. Instale o gh e autentique suas contas.',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('GitHub CLI não encontrado');
    fixture.componentInstance.version = '1.2.3';
    spyOn(fixture.componentInstance.launch, 'emit');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.launch.emit).toHaveBeenCalledOnceWith({
      version: '1.2.3', target: 'all', mode: 'local', dryRun: true, includeUntracked: false,
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
