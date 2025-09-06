export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system' | 'reminder';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'ticket' | 'customer' | 'system' | 'reminder' | 'workflow' | 'general';
  actionUrl?: string;
  actionLabel?: string;
  metadata?: {
    ticketId?: string;
    customerId?: string;
    companyId?: string;
    userId?: string;
    [key: string]: any;
  };
  expiresAt?: Date;
  persistent?: boolean;
}

export interface NotificationSettings {
  id: string;
  userId: string;
  categories: {
    ticket: NotificationCategorySettings;
    customer: NotificationCategorySettings;
    system: NotificationCategorySettings;
    reminder: NotificationCategorySettings;
    workflow: NotificationCategorySettings;
    general: NotificationCategorySettings;
  };
  generalSettings: {
    sound: boolean;
    desktop: boolean;
    email: boolean;
    sms: boolean;
    inApp: boolean;
    dailyDigest: boolean;
    quietHours: {
      enabled: boolean;
      start: string; // HH:mm format
      end: string;   // HH:mm format
    };
  };
}

export interface NotificationCategorySettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  frequency: 'instant' | 'hourly' | 'daily' | 'weekly';
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: Notification['category'];
  priority: Notification['priority'];
  conditions: NotificationCondition[];
  actions: NotificationAction[];
  schedule?: {
    type: 'immediate' | 'delayed' | 'scheduled';
    delay?: number; // minutes
    time?: string;  // HH:mm format for scheduled
    days?: string[]; // ['monday', 'tuesday', ...] for recurring
  };
}

export interface NotificationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface NotificationAction {
  type: 'inApp' | 'email' | 'sms' | 'desktop' | 'webhook';
  enabled: boolean;
  config?: {
    [key: string]: any;
  };
}

export interface NotificationStats {
  total: number;
  unread: number;
  byCategory: Record<Notification['category'], number>;
  byPriority: Record<Notification['priority'], number>;
  byType: Record<Notification['type'], number>;
  todayCount: number;
  weekCount: number;
  monthCount: number;
}

export interface NotificationFilter {
  category?: Notification['category'][];
  type?: Notification['type'][];
  priority?: Notification['priority'][];
  read?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  category: Notification['category'];
  type: Notification['type'];
  title: string;
  message: string;
  variables: string[]; // Variables that can be replaced like {{customerName}}
  priority: Notification['priority'];
  persistent: boolean;
  actionLabel?: string;
  actionUrl?: string;
}
