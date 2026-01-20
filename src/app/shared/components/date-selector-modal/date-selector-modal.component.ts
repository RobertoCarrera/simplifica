import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type ViewMode = 'calendar' | 'month' | 'year';

@Component({
    selector: 'app-date-selector-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './date-selector-modal.component.html',
    styleUrls: ['./date-selector-modal.component.scss']
})
export class DateSelectorModalComponent implements OnInit, OnChanges {
    @Input() visible: boolean = false;
    @Input() initialDate: Date | string | null = null;
    @Output() close = new EventEmitter<void>();
    @Output() dateSelected = new EventEmitter<string>(); // Returns YYYY-MM-DD

    viewMode: ViewMode = 'calendar';

    // State
    currentDate: Date = new Date(); // The date being navigated (cursor)
    selectedDate: Date | null = null; // The actual selected value

    // Helpers for UI
    weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    years: number[] = []; // Populated for year view

    ngOnInit() {
        this.generateYears();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['visible'] && this.visible) {
            this.resetState();
        }
    }

    resetState() {
        this.viewMode = 'calendar';
        if (this.initialDate) {
            const d = new Date(this.initialDate);
            if (!isNaN(d.getTime())) {
                this.selectedDate = d;
                this.currentDate = new Date(d);
                return;
            }
        }
        this.selectedDate = null;
        this.currentDate = new Date();
    }

    // --- Navigation & View Switching ---

    nextMonth() {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    }

    prevMonth() {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    }

    setMonth(monthIndex: number) {
        this.currentDate = new Date(this.currentDate.getFullYear(), monthIndex, 1);
        this.viewMode = 'calendar';
    }

    setYear(year: number) {
        this.currentDate = new Date(year, this.currentDate.getMonth(), 1);
        this.viewMode = 'calendar'; // Or go to month view? Calendar is usually fine.
    }

    switchToYearView() {
        this.viewMode = 'year';
        // Center years around current cursor
        this.generateYears();
    }

    switchToMonthView() {
        this.viewMode = 'month';
    }

    // --- Selection ---

    selectDate(day: number) {
        this.selectedDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
        this.confirm();
    }

    selectToday() {
        this.selectedDate = new Date();
        this.currentDate = new Date();
        this.confirm();
    }

    clear() {
        this.selectedDate = null;
        this.dateSelected.emit('');
        this.close.emit();
    }

    confirm() {
        if (this.selectedDate) {
            // Format YYYY-MM-DD using standard JS to avoid timezone issues (naive approach)
            const offsetDate = new Date(this.selectedDate.getTime() - this.selectedDate.getTimezoneOffset() * 60000);
            const dateStr = offsetDate.toISOString().split('T')[0];
            this.dateSelected.emit(dateStr);
        } else {
            this.dateSelected.emit('');
        }
        this.close.emit();
    }

    onBackdropClick() {
        this.close.emit();
    }

    // --- Calendar Grid Generation ---

    get calendarDays(): (number | null)[] {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // First day of month. 0=Sun, 1=Mon...
        // We want Monday start.
        const firstDay = new Date(year, month, 1).getDay();
        // 0 (Sun) -> 6, 1 (Mon) -> 0...
        const startOffset = (firstDay + 6) % 7;

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days: (number | null)[] = [];
        for (let i = 0; i < startOffset; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);

        return days;
    }

    generateYears() {
        const currentYear = this.currentDate.getFullYear();
        const start = currentYear - 50;
        const end = currentYear + 10;
        this.years = [];
        for (let y = start; y <= end; y++) {
            this.years.push(y);
        }
        // Sort descending for birth dates? Or ascending? Ascending is standard.
        // For birth dates, maybe we want to scroll to the relevant part.
    }

    isSelected(day: number): boolean {
        if (!this.selectedDate) return false;
        return this.selectedDate.getDate() === day &&
            this.selectedDate.getMonth() === this.currentDate.getMonth() &&
            this.selectedDate.getFullYear() === this.currentDate.getFullYear();
    }

    isToday(day: number): boolean {
        const today = new Date();
        return day === today.getDate() &&
            this.currentDate.getMonth() === today.getMonth() &&
            this.currentDate.getFullYear() === today.getFullYear();
    }
}
