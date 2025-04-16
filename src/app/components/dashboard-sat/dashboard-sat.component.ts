import { CommonModule } from '@angular/common';
import { Component, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BtnNewComponent } from '../btn-new/btn-new.component';
import { Ticket } from '../../models/ticket';
import { TicketsService } from '../../services/tickets.service';
import { ModalTicketsComponent } from '../modal-tickets/modal-tickets.component';
import { TicketsStage } from '../../models/tickets-stage';
import { TicketStagesService } from '../../services/ticket-stages.service';

@Component({
  selector: 'app-dashboard-sat',
  imports: [FormsModule, CommonModule, BtnNewComponent, ModalTicketsComponent],
  templateUrl: './dashboard-sat.component.html',
  styleUrl: './dashboard-sat.component.scss'
})
export class DashboardSatComponent implements OnInit{

  @Output() estados: TicketsStage [] = [];
  
  tickets: Ticket[] = [];
  selectedTicket: Ticket | null = null;
  searchTicket: string = '';

  constructor(private ticketsService: TicketsService,
              private ticketStageService: TicketStagesService){}

  ngOnInit(): void{
    this.ticketsService.getTickets().subscribe( ticket => {
      this.tickets = ticket;
    });
    this.ticketStageService.getStages().subscribe(stages => {
      this.estados = stages;
    });
  }

  filterTickets(): Ticket[]{
    if(!this.searchTicket.trim()){
      return this.tickets;
    }

    const searchTerm = this.removeAccents(this.searchTicket.toLowerCase().trim());

    return this.tickets.filter(ticket => {

      const opcionesMes: Intl.DateTimeFormatOptions = { month: "long" };// Para obtener el nombre del mes en español
      const normalize = (text: string) => this.removeAccents(text.toLowerCase());

      // Convertir la fecha a formatos buscables
      const fechaVencimiento = new Date(ticket.fecha_vencimiento);
      // Extraer datos de fecha de vencimiento
      const diaVencimiento = fechaVencimiento.getDate().toString();
      const mesNumVencimiento = (fechaVencimiento.getMonth() + 1).toString().padStart(2, '0');
      const mesNombreVencimiento = fechaVencimiento.toLocaleDateString('es-ES', opcionesMes);
      const añoVencimiento = fechaVencimiento.getFullYear().toString();
  
      // Convertir la fecha a formatos buscables
      const fechaCreacion = new Date(ticket.created_at);
      // Extraer datos de fecha de creación
      const diaCreacion = fechaCreacion.getDate().toString();
      const mesNumCreacion = (fechaCreacion.getMonth() + 1).toString().padStart(2, '0');
      const mesNombreCreacion = fechaCreacion.toLocaleDateString('es-ES', opcionesMes);
      const añoCreacion = fechaCreacion.getFullYear().toString();
  
      // Formatos buscables de fecha de vencimiento
      const fechaVencimientoFormateada1 = `${diaVencimiento}/${mesNumVencimiento}/${añoVencimiento}`;
      const fechaVencimientoFormateada2 = `${mesNombreVencimiento} ${diaVencimiento}, ${añoVencimiento}`;
      const fechaVencimientoFormateada3 = `${diaVencimiento} ${mesNombreVencimiento} ${añoVencimiento}`;
  
      // Formatos buscables de fecha de creación
      const fechaCreacionFormateada1 = `${diaCreacion}/${mesNumCreacion}/${añoCreacion}`;
      const fechaCreacionFormateada2 = `${mesNombreCreacion} ${diaCreacion}, ${añoCreacion}`;
      const fechaCreacionFormateada3 = `${diaCreacion} ${mesNombreCreacion} ${añoCreacion}`;
      
      // Filtrar por servicios
      const serviciosMatch = ticket.servicios.some(servicio => 
        normalize(servicio.trabajo.nombre || '').startsWith(searchTerm) ||
        normalize(servicio.producto?.nombre || '').startsWith(searchTerm)
      );

      return  (
        normalize(ticket.created_at.toString()).startsWith(searchTerm) ||
        normalize(ticket.contador.toString()).startsWith(searchTerm) ||
        normalize(ticket.cliente.dni.toLowerCase()).startsWith(searchTerm) ||
        normalize(ticket.cliente.nombre.toLowerCase()).startsWith(searchTerm) ||
        normalize(ticket.cliente.apellidos.toLowerCase()).includes(searchTerm) ||
        normalize(ticket.fecha_vencimiento.toString()).startsWith(searchTerm) ||
        normalize(ticket.estado.nombre.toLowerCase()).startsWith(searchTerm) ||
        serviciosMatch ||
        // Filtrar por fecha de vencimiento
        normalize(fechaVencimientoFormateada1).includes(searchTerm) ||
        normalize(fechaVencimientoFormateada2).toLowerCase().includes(searchTerm) ||
        normalize(fechaVencimientoFormateada3).toLowerCase().includes(searchTerm) ||
        // Filtrar por fecha de creación
        normalize(fechaCreacionFormateada1).includes(searchTerm) ||
        normalize(fechaCreacionFormateada2).toLowerCase().includes(searchTerm) ||
        normalize(fechaCreacionFormateada3).toLowerCase().includes(searchTerm)
      );
    });
  }

  // Función para eliminar tildes
  removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  openTicketModal(ticket: Ticket): void{
    this.selectedTicket = ticket;
  }

  closeTicketModal(): void{
    this.selectedTicket = null;
  }
}