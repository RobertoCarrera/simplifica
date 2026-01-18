import { Customer } from '../../../models/customer';

export interface GdprBadgeConfig {
    label: string;
    classes: string;
    icon: string;
}

export interface CustomerView extends Customer {
    // Computed display properties
    displayName: string;
    initials: string;
    avatarGradient: string;

    // Completeness
    isComplete: boolean;
    missingFields: string[];
    attentionLabel: string;

    // GDPR
    gdprBadge: GdprBadgeConfig;
}
