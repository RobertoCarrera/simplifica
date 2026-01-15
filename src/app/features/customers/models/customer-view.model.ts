import { Customer } from '../../../models/customer';

export interface CustomerView extends Customer {
    displayName: string;
    initials: string;
    avatarGradient: string;
    formattedDate: string;
    isComplete: boolean;
    missingFields: string[];
}
