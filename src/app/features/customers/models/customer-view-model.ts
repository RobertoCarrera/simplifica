import { Customer } from '../../../models/customer';

export type CustomerViewModel = Customer & {
    // Pre-calculated display values
    displayName: string;
    initials: string;
    avatarGradient: string;
    formattedDate: string;

    // Pre-calculated search and sort values
    searchString: string;
    lowerName: string;
    lowerApellidos: string;

    // Status flags
    isComplete: boolean;

    // Config objects
    gdprBadgeConfig: {
        label: string;
        classes: string;
        icon: string;
    };
};
