import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import {
  NodeVersionCatalog,
  SystemInfo,
} from '../../core/models/runner.models';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';

@Component({
  selector: 'app-system-info-dialog',
  standalone: true,
  imports: [ActionTooltipDirective],
  templateUrl: './system-info-dialog.component.html',
  styleUrl: './system-info-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemInfoDialogComponent {
  @Input() open = false;
  @Input({ required: true }) info!: SystemInfo;
  @Input({ required: true }) nodeVersions!: NodeVersionCatalog;
  @Input() nodeVersionsLoading = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() refreshNodeVersions = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.open) this.dismiss.emit();
  }

  memoryLabel(): string {
    if (!this.info.hardware.totalMemoryBytes) return 'Não identificada';
    const gibibytes = this.info.hardware.totalMemoryBytes / 1024 ** 3;
    return `${gibibytes.toFixed(gibibytes >= 10 ? 0 : 1)} GB`;
  }

  nodeManagerLabel(): string {
    if (this.nodeVersions.manager === 'nvm-sh') return 'NVM';
    if (this.nodeVersions.manager === 'nvm-windows') {
      return 'NVM for Windows';
    }
    return 'Gerenciador não detectado';
  }
}
