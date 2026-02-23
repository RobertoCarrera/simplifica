
onEventDrop(event: CdkDragDrop<any, any, any>) {
    const droppedEvent = event.item.data as CalendarEvent;

    // Check if draggable
    if (droppedEvent.draggable === false) return;

    const newDate = event.container.data as Date;

    // Calculate time difference
    const originalStart = new Date(droppedEvent.start);
    const duration = droppedEvent.end.getTime() - originalStart.getTime();

    let newStartTime = new Date(newDate);

    // If dropped in Month View (just date change)
    if (this.currentView().type === 'month') {
        newStartTime.setHours(originalStart.getHours());
        newStartTime.setMinutes(originalStart.getMinutes());
    }
    // If dropped in Week/Day View (time calculation)
    else {
        // We need to calculate based on Y position
        // This is handled by cdkDragFreeDragPosition or standard list sorting
        // For exact time drop, we often rely on the drop point in the container.
        // However, with CdkDropList per day/hour, we only get the Container Date.
        // To get precise time, we can use the element's offset in the container.

        const distanceInPixels = event.distance.y;
        const hourHeight = 60;
        // This is tricker with standard CDK lists. 
        // Detailed implementation below.

        // Simplified approach for initial version:
        // If dropping into a 'Day Column', we rely on the drop index if items were sorted, 
        // but here events are absolute.

        // BETTER: Use pointer position relative to the container.
        const dropPoint = event.dropPoint;
        const containerRect = event.container.element.nativeElement.getBoundingClientRect();
        const offsetY = dropPoint.y - containerRect.top;

        const startHour = this.constraints?.minHour || 0;
        const hoursFromTop = offsetY / 60; // 60px per hour
        const preciseHour = startHour + hoursFromTop;

        const h = Math.floor(preciseHour);
        const m = Math.round((preciseHour - h) * 60);

        // Snap to 15 mins
        const snappedM = Math.round(m / 15) * 15;

        newStartTime.setHours(h);
        newStartTime.setMinutes(snappedM);
    }

    const newEndTime = new Date(newStartTime.getTime() + duration);

    // Update event
    const updatedEvent = {
        ...droppedEvent,
        start: newStartTime,
        end: newEndTime
    };

    // Optimistic update
    this.eventChange.emit(updatedEvent);

    // Check constraints?
    // Parent component should handle validation and saving, and pass back updated events.
}
