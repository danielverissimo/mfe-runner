import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ProcessStatus } from '../../core/models/runner.models';

@Component({
  selector: 'app-status-pill',
  standalone: true,
  template: `
    <span class="status" [class]="'status status--' + status">
      <span class="status__dot" aria-hidden="true"></span>
      {{ label }}
    </span>
  `,
  styleUrl: './status-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPillComponent {
  @Input({ required: true }) status: ProcessStatus = 'stopped';

  get label(): string {
    return {
      stopped: 'Parado',
      starting: 'Iniciando',
      linking: 'Vinculando',
      running: 'Executando',
      healthy: 'Saudável',
      degraded: 'Degradado',
      stopping: 'Parando',
      failed: 'Falhou',
      conflict: 'Conflito',
      connecting: 'Conectando',
      online: 'Online',
      offline: 'Offline',
      'identity-mismatch': 'Identidade alterada',
    }[this.status];
  }
}
