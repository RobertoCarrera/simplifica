export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: string;
  description?: string;
  location?: string;
  attendees?: any[];
  type?: 'appointment' | 'meeting' | 'task' | 'reminder';
  draggable?: boolean;
  resourceId?: string;
  resourceName?: string;
  professionalId?: string;
  professionalName?: string;
  extendedProps?: {
    shared?: {
      isLocal?: boolean;
      localBookingId?: string;
      serviceId?: string;
      clientId?: string;
      professionalId?: string;
      resourceId?: string;
      paymentStatus?: string;
      totalPrice?: number;
      currency?: string;
      clientName?: string;
      serviceName?: string;
      professionalName?: string;
      resourceName?: string;
      sessionType?: string;
      source?: string;
      dp_service_unmapped?: boolean;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export interface CalendarView {
  type: 'agenda' | 'month' | 'week' | '3days' | 'day';
  date: Date;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

export interface CalendarEventClick {
  event: CalendarEvent;
  nativeEvent: MouseEvent;
}

export interface CalendarDateClick {
  date: Date;
  allDay: boolean;
  nativeEvent: MouseEvent;
  professional?: any;
}
