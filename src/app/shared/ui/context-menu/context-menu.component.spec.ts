import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { ContextMenuComponent } from './context-menu.component';
import { ContextMenuEntry } from './context-menu.types';
import { translocoTesting } from '../../../core/testing/transloco-testing.module';

@Component({
  standalone: true,
  imports: [ContextMenuComponent],
  template: `
    <app-context-menu [entries]="entries" (itemPicked)="picked = $event" />
  `,
})
class HostComponent {
  entries: ContextMenuEntry[] = [];
  picked: string | null = null;
}

describe('ContextMenuComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent, translocoTesting()],
      providers: [Overlay],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  function detectAndQuery() {
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.ctx-menu') as HTMLElement;
  }

  it('renders an item for each entry', () => {
    host.entries = [
      { type: 'item', item: { id: 'a', label: 'A' } },
      { type: 'separator' },
      { type: 'item', item: { id: 'b', label: 'B', icon: 'fas fa-b' } },
    ];
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('button.ctx-item');
    expect(items.length).toBe(2);
    const seps = fixture.nativeElement.querySelectorAll('.ctx-sep');
    expect(seps.length).toBe(1);
  });

  it('emits itemPicked with the id when clicked', () => {
    host.entries = [{ type: 'item', item: { id: 'reply', label: 'Reply' } }];
    const menu = detectAndQuery();
    const btn = menu.querySelector('button.ctx-item') as HTMLButtonElement;
    btn.click();
    expect(host.picked).toBe('reply');
  });

  it('skips hidden items', () => {
    host.entries = [
      { type: 'item', item: { id: 'a', label: 'A' } },
      { type: 'item', item: { id: 'b', label: 'B', hidden: true } },
    ];
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('button.ctx-item');
    expect(items.length).toBe(1);
  });

  it('marks disabled items and ignores clicks', () => {
    host.entries = [
      { type: 'item', item: { id: 'a', label: 'A', disabled: true } },
    ];
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button.ctx-item') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.classList.contains('disabled')).toBe(true);
    btn.click();
    expect(host.picked).toBeNull();
  });

  it('applies danger class', () => {
    host.entries = [
      { type: 'item', item: { id: 'del', label: 'Delete', danger: true } },
    ];
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button.ctx-item') as HTMLButtonElement;
    expect(btn.classList.contains('danger')).toBe(true);
  });

  it('renders a label entry with transloco', () => {
    host.entries = [{ type: 'label', label: 'webmail.group.reply' }];
    fixture.detectChanges();
    const label = fixture.nativeElement.querySelector('.ctx-label') as HTMLElement;
    expect(label).toBeTruthy();
    // Transloco will return the key as-is when no translation is loaded
    // (which is the case in unit tests), but the key must still appear.
    expect(label.textContent).toContain('webmail.group.reply');
  });
});
