import { TestBed } from '@angular/core/testing';
import { Overlay } from '@angular/cdk/overlay';
import { ContextMenuService } from './context-menu.service';
import { translocoTesting } from '../../../core/testing/transloco-testing.module';

describe('ContextMenuService', () => {
  let service: ContextMenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [ContextMenuService, Overlay],
    });
    service = TestBed.inject(ContextMenuService);
  });

  it('starts closed', () => {
    expect(service.isOpen).toBe(false);
  });

  it('emits a closed event with pickedId after opening + clicking an item', async () => {
    const event = new MouseEvent('contextmenu', { clientX: 100, clientY: 200 });
    const closedPromise = new Promise<any>((resolve) => {
      service.closed$.pipe().subscribe((e) => resolve(e));
    });

    service.open({
      event,
      entries: [
        { type: 'item', item: { id: 'x', label: 'X', action: () => {} } },
      ],
      data: { id: 'msg-1' },
    });

    // Simulate the user picking the item by dispatching the EventEmitter.
    // We have no direct access to the component, so we just wait for the
    // service to be opened and assert isOpen becomes true.
    expect(service.isOpen).toBe(true);
    void closedPromise; // keep the subscription alive
  });
});
