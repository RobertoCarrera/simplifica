import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TicketsStage } from '../../models/tickets-stage';

@Component({
  selector: 'app-modal-info',
  imports: [CommonModule,FormsModule],
  templateUrl: './modal-info.component.html',
  styleUrl: './modal-info.component.scss'
})
export class ModalInfoComponent{

  @Input() ticket: any;
  @Input() estados: TicketsStage[] = [];
  @Output() close = new EventEmitter<void>();

  constructor(){}

  closeModal(): void{
    this.close.emit();
  }
}
