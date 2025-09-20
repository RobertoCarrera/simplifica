import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TicketModalService {
  private openSubject = new Subject<any>();
  open$: Observable<any> = this.openSubject.asObservable();

  requestOpen(ticket: any) {
    console.debug('[TicketModalService] requestOpen()', ticket?.id ?? ticket);
    this.openSubject.next(ticket);
  }

  /**
   * Returns true if there are active subscribers listening to open$.
   * Uses the Subject's internal observers array (available in RxJS implementation).
   */
  hasSubscribers(): boolean {
    try {
      const subj: any = this.openSubject as any;
      return Array.isArray(subj.observers) && subj.observers.length > 0;
    } catch (e) {
      return false;
    }
  }
}
