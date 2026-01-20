import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { ClientGdprPanelComponent } from '../../customers/components/client-gdpr-panel/client-gdpr-panel.component';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-portal-settings',
    standalone: true,
    imports: [CommonModule, ClientGdprPanelComponent],
    template: `
    <div class="max-w-4xl mx-auto p-4">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Configuración</h1>
      </div>

      <div class="space-y-6">
        <!-- GDPR Panel -->
        <app-client-gdpr-panel
          *ngIf="user"
          [clientId]="user.client_id || ''"
          [clientEmail]="user.email || ''"
          [clientName]="userName"
          [readOnly]="false">
        </app-client-gdpr-panel>

        <div *ngIf="!user" class="text-gray-500">
          Cargando perfil...
        </div>
      </div>
    </div>
  `
})
export class PortalSettingsComponent implements OnInit {
    private auth = inject(AuthService);
    user: any = null;
    userName: string = '';

    async ngOnInit() {
        this.user = await firstValueFrom(this.auth.userProfile$);
        if (this.user) {
            const u = this.user as any;
            this.userName = (u.first_name || '') + ' ' + (u.last_name || '');
            this.userName = this.userName.trim() || u.email || 'Cliente';
        }
    }
}
