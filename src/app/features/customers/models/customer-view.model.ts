import { Customer } from '../../../models/customer';

export interface GdprBadgeConfig {
    label: string;
    classes: string;
    icon: string;
}

export interface CustomerView extends Customer {
    avatarGradient: string;
    initials: string;
    displayName: string;
    isComplete: boolean;
    attentionReasons: string;
    formattedDate: string;
    hasPortalAccess: boolean;
    gdprBadge: GdprBadgeConfig;
    hasPendingRectification: boolean;
}
