import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';

import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { FolderTreeComponent } from '../components/folder-tree/folder-tree.component';
import { WebmailSettingsComponent } from '../components/settings/webmail-settings.component';
import { MailStoreService } from '../services/mail-store.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-webmail-layout',
  standalone: true,
  imports: [RouterModule, FolderTreeComponent, WebmailSettingsComponent, TranslocoPipe],
  templateUrl: './webmail-layout.component.html',
  styleUrl: './webmail-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebmailLayoutComponent implements OnInit, OnDestroy {
  public store = inject(MailStoreService);
  private authService = inject(AuthService);
  private location = inject(Location);

  showSettings = signal(false);
  isSidebarOpen = signal(false);

  canViewSettings = computed(() =>
    ['super_admin', 'admin', 'member', 'owner'].includes(this.authService.userRole())
  );

  private router = inject(Router);
  private routerSub?: Subscription;

  constructor() {
    // Close sidebar on navigation end (mobile)
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.isSidebarOpen.set(false));
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    // Don't trigger if user is typing in an input/textarea/contenteditable
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    // Build a shortcut map: key combos
    const key = event.key.toLowerCase();

    switch (key) {
      case 'j': // next — navigate down in list
        this.navigateToMessage(1);
        break;
      case 'k': // prev — navigate up in list
        this.navigateToMessage(-1);
        break;
      case 'gi': // go to inbox
        this.router.navigate(['webmail/inbox']);
        break;
      case 'gs': // go to sent
        this.router.navigate(['webmail/sent']);
        break;
      case 'gd': // go to drafts
        this.router.navigate(['webmail/drafts']);
        break;
      case 'g/': // go to search
        this.focusSearch();
        break;
      case 'u': // undo / go back
        this.location.back();
        break;
      case '?': // show shortcuts help
        this.showShortcutsHelp();
        break;
      case 'escape':
      case 'esc':
        if (this.showSettings()) this.showSettings.set(false);
        break;
    }
  }

  private navigateToMessage(direction: number) {
    const msgs = this.store.messages();
    if (msgs.length === 0) return;

    const current = this.store.selectedMessage();
    const currentIdx = current ? msgs.findIndex(m => m.id === current.id) : -1;
    const nextIdx = currentIdx === -1
      ? (direction > 0 ? 0 : msgs.length - 1)
      : Math.max(0, Math.min(msgs.length - 1, currentIdx + direction));

    const target = msgs[nextIdx];
    if (target) {
      this.router.navigate(['webmail', 'thread', target.thread_id || target.id]);
    }
  }

  private focusSearch() {
    const searchInput = document.querySelector('.search-box input') as HTMLInputElement;
    if (searchInput) searchInput.focus();
  }

  private showShortcutsHelp() {
    console.info(`
      Atajos de teclado — Webmail:
      ─────────────────────────────
      j          Siguiente mensaje
      k          Mensaje anterior
      gi         Ir a bandeja de entrada
      gs         Ir a enviados
      gd         Ir a borradores
      g/         Ir a búsqueda
      u          Atrás
      ?          Mostrar esta ayuda
      Esc        Cerrar panel
    `);
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
