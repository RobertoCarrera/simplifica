import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FolderTreeComponent } from '../components/folder-tree/folder-tree.component';
import { WebmailSettingsComponent } from '../components/settings/webmail-settings.component';
import { MailStoreService } from '../services/mail-store.service';

@Component({
  selector: 'app-webmail-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FolderTreeComponent, WebmailSettingsComponent],
  templateUrl: './webmail-layout.component.html',
  styleUrl: './webmail-layout.component.scss'
})
export class WebmailLayoutComponent implements OnInit {
  private store = inject(MailStoreService);

  showSettings = signal(false);
  isSidebarOpen = signal(false);

  private router = inject(Router);

  constructor() {
    // Close sidebar on navigation (mobile)
    this.router.events.subscribe(() => {
      this.isSidebarOpen.set(false);
    });
  }

  ngOnInit() {
    this.store.loadAccounts();
  }

  toggleSettings() {
    this.showSettings.update(v => !v);
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }
}
