import { Customer } from '../../../models/customer';

/**
 * View Model for Customer to optimize template performance.
 * Pre-calculates values to avoid function calls in the template.
 */
export interface CustomerView extends Customer {
    // Computed display properties
    displayName: string;
    initials: string;
    avatarGradient: string;
    formattedDate: string;
    attentionReasons: string;
    isComplete: boolean;
    gdprBadgeConfig: {
        label: string;
        classes: string;
        icon: string;
    };
    hasAccessToPortal: boolean;
    hasPendingRectification: boolean;
}
