import { Customer } from "../../../models/customer";

export interface CustomerView extends Customer {
    // Derived properties for template performance
    initials: string;
    displayName: string;
    avatarGradient: string;
    isComplete: boolean;
    formattedDate: string;
    portalAccess: boolean;
    gdprBadge: {
        label: string;
        classes: string;
        icon: string;
    };
    hasPendingRectification: boolean;
    attentionReasons: string;
}
