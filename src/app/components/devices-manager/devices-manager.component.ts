
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientDevicesModalComponent } from '../client-devices-modal.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-devices-manager',
  standalone: true,
  imports: [CommonModule, ClientDevicesModalComponent],
  template: `
    <div class="p-6 h-full w-full overflow-hidden flex flex-col">
       <app-client-devices-modal 
          [companyId]="companyId" 
          [isModal]="false"
          [mode]="'view'">
       </app-client-devices-modal>
    </div>
  `
})
export class DevicesManagerComponent {
  private authService = inject(AuthService);

  get companyId(): string {
    // Return user's company ID (works for owner/admin/member)
    return this.authService.userProfile?.company_id || '';
  }
}
