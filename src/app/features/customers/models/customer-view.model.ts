import { Customer } from '../../../models/customer';

export interface GdprBadgeConfig {
  label: string;
  classes: string;
  icon: string;
}

export interface CustomerView extends Customer {
  displayName: string;
  initials: string;
  avatarGradient: string;
  formattedDate: string;
  isComplete: boolean;
  attentionReasons: string;
  hasPortalAccess: boolean;
  gdprBadge: GdprBadgeConfig;
  hasPendingRectification: boolean;
}
