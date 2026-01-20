import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
  store = inject(MailStoreService); // Public for HTML access

  showSettings = signal(false);
  showAccountSelector = signal(false);

  ngOnInit() {
    this.store.loadAccounts();
  }

  toggleSettings() {
    this.showSettings.update(v => !v);
    this.showAccountSelector.set(false);
  }

  toggleAccountSelector() {
    this.showAccountSelector.update(v => !v);
  }

  selectAccount(account: any) {
    this.store.selectAccount(account);
    this.showAccountSelector.set(false);
  }
}
