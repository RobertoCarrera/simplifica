import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ChipItem {
    label: string;
    value: any;
    subLabel?: string;
    image?: string;
    type?: 'contact' | 'client' | 'global';
}

@Component({
    selector: 'app-chip-autocomplete',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chip-autocomplete.component.html',
    styleUrls: ['./chip-autocomplete.component.scss']
})
export class ChipAutocompleteComponent {
    @Input() placeholder: string = 'Add recipients...';
    @Input() allItems: ChipItem[] = []; // List to filter manually if not using search event
    @Input() loading: boolean = false;

    // Two-way binding for selection
    @Input() selectedItems: ChipItem[] = [];
    @Output() selectedItemsChange = new EventEmitter<ChipItem[]>();

    @Output() search = new EventEmitter<string>();

    @ViewChild('inputField') inputField!: ElementRef<HTMLInputElement>;

    inputValue: string = '';
    filteredItems: ChipItem[] = [];
    showDropdown: boolean = false;
    activeIndex: number = -1;

    constructor(private el: ElementRef) { }

    onInputChange(value: string) {
        this.inputValue = value;
        this.search.emit(value);

        if (this.allItems.length > 0 && !this.search.observed) {
            // Local filtering logic if no external search
            const term = value.toLowerCase();
            this.filteredItems = this.allItems.filter(item =>
                item.label.toLowerCase().includes(term) ||
                item.subLabel?.toLowerCase().includes(term)
            ).filter(item => !this.isSelected(item));
        } else {
            // Assume parent updates allItems based on search
            this.filteredItems = this.allItems.filter(item => !this.isSelected(item));
        }

        this.showDropdown = true;
        this.activeIndex = -1;
    }

    // Update filtered items when input list changes
    ngOnChanges() {
        if (this.inputValue) {
            this.filteredItems = this.allItems.filter(item => !this.isSelected(item));
        }
    }

    selectItem(item: ChipItem) {
        this.selectedItems = [...this.selectedItems, item];
        this.selectedItemsChange.emit(this.selectedItems);
        this.inputValue = '';
        this.showDropdown = false;
        this.inputField.nativeElement.focus();
        this.filteredItems = [];
    }

    removeChip(index: number) {
        this.selectedItems = this.selectedItems.filter((_, i) => i !== index);
        this.selectedItemsChange.emit(this.selectedItems);
    }

    isSelected(item: ChipItem): boolean {
        return this.selectedItems.some(i => i.value === item.value); // Value based comparison
    }

    onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Backspace' && this.inputValue === '' && this.selectedItems.length > 0) {
            this.removeChip(this.selectedItems.length - 1);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.activeIndex = Math.min(this.activeIndex + 1, this.filteredItems.length - 1);
            this.ensureVisible();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.activeIndex = Math.max(this.activeIndex - 1, 0);
            this.ensureVisible();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.activeIndex >= 0 && this.activeIndex < this.filteredItems.length) {
                this.selectItem(this.filteredItems[this.activeIndex]);
            } else if (this.inputValue.includes('@') && this.isValidEmail(this.inputValue)) {
                // Allow adding raw email
                this.addItemByEmail(this.inputValue);
            }
        } else if (event.key === 'Escape') {
            this.showDropdown = false;
        }
    }

    // Simple visibility check
    ensureVisible() {
        // scroll logic if needed
    }

    @HostListener('document:click', ['$event'])
    onClickOutside(event: Event) {
        if (!this.el.nativeElement.contains(event.target)) {
            this.showDropdown = false;
        }
    }

    focusInput() {
        this.inputField.nativeElement.focus();
    }

    isValidEmail(email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    addItemByEmail(email: string) {
        const newItem: ChipItem = { label: email, value: email, subLabel: email, type: 'contact' };
        this.selectItem(newItem);
    }
}
