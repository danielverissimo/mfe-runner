import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type RunnerIconName =
  | 'activity'
  | 'chevron-down'
  | 'copy'
  | 'diamond'
  | 'external'
  | 'git'
  | 'grid'
  | 'link'
  | 'list'
  | 'more'
  | 'play'
  | 'refresh'
  | 'restart'
  | 'search'
  | 'settings'
  | 'stop'
  | 'terminal'
  | 'warning'
  | 'x';

@Component({
  selector: 'app-runner-icon',
  standalone: true,
  templateUrl: './runner-icon.component.html',
  styleUrl: './runner-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
  },
})
export class RunnerIconComponent {
  @Input({ required: true }) name!: RunnerIconName;
  @Input() size = 18;
}
