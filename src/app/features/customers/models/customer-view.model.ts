import { Customer } from '../../../models/customer';

export interface GdprBadgeConfig {
  label: string;
  classes: string;
  icon: string;
}

export interface CustomerView extends Customer {
  initials: string;
  displayName: string;
  avatarGradient: string;
  isComplete: boolean;
  formattedDate: string;
  hasPortalAccess: boolean;
  gdprBadge: GdprBadgeConfig;
  hasPendingRectification: boolean;
  attentionReasonsFormatted: string;
}
