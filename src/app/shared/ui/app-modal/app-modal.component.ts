import { Component, EventEmitter, Input, Output, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-modal.component.html',
  styleUrls: ['./app-modal.component.scss']
})
export class AppModalComponent implements OnChanges, OnDestroy {
  @Input() visible: boolean = false;
  @Input() dismissible: boolean = true;
  @Output() close = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']) {
      if (this.visible) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
  }

  backdropClick() {
    if (this.dismissible) {
      this.close.emit();
    }
  }
}
