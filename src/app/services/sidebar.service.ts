import { Injectable, signal} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {

  isShrink = signal(false);

  toggleSidebar(value: boolean): void {
    
    this.isShrink.set(value);
  }
}