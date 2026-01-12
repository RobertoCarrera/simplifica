export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  type?: 'appointment' | 'meeting' | 'task' | 'reminder';
  meta?: any;
  resourceId?: string;
}

export interface CalendarResource {
  id: string;
  title: string;
  color?: string;
  avatar?: string;
}

export interface CalendarView {
  type: 'month' | 'week' | 'day' | 'timeline';
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
}
