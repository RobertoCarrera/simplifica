import { Component, Input, numberAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-skeleton-loader',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './skeleton-loader.component.html',
    styleUrls: ['./skeleton-loader.component.scss']
})
export class SkeletonLoaderComponent {
    @Input({ transform: numberAttribute }) count: number = 1;
    @Input() type: 'text' | 'card' | 'table-row' | 'block' | 'circle' = 'block';
    @Input() width: string = '100%';
    @Input() height: string = '1rem'; // Default height for text blocks
    @Input() styleClass: string = '';

    get items(): number[] {
        return Array(this.count).fill(0);
    }
}
