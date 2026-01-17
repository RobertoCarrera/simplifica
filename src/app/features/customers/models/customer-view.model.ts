import { Customer } from '../../../models/customer';

export interface GdprBadgeConfig {
    label: string;
    classes: string;
    icon: string;
}

export interface CustomerView extends Customer {
    // View-specific pre-calculated properties
    displayName: string;
    initials: string;
    avatarGradient: string;
    hasPortalAccess: boolean;
    formattedDate: string;
    isComplete: boolean;
    gdprBadge: GdprBadgeConfig;
    attentionReasons: string; // result of formatAttentionReasons
    hasPendingRectification: boolean;
}
