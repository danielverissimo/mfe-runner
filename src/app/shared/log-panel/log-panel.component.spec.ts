import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { LogPanelComponent } from './log-panel.component';
import { RunnerBridge } from '../../core/models/runner.models';
import { createBridgeFixture } from '../../../testing/runner-fixtures';

describe('LogPanelComponent', () => {
  let fixture: ComponentFixture<LogPanelComponent>;

  beforeEach(async () => {
    window.runnerApi = createBridgeFixture();
    await TestBed.configureTestingModule({
      imports: [LogPanelComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(LogPanelComponent);
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    delete document.documentElement.dataset['theme'];
    delete window.runnerApi;
  });

  it('uses light surfaces throughout the console in the light theme', () => {
    document.documentElement.dataset['theme'] = 'light';
    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();

    const logs: HTMLElement = fixture.nativeElement.querySelector('.logs');
    const toolbar: HTMLElement =
      fixture.nativeElement.querySelector('.log-toolbar');
    const consoleElement: HTMLElement =
      fixture.nativeElement.querySelector('.console');

    expect(getComputedStyle(logs).backgroundColor)
      .toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(toolbar).backgroundColor)
      .not.toBe('rgb(10, 15, 23)');
    expect(getComputedStyle(consoleElement).backgroundColor)
      .toBe('rgb(255, 255, 255)');
  });

  it('filters logs by workspace and project', () => {
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput('projectId', 'project-1');
    fixture.componentRef.setInput('processes', [{
      key: 'workspace-1::project-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      projectName: 'Project One',
      script: 'start',
      status: 'healthy',
      pid: 100,
      port: 4310,
      startedAt: '2026-07-24T12:00:00.000Z',
      stoppedAt: null,
      exitCode: null,
      message: 'Healthy',
      logs: [{
        id: 'log-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        projectName: 'Project One',
        stream: 'stdout',
        level: 'info',
        message: 'Ready on port 4310',
        timestamp: '2026-07-24T12:00:01.000Z',
      }],
    }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ready on port 4310');
    expect(fixture.nativeElement.textContent).toContain('Project One');
  });

  it('emits the clear action', () => {
    spyOn(fixture.componentInstance.clear, 'emit');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.clear-logs').click();
    expect(fixture.componentInstance.clear.emit).toHaveBeenCalled();
  });

  it('offers an expanded view and emits the open action when enabled', () => {
    spyOn(fixture.componentInstance.open, 'emit');
    fixture.componentRef.setInput('openable', true);
    fixture.detectChanges();

    const openButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.open-logs');
    expect(openButton.textContent).toContain('Abrir em Logs');

    openButton.click();

    expect(fixture.componentInstance.open.emit).toHaveBeenCalled();
  });

  it('follows new log entries by default', () => {
    fixture.detectChanges();
    const scrollToLatest = spyOn(
      fixture.componentInstance as never,
      'scrollToLatest' as never,
    );

    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();

    const followButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.follow-logs');
    expect(followButton.getAttribute('aria-pressed')).toBe('true');
    expect(scrollToLatest).toHaveBeenCalledTimes(1);
  });

  it('allows pausing and resuming automatic log scrolling', () => {
    fixture.detectChanges();
    const scrollToLatest = spyOn(
      fixture.componentInstance as never,
      'scrollToLatest' as never,
    );

    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();

    const followButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.follow-logs');
    expect(scrollToLatest).toHaveBeenCalledTimes(1);

    followButton.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('processes', [processWithLogs('log-1', 'log-2')]);
    fixture.detectChanges();

    expect(followButton.getAttribute('aria-pressed')).toBe('false');
    expect(scrollToLatest).toHaveBeenCalledTimes(1);

    followButton.click();
    fixture.detectChanges();

    expect(followButton.getAttribute('aria-pressed')).toBe('true');
    expect(scrollToLatest).toHaveBeenCalledTimes(2);
  });

  it('copies all visible log content when there is no selection', async () => {
    fixture.componentRef.setInput('processes', [processWithLogs('log-1', 'log-2')]);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.copy-logs').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(window.runnerApi?.copyText).toHaveBeenCalledOnceWith({
      text: jasmine.stringMatching(
        /\[Project One\] Log 1\n.*\[Project One\] Log 2/,
      ),
    });
    expect(fixture.nativeElement.querySelector('.copy-logs').textContent)
      .toContain('Copiado');
  });

  it('copies only text selected inside this log console', async () => {
    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();
    const message = fixture.nativeElement.querySelector('.message');
    const range = document.createRange();
    range.selectNodeContents(message);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fixture.nativeElement.querySelector('.copy-logs').click();
    await fixture.whenStable();

    expect(window.runnerApi?.copyText).toHaveBeenCalledOnceWith({
      text: 'Log 1',
    });
  });

  it('shows a failure state when the clipboard bridge rejects the write', async () => {
    const bridge = window.runnerApi as jasmine.SpyObj<RunnerBridge>;
    bridge.copyText.and.rejectWith(new Error('Clipboard indisponível'));
    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.copy-logs').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.copy-logs').textContent)
      .toContain('Falhou');
  });

  it('filters the consolidated output by multiple selected projects', () => {
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput('processes', [
      processWithLogs('log-1'),
      processForProject('project-2', 'Project Two', 'Second project log'),
    ]);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.source-filter-toggle').click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-source-id="project-1"]')
      .click();
    fixture.detectChanges();

    let consoleText = fixture.nativeElement.querySelector('.console').textContent;
    expect(consoleText).toContain('Log 1');
    expect(consoleText).not.toContain('Second project log');

    fixture.nativeElement
      .querySelector('[data-source-id="project-2"]')
      .click();
    fixture.detectChanges();

    consoleText = fixture.nativeElement.querySelector('.console').textContent;
    expect(consoleText).toContain('Log 1');
    expect(consoleText).toContain('Second project log');
    expect(fixture.componentInstance.sourceFilterLabel).toBe('2 selecionados');
  });

  it('copies only entries from the selected log sources', async () => {
    fixture.componentRef.setInput('processes', [
      processWithLogs('log-1'),
      processForProject('project-2', 'Project Two', 'Second project log'),
    ]);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.source-filter-toggle').click();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-source-id="project-2"]')
      .click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.copy-logs').click();
    await fixture.whenStable();

    const copiedText = (
      window.runnerApi?.copyText as jasmine.Spy
    ).calls.mostRecent().args[0].text;
    expect(copiedText).toContain('[Project Two] Second project log');
    expect(copiedText).not.toContain('[Project One]');
  });

  it('resets the source selection when the workspace changes', () => {
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput('processes', [
      processWithLogs('log-1'),
      processForProject('project-2', 'Project Two', 'Second project log'),
    ]);
    fixture.detectChanges();
    fixture.componentInstance.toggleSource('project-1');
    expect(fixture.componentInstance.showAllSources).toBeFalse();

    fixture.componentRef.setInput('workspaceId', 'workspace-2');
    fixture.detectChanges();

    expect(fixture.componentInstance.showAllSources).toBeTrue();
    expect(fixture.componentInstance.selectedSourceIds.size).toBe(0);
  });

  it('combines text, regex and level filters', fakeAsync(() => {
    fixture.componentRef.setInput('processes', [processWithLevelLogs()]);
    fixture.detectChanges();

    fixture.componentInstance.updateSearch('deprecated');
    tick(200);
    fixture.detectChanges();
    expect(fixture.componentInstance.entries.map((entry) => entry.id))
      .toEqual(['warning-log']);

    fixture.componentInstance.updateSearch('fatal\\s+error');
    fixture.componentInstance.toggleRegex();
    tick(200);
    fixture.detectChanges();
    expect(fixture.componentInstance.entries.map((entry) => entry.id))
      .toEqual(['error-log']);

    fixture.componentInstance.toggleLevel('error');
    fixture.detectChanges();
    expect(fixture.componentInstance.entries).toEqual([]);
  }));

  it('freezes the visual output while capture continues', () => {
    fixture.componentRef.setInput('processes', [processWithLogs('log-1')]);
    fixture.detectChanges();
    fixture.componentInstance.toggleVisualization();

    fixture.componentRef.setInput(
      'processes',
      [processWithLogs('log-1', 'log-2')],
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.visualPaused).toBeTrue();
    expect(fixture.componentInstance.entries.map((entry) => entry.id))
      .toEqual(['log-1']);
    expect(fixture.componentInstance.newEntriesCount).toBe(1);

    fixture.componentInstance.toggleVisualization();
    expect(fixture.componentInstance.entries.map((entry) => entry.id))
      .toEqual(['log-1', 'log-2']);
  });

  it('shares bookmarks and selects a contiguous temporal interval', async () => {
    fixture.componentRef.setInput(
      'processes',
      [processWithLogs('log-1', 'log-2', 'log-3')],
    );
    fixture.detectChanges();
    fixture.componentInstance.toggleBookmark('log-2', new Event('click'));
    fixture.componentInstance.toggleRangeMode();
    fixture.componentInstance.selectRangeEntry(
      fixture.componentInstance.entries[0],
    );
    fixture.componentInstance.selectRangeEntry(
      fixture.componentInstance.entries[2],
    );

    expect(fixture.componentInstance.viewState.has('log-2')).toBeTrue();
    expect(fixture.componentInstance.rangeEntries.length).toBe(3);

    await fixture.componentInstance.copyLogs();
    const copied = (
      window.runnerApi?.copyText as jasmine.Spy
    ).calls.mostRecent().args[0].text;
    expect(copied).toContain('Log 1');
    expect(copied).toContain('Log 3');
  });

  it('exports the currently filtered authoritative entry identifiers', async () => {
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput(
      'processes',
      [processWithLogs('log-1', 'log-2')],
    );
    fixture.detectChanges();
    fixture.componentInstance.openExport();
    fixture.componentInstance.exportScope = 'filtered';

    await fixture.componentInstance.exportDiagnostics();

    expect(window.runnerApi?.exportDiagnostics).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      entryIds: ['log-1', 'log-2'],
      includeAbsolutePaths: false,
    });
    expect(fixture.componentInstance.exportState).toBe('exported');
  });
});

