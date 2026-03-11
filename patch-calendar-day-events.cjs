const fs = require('fs');
const calPath = 'f:/simplifica-copilot/src/app/features/calendar/calendar.component.ts';
let calSource = fs.readFileSync(calPath, 'utf8');

// Replace getCurrentDayEvents() with a computed property
calSource = calSource.replace(
  'private _events = signal<CalendarEvent[]>([]);',
  `private _events = signal<CalendarEvent[]>([]);
  
  // Computed property to safely cache current day's events instead of recreating array every CD cycle
  currentDayEvents = computed(() => {
    return this._events().filter(e => this.isSameDay(e.start, this.currentView().date));
  });`
);

// Replace template occurrences of getCurrentDayEvents() with currentDayEvents()
calSource = calSource.replace(/getCurrentDayEvents\(\)/g, "currentDayEvents()");

fs.writeFileSync(calPath, calSource);
console.log('Calendar patched.');
