/**
 * Unit tests for SeatBadgeComponent. Renders via a tiny inline host
 * element and asserts the computed label + click emission.
 *
 * Spec ref: F-SEAT-004 (Empresas Tab Seat Badge).
 *
 * Test runner: Karma+Jasmine (`npm run test`). Requires Chrome, which
 * is NOT installed in this dev environment — runs on CI.
 *
 * Excluded from `npm run test:unit` (Jest) because Angular 21 ships
 * its `@angular/core/testing` module as ESM in node_modules and Jest's
 * ts-jest preset does not transform it. The pre-existing module-keys.spec.ts
 * sidesteps this by only importing pure helpers; this spec needs TestBed,
 * so it must stay Karma-only.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeatBadgeComponent, SeatBadgeCompany } from './seat-badge.component';

@Component({
  standalone: true,
  imports: [SeatBadgeComponent],
  template: `<app-seat-badge [company]="company()" (seatBadgeClick)="onClick($event)" />`,
})
class HostComponent {
  company = signal<SeatBadgeCompany>({ max_users: 5, seat_current: 2 });
  clicked: SeatBadgeCompany | null = null;
  onClick(c: SeatBadgeCompany) {
    this.clicked = c;
  }
}

describe('SeatBadgeComponent', () => {
  it('renders "X / Y seats" when max_users is set', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.company.set({ max_users: 5, seat_current: 2 });
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('button').textContent.trim();
    expect(text).toContain('2 / 5');
  });

  it('renders "Sin límite" when max_users is null', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.company.set({ max_users: null, seat_current: 12 });
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('button').textContent.trim();
    expect(text).toContain('Sin límite');
  });

  it('renders "X / Y" with warning class when at capacity (current >= max)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.company.set({ max_users: 1, seat_current: 1 });
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.textContent.trim()).toContain('1 / 1');
    expect(btn.className).toContain('bg-amber-100');
    expect(btn.className).toContain('text-amber-800');
  });

  it('renders muted class when seats are available', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.company.set({ max_users: 5, seat_current: 1 });
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.className).toContain('bg-gray-100');
    expect(btn.className).toContain('text-gray-700');
    expect(btn.className).not.toContain('bg-amber-100');
  });

  it('emits seatBadgeClick on click and does not mutate the company', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const before = { max_users: 5, seat_current: 3 };
    fixture.componentInstance.company.set(before);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    fixture.detectChanges();
    // Same reference — no mutation by the component.
    expect(fixture.componentInstance.clicked).toEqual(before);
    // Original company row in the signal is unchanged (signal still holds the original object).
    expect(fixture.componentInstance.company()).toEqual(before);
  });

  it('treats undefined seat_current as 0', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.company.set({ max_users: 8 } as SeatBadgeCompany);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('button').textContent.trim();
    expect(text).toContain('0 / 8');
  });
});