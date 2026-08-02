import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';
import {
  AndroidEmulator,
  DiscoveredProject,
  FlutterDevice,
  FlutterProjectTarget,
} from '../../core/models/runner.models';

export type FlutterLaunchAction = 'run' | 'test' | 'build';

export interface FlutterLaunchSelection {
  action: FlutterLaunchAction;
  target: FlutterProjectTarget;
}

@Component({
  selector: 'app-flutter-launch-dialog',
  standalone: true,
  imports: [FormsModule, RunnerSelectComponent],
  templateUrl: './flutter-launch-dialog.component.html',
  styleUrl: './flutter-launch-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlutterLaunchDialogComponent implements OnChanges {
  @Input() open = false;
  @Input({ required: true }) project!: DiscoveredProject;
  @Input({ required: true }) action: FlutterLaunchAction = 'run';
  @Input() devices: FlutterDevice[] = [];
  @Input() emulators: AndroidEmulator[] = [];
  @Input() loading = false;
  @Input() emulatorsLoading = false;
  @Input() starting = false;
  @Input() emulatorBooting = false;
  @Input() emulatorMessage: string | null = null;
  @Output() dismiss = new EventEmitter<void>();
  @Output() refreshDevices = new EventEmitter<void>();
  @Output() refreshEmulators = new EventEmitter<void>();
  @Output() startEmulator = new EventEmitter<string>();
  @Output() launch = new EventEmitter<FlutterLaunchSelection>();

  platform: FlutterProjectTarget['platform'] = 'web';
  deviceId = '';
  emulatorId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['open']?.currentValue && !changes['open']?.previousValue) ||
      changes['project'] ||
      changes['action']
    ) {
      this.platform = this.project?.flutterTarget?.platform ?? 'web';
      this.deviceId = this.project?.flutterTarget?.deviceId ?? '';
      this.emulatorId = '';
      this.ensureValidDevice();
    }
    if (changes['devices']) this.ensureValidDevice();
    if (changes['emulators']) this.ensureValidEmulator();
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.open && !this.starting) this.dismiss.emit();
  }

  setPlatform(platform: FlutterProjectTarget['platform']): void {
    this.platform = platform;
    this.deviceId = '';
    this.emulatorId = '';
  }

  availableDevices(): FlutterDevice[] {
    return this.devices.filter(
      (device) => device.platform === this.platform,
    );
  }

  selectedDevice(): FlutterDevice | undefined {
    return this.availableDevices().find(
      (device) => device.id === this.deviceId && device.available,
    );
  }

  hasAvailableDevice(): boolean {
    return this.availableDevices().some((device) => device.available);
  }

  selectedEmulator(): AndroidEmulator | undefined {
    return this.emulators.find((emulator) => emulator.id === this.emulatorId);
  }

  busy(): boolean {
    return this.loading || this.starting || this.emulatorBooting;
  }

  canLaunch(): boolean {
    return !this.busy() &&
      (this.platform === 'web' || !!this.selectedDevice());
  }

  startSelectedEmulator(): void {
    const emulator = this.selectedEmulator();
    if (!emulator || this.busy()) return;
    this.startEmulator.emit(emulator.id);
  }

  submit(): void {
    if (!this.canLaunch()) return;
    const device = this.selectedDevice();
    this.launch.emit({
      action: this.action,
      target: {
        platform: this.platform,
        ...(device ? { deviceId: device.id, deviceName: device.name } : {}),
      },
    });
  }

  actionLabel(): string {
    return this.action === 'run' ? 'Run' : this.action === 'test' ? 'Test' : 'Build';
  }

  private ensureValidDevice(): void {
    if (this.platform === 'web') {
      this.deviceId = '';
      return;
    }
    if (!this.selectedDevice()) this.deviceId = '';
  }

  private ensureValidEmulator(): void {
    if (!this.selectedEmulator()) this.emulatorId = '';
  }
}
