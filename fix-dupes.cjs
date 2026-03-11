const fs = require('fs');
const file = 'src/app/features/agenda/agenda.component.ts';
let data = fs.readFileSync(file, 'utf8');

data = data.replace('getTopPosition(hour: number, min: number): string {', `
  printAgenda(prof: Professional) {
      alert('Imprimiendo agenda de: ' + prof.display_name);
  }

  createEvent(prof: Professional, time: string) {
      alert('Crear evento para ' + prof.display_name + ' a las ' + time);
  }

  actionWaitList() {
      alert('Mostrar lista de espera');
  }

  actionBlockDates() {
      alert('Mostrar bloqueo de fechas');
  }

  getTopPosition(hour: number, min: number): string {`);

fs.writeFileSync(file, data);
