getDateForWeekDay(dayName: string): Date {
    const dayIndex = this.getWeekDayIndex(dayName);
    const viewDate = this.currentView().date;
    const weekStart = this.getWeekStart(viewDate);

    // weekStart is Monday (based on valid logic).
    // If weekStart is Monday (1), and dayIndex is 0 (Sunday), we need to adjust.
    // However, getWeekStart usually returns the first day of the visual week (Monday).

    const date = new Date(weekStart);
    // My weekDays array is ['Lun', 'Mar', ..., 'Dom']
    // visibleWeekDays filters this.

    // If I iterate currentWeekDays, I get 'Lun', 'Mar' etc.
    // I need to find the offset from the START of the week.

    const weekStartDayIndex = 1; // Monday

    // Calculate difference
    // If dayName is 'Lun' (1), and weekStart is Monday -> diff 0
    // If dayName is 'Dom' (0), and weekStart is Monday -> diff 6

    let diff = dayIndex - weekStartDayIndex;
    if (diff < 0) diff += 7;

    date.setDate(date.getDate() + diff);
    return date;
}
