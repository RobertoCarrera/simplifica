import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TicketsStage } from '../../models/tickets-stage';
import { TicketStagesService } from '../../services/ticket-stages.service';

@Component({
  selector: 'app-modal-info',
  imports: [CommonModule,FormsModule],
  templateUrl: './modal-info.component.html',
  styleUrl: './modal-info.component.scss'
})
export class ModalInfoComponent implements OnInit {

  @Input() ticket: any;
  @Output() close = new EventEmitter<void>();
  estados: TicketsStage [] = [];

  constructor(private ticketStageService: TicketStagesService){}

  ngOnInit(): void {
    this.ticketStageService.getStages().subscribe((stages: TicketsStage[]) => {
      this.estados = stages;
    });
    console.log(this.ticket);
  }

  closeModal(): void{
    this.close.emit();
  }
}
