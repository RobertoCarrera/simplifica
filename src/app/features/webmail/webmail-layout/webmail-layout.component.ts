import { Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { FolderTreeComponent } from '../components/folder-tree/folder-tree.component';
import { WebmailSettingsComponent } from '../components/settings/webmail-settings.component';
import { MailStoreService } from '../services/mail-store.service';

@Component({
  selector: 'app-webmail-layout',
  standalone: true,
  imports: [RouterModule, FolderTreeComponent, WebmailSettingsComponent],
  templateUrl: './webmail-layout.component.html',
  styleUrl: './webmail-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebmailLayoutComponent implements OnInit, OnDestroy {
  public store = inject(MailStoreService);

  showSettings = signal(false);
  isSidebarOpen = signal(false);

  private router = inject(Router);
  private routerSub?: Subscription;

  constructor() {
    // Close sidebar on navigation end (mobile)
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.isSidebarOpen.set(false));
  }

  ngOnInit() {
    this.store.loadAccounts();
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  toggleSettings() {
    this.showSettings.update((v) => !v);
  }

  toggleSidebar() {
    this.isSidebarOpen.update((v) => !v);
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  isAccountDropdownOpen = signal(false);

  toggleAccountDropdown() {
    this.isAccountDropdownOpen.update((v) => !v);
  }

  selectAccount(account: any) {
    this.store.selectAccount(account);
    this.isAccountDropdownOpen.set(false);
  }
}
