import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocsMobileTabsComponent } from './docs-mobile-tabs.component';
import { TranslocoTestingModule } from '@jsverse/transloco';

describe('DocsMobileTabsComponent', () => {
  let fixture: ComponentFixture<DocsMobileTabsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocsMobileTabsComponent, TranslocoTestingModule.forRoot({})],
    });
    fixture = TestBed.createComponent(DocsMobileTabsComponent);
    fixture.detectChanges();
  });

  it('mounts and shows two tab buttons', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('exposes tabClass() and applies the active class for the active tab', () => {
    const cmp = fixture.componentInstance;
    const activeCls = cmp.tabClass(true);
    const inactiveCls = cmp.tabClass(false);
    expect(activeCls).toContain('border-blue-600');
    expect(inactiveCls).toContain('border-transparent');
  });
});
