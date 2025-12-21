import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-modal.component.html',
  styleUrls: ['./app-modal.component.scss']
})
export class AppModalComponent {
  @Input() visible: boolean = false;
  @Output() close = new EventEmitter<void>();

  backdropClick() {
    this.close.emit();
  }
}
