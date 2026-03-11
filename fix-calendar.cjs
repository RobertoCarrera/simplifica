const fs = require('fs');
const path = 'f:/simplifica-copilot/src/app/features/calendar/calendar.component.ts';
let src = fs.readFileSync(path, 'utf8');

src = src.replace('currentDayEvents() { return this.getEventsForDate(this.currentView().date); }', '');

fs.writeFileSync(path, src);
