import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LogViewStateService {
  private readonly bookmarkedIdsState = signal<ReadonlySet<string>>(new Set());
  readonly bookmarkedIds = this.bookmarkedIdsState.asReadonly();

  toggle(entryId: string): void {
    const next = new Set(this.bookmarkedIdsState());
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    this.bookmarkedIdsState.set(next);
  }

  has(entryId: string): boolean {
    return this.bookmarkedIdsState().has(entryId);
  }

  prune(availableIds: ReadonlySet<string>): void {
    const current = this.bookmarkedIdsState();
    const next = new Set([...current].filter((id) => availableIds.has(id)));
    if (next.size !== current.size) this.bookmarkedIdsState.set(next);
  }
}
