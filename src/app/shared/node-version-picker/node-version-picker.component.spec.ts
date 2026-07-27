import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NodeVersionPickerComponent } from './node-version-picker.component';

describe('NodeVersionPickerComponent', () => {
  let fixture: ComponentFixture<NodeVersionPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodeVersionPickerComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(NodeVersionPickerComponent);
    fixture.componentRef.setInput('catalog', {
      detected: true,
      manager: 'nvm-sh',
      versions: ['24.15.0', '22.12.0'],
      message: '2 versões encontradas.',
    });
    fixture.componentRef.setInput('value', '24.15.0');
    fixture.detectChanges();
  });

  it('lists installed NVM versions and keeps the manual field', () => {
    const options = fixture.nativeElement.querySelectorAll('option');
    const input = fixture.nativeElement.querySelector('input');

    expect(Array.from(options).map((option: unknown) =>
      (option as HTMLOptionElement).textContent
    )).toContain('Node 24.15.0');
    expect(input.value).toBe('24.15.0');
  });

  it('emits either an installed or manually entered version', () => {
    spyOn(fixture.componentInstance.valueChange, 'emit');

    fixture.componentInstance.selectInstalled({
      target: { value: '22.12.0' },
    } as unknown as Event);
    fixture.componentInstance.enterManual({
      target: { value: '20.19.0' },
    } as unknown as Event);

    expect(fixture.componentInstance.valueChange.emit)
      .toHaveBeenCalledWith('22.12.0');
    expect(fixture.componentInstance.valueChange.emit)
      .toHaveBeenCalledWith('20.19.0');
  });
});
