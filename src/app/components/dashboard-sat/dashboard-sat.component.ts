import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BtnNewComponent } from '../btn-new/btn-new.component';
import { Service } from '../../models/service';
import { ServicesService } from '../../services/services.service';

@Component({
  selector: 'app-dashboard-sat',
  imports: [FormsModule, CommonModule, BtnNewComponent],
  templateUrl: './dashboard-sat.component.html',
  styleUrl: './dashboard-sat.component.scss'
})
export class DashboardSatComponent implements OnInit{

  services: Service[] = [];
  
  searchService: string = '';

  constructor(private servicesService: ServicesService){}

  ngOnInit(): void{
    this.servicesService.getServices().subscribe( service => {
      this.services = service;
    });
  }

  filterServices(): Service[]{
    if(!this.searchService.trim()){
      return this.services;
    }

    const searchTerm = this.removeAccents(this.searchService.toLowerCase().trim());

    return this.services.filter(service => {

      const opcionesMes: Intl.DateTimeFormatOptions = { month: "long" };// Para obtener el nombre del mes en español
      const normalize = (text: string) => this.removeAccents(text.toLowerCase());

      // Convertir la fecha a formatos buscables
      const fechaVencimiento = new Date(service.fecha_vencimiento);
      // Extraer datos de fecha de vencimiento
      const diaVencimiento = fechaVencimiento.getDate().toString();
      const mesNumVencimiento = (fechaVencimiento.getMonth() + 1).toString().padStart(2, '0');
      const mesNombreVencimiento = fechaVencimiento.toLocaleDateString('es-ES', opcionesMes);
      const añoVencimiento = fechaVencimiento.getFullYear().toString();
  
      // Convertir la fecha a formatos buscables
      const fechaCreacion = new Date(service.created_at);
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

      return  (
        normalize(service.created_at.toString()).startsWith(searchTerm) ||
        normalize(service.contador.toString()).startsWith(searchTerm) ||
        normalize(service.cliente.dni.toLowerCase()).startsWith(searchTerm) ||
        normalize(service.cliente.nombre.toLowerCase()).startsWith(searchTerm) ||
        normalize(service.cliente.apellidos.toLowerCase()).includes(searchTerm) ||
        normalize(service.fecha_vencimiento.toString()).startsWith(searchTerm) ||
        normalize(service.estado.toString()).includes(searchTerm) || 
        (service.categorias?.some(cat => normalize(cat.nombre).includes(searchTerm)) ?? false) ||
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
}