function processWithLogs(...ids: string[]) {
  return {
    key: 'workspace-1::project-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    projectName: 'Project One',
    script: 'start',
    status: 'healthy' as const,
    pid: 100,
    port: 4310,
    startedAt: '2026-07-24T12:00:00.000Z',
    stoppedAt: null,
    exitCode: null,
    message: 'Healthy',
    logs: ids.map((id, index) => ({
      id,
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      projectName: 'Project One',
      stream: 'stdout' as const,
      level: 'info' as const,
      message: `Log ${index + 1}`,
      timestamp: `2026-07-24T12:00:0${index + 1}.000Z`,
    })),
  };
}

function processForProject(projectId: string, projectName: string, message: string) {
  return {
    ...processWithLogs('secondary-log'),
    key: `workspace-1::${projectId}`,
    projectId,
    projectName,
    logs: [{
      id: `${projectId}-log`,
      workspaceId: 'workspace-1',
      projectId,
      projectName,
      stream: 'stdout' as const,
      level: 'info' as const,
      message,
      timestamp: '2026-07-24T12:00:09.000Z',
    }],
  };
}

function processWithLevelLogs() {
  return {
    ...processWithLogs(),
    logs: [
      {
        id: 'info-log',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        projectName: 'Project One',
        stream: 'stdout' as const,
        level: 'info' as const,
        message: 'Application ready',
        timestamp: '2026-07-24T12:00:01.000Z',
      },
      {
        id: 'warning-log',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        projectName: 'Project One',
        stream: 'stderr' as const,
        level: 'warning' as const,
        message: 'Deprecated option',
        timestamp: '2026-07-24T12:00:02.000Z',
      },
      {
        id: 'error-log',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        projectName: 'Project One',
        stream: 'stderr' as const,
        level: 'error' as const,
        message: 'Fatal error',
        timestamp: '2026-07-24T12:00:03.000Z',
      },
    ],
  };
}
