import { ComponentFixture, TestBed } from '@angular/core/testing';
import { projectFixture } from '../../../testing/runner-fixtures';
import { DiscoveredProject } from '../../core/models/runner.models';
import {
  FlutterLaunchDialogComponent,
  FlutterLaunchSelection,
} from './flutter-launch-dialog.component';

describe('FlutterLaunchDialogComponent', () => {
  let fixture: ComponentFixture<FlutterLaunchDialogComponent>;

  const project: DiscoveredProject = {
    ...projectFixture,
    ecosystem: 'flutter',
    technology: 'Flutter',
    supportLevel: 'beta',
    flutterTarget: { platform: 'web' },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlutterLaunchDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FlutterLaunchDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('action', 'run');
    fixture.componentRef.setInput('devices', [{
      id: 'android-1',
      name: 'Pixel',
      platform: 'android',
      available: true,
      emulator: true,
    }, {
      id: 'ios-1',
      name: 'iPhone',
      platform: 'ios',
      available: true,
      emulator: true,
    }]);
    fixture.detectChanges();
  });

  it('allows Web without choosing a device', () => {
    spyOn(fixture.componentInstance.launch, 'emit');
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    );

    expect(submit.disabled).toBeFalse();
    submit.click();

    expect(fixture.componentInstance.launch.emit).toHaveBeenCalledOnceWith({
      action: 'run',
      target: { platform: 'web' },
    } as FlutterLaunchSelection);
  });

  it('requires and emits an available device for Android or iOS', () => {
    const ios: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[value="ios"]',
    );
    ios.click();
    fixture.detectChanges();
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    );
    expect(submit.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('iPhone');
    expect(fixture.nativeElement.textContent).not.toContain('Pixel ·');

    spyOn(fixture.componentInstance.launch, 'emit');
    fixture.componentInstance.deviceId = 'ios-1';
    fixture.componentInstance.submit();

    expect(fixture.componentInstance.launch.emit).toHaveBeenCalledOnceWith({
      action: 'run',
      target: {
        platform: 'ios',
        deviceId: 'ios-1',
        deviceName: 'iPhone',
      },
    } as FlutterLaunchSelection);
  });

  it('renders loading and empty device states', () => {
    const android: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[value="android"]',
    );
    android.click();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consultando devices Flutter');
    expect(fixture.nativeElement.querySelector('.device-state .loading-spinner'))
      .not.toBeNull();

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('devices', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent)
      .toContain('Nenhum dispositivo Android foi encontrado');
  });

  it('shows an accessible loading state while preparing a Web launch', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    const loadingState: HTMLElement = fixture.nativeElement.querySelector(
      '.dialog-loading[role="status"]',
    );
    const submit: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    );

    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(loadingState.textContent).toContain('Consultando devices Flutter');
    expect(loadingState.querySelector('.loading-spinner')).not.toBeNull();
    expect(submit.disabled).toBeTrue();
    expect(submit.textContent).toContain('Carregando');
    const buttonSpinner = submit.querySelector<HTMLElement>(
      '.loading-spinner--button',
    );
    expect(buttonSpinner).withContext('spinner do botão').not.toBeNull();
    const buttonSpinnerStyle = getComputedStyle(buttonSpinner!);
    expect(buttonSpinnerStyle.width).toBe('14px');
    expect(buttonSpinnerStyle.height).toBe('14px');

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('starting', true);
    fixture.detectChanges();

    expect(loadingState.textContent).toContain('Iniciando Flutter');
    expect(submit.textContent).toContain('Iniciando');
  });

  it('lists and starts a configured AVD when no Android device is running', () => {
    fixture.componentRef.setInput('devices', []);
    fixture.componentRef.setInput('emulators', [{
      id: 'Pixel_9a',
      name: 'Pixel_9a',
    }]);
    fixture.componentInstance.setPlatform('android');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent)
      .toContain('Emuladores disponíveis para iniciar');
    expect(fixture.nativeElement.textContent).toContain('Pixel_9a');
    spyOn(fixture.componentInstance.startEmulator, 'emit');
    fixture.componentInstance.emulatorId = 'Pixel_9a';
    fixture.componentInstance.startSelectedEmulator();

    expect(fixture.componentInstance.startEmulator.emit)
      .toHaveBeenCalledOnceWith('Pixel_9a');
  });

  it('shows emulator boot progress while keeping cancellation available', () => {
    fixture.componentRef.setInput('devices', []);
    fixture.componentRef.setInput('emulatorBooting', true);
    fixture.componentRef.setInput(
      'emulatorMessage',
      'Aguardando o Android Emulator ficar disponível no Flutter…',
    );
    fixture.componentInstance.setPlatform('android');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent)
      .toContain('Aguardando o Android Emulator');
    const cancel: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll('footer button')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Cancelar'));
    expect(cancel.disabled).toBeFalse();
  });

  it('uses light theme tokens when the app is configured as light', () => {
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    const platform: HTMLElement = fixture.nativeElement.querySelector(
      '.platform-options label',
    );

    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(dialog).color).toBe('rgb(24, 32, 51)');
    expect(getComputedStyle(platform).backgroundColor)
      .not.toBe('rgb(12, 17, 26)');
  });
});
