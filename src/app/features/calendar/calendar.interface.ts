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
}

export interface CalendarView {
  type: 'month' | 'week' | '3days' | 'day';
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
