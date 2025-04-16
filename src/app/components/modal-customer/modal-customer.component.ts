import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer } from '../../models/customer';

@Component({
  selector: 'app-modal-customer',
  imports: [CommonModule, FormsModule],
  templateUrl: './modal-customer.component.html',
  styleUrl: './modal-customer.component.scss'
})
export class ModalCustomerComponent {

  @Input() customer: Customer = {} as Customer;
  @Output() close = new EventEmitter<void>();

  constructor(){}

  closeModal(): void{
    this.close.emit();
  }

}
