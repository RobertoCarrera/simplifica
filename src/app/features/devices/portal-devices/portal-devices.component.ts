import { Component, inject, computed } from '@angular/core';

import { ClientDevicesModalComponent } from '../client-devices-modal/client-devices-modal.component';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-portal-devices',
  standalone: true,
  imports: [ClientDevicesModalComponent],
  template: `
    <div class="p-6 h-full w-full overflow-hidden flex flex-col">
      @if (clientInfo(); as info) {
        <app-client-devices-modal
          [companyId]="info.companyId"
          [client]="{ id: info.clientId, name: info.name }"
          [isModal]="false"
          [mode]="'view'"
        >
        </app-client-devices-modal>
      }
    </div>
  `,
})
export class PortalDevicesComponent {
  private authService = inject(AuthService);

  // Computed signal to extract client info from profile
  clientInfo = computed(() => {
    const profile = this.authService.userProfile;
    if (!profile || !profile.client_id || !profile.company_id) return null;

    return {
      clientId: profile.client_id,
      companyId: profile.company_id,
      name: profile.name || 'Cliente', // Used for display in header
    };
  });
}
