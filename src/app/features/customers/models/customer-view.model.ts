import { Customer } from '../../../models/customer';

export interface CustomerView extends Customer {
    // Calculated view properties to avoid function calls in template
    displayName: string;
    initials: string;
    avatarGradient: string;

    // Completeness status pre-calculated
    isComplete: boolean;
    missingFields: string[];
}
