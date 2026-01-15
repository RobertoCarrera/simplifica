import { Customer } from '../../../models/customer';

export interface CustomerView extends Customer {
    initials: string;
    displayName: string;
    formattedDate: string;
    avatarGradient: string;
    gdprBadge: {
        label: string;
        classes: string;
        icon: string;
    };
}
