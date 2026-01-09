import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingTypesComponent } from './tabs/booking-types/booking-types.component';
import { BookingResourcesComponent } from './tabs/resources/booking-resources.component';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';

@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, BookingTypesComponent, BookingResourcesComponent, BookingAvailabilityComponent],
    templateUrl: './booking-settings.component.html',
    styleUrls: ['./booking-settings.component.scss']
})
export class BookingSettingsComponent {
    activeTab: 'services' | 'resources' | 'availability' = 'services';
}
