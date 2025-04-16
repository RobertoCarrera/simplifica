import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TicketsStage } from '../../models/tickets-stage';
import { Customer } from '../../models/customer';
import { ModalCustomerComponent } from '../modal-customer/modal-customer.component';
import { Ticket } from '../../models/ticket';

@Component({
  selector: 'app-modal-tickets',
  imports: [CommonModule, FormsModule, ModalCustomerComponent],
  templateUrl: './modal-tickets.component.html',
  styleUrl: './modal-tickets.component.scss'
})
export class ModalTicketsComponent implements OnInit {

  @Input() ticket: Ticket = {} as Ticket;
  @Input() estados: TicketsStage[] = [];
  @Output() close = new EventEmitter<void>();
  showCustomerModal: boolean = false;
  selectedCustomer: Customer | null = null;

  ngOnInit(): void {
    this.selectedCustomer = this.ticket.cliente;
  }

  openCustomerModal(customer: Customer) {
    this.selectedCustomer = customer;
    this.showCustomerModal = true;
  }

  closeCustomerModal() {
    this.showCustomerModal = false;
    this.selectedCustomer = null;
  }

  closeTicket(): void {
    this.close.emit();
  }
}