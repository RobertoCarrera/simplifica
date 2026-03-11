const fs = require('fs');

const agendaTs = 'f:/simplifica-copilot/src/app/features/agenda/agenda.component.ts';
let tsSource = fs.readFileSync(agendaTs, 'utf8');

// Replace shouldShowEvent to be safer
tsSource = tsSource.replace(
  'return this.selectedResourceIds().has(event.resourceId);',
  'if (this.resources().length === 0) return true; // Show until resources loaded\n    return this.selectedResourceIds().has(event.resourceId);'
);

// Add isEventForProfessional method
if (!tsSource.includes('isEventForProfessional')) {
    tsSource = tsSource.replace(
      'shouldShowEvent(event: CalendarEvent): boolean {',
      `// Resolves missing professionalId specifically for external events or misaligned syncs
  isEventForProfessional(event: CalendarEvent, profId: string): boolean {
    const pId = event.professionalId || (event as any).extendedProps?.shared?.professionalId;
    
    if (pId) return pId === profId;
    
    // If it STILL has no professionalId, maybe it's purely external meeting. 
    // Show it in the first professional's column for visibility? 
    // Or we strictly return false if it's meant to be orphaned. 
    // Let's check if the first professional in the array matches profId.
    const validProfs = this.filteredProfessionals();
    if (validProfs.length > 0 && validProfs[0].id === profId) {
        return true; 
    }
    return false;
  }

  shouldShowEvent(event: CalendarEvent): boolean {`
    );
}

fs.writeFileSync(agendaTs, tsSource);

const agendaHtml = 'f:/simplifica-copilot/src/app/features/agenda/agenda.component.html';
let htmlSource = fs.readFileSync(agendaHtml, 'utf8');

// Replace conditions
htmlSource = htmlSource.replace(
  '@if (event.professionalId === prof.id && shouldShowEvent(event)) {',
  '@if (isEventForProfessional(event, prof.id) && shouldShowEvent(event)) {'
);

fs.writeFileSync(agendaHtml, htmlSource);
console.log('Agenda patched');
