import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { NodeVersionCatalog } from '../../core/models/runner.models';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';

@Component({
  selector: 'app-node-version-picker',
  standalone: true,
  imports: [ActionTooltipDirective, RunnerSelectComponent],
  templateUrl: './node-version-picker.component.html',
  styleUrl: './node-version-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeVersionPickerComponent {
  @Input({ required: true }) catalog!: NodeVersionCatalog;
  @Input() value = '';
  @Input() label = 'Versão do Node';
  @Input() compact = false;
  @Input() loading = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  installedValue(): string {
    const normalized = this.value.trim().replace(/^v/, '');
    return this.catalog.versions.includes(normalized) ? normalized : '';
  }

  selectInstalled(version: string): void {
    if (version) this.valueChange.emit(version);
  }

  enterManual(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
