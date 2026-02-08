import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnChanges, Output, EventEmitter } from '@angular/core';
import { Project } from '../../../../models/project';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-view.component.html',
  styleUrl: './timeline-view.component.scss'
})
export class TimelineViewComponent implements OnInit, OnChanges {
  @Input() projects: Project[] = [];
  @Output() projectClick = new EventEmitter<Project>();

  months: Date[] = [];
  minDate: Date = new Date();
  maxDate: Date = new Date();
  totalDays = 0;

  ngOnInit() {
    this.calculateTimeline();
  }

  ngOnChanges() {
    this.calculateTimeline();
  }

  calculateTimeline() {
    if (!this.projects.length) return;

    // 1. Find Min and Max dates
    const dates = this.projects.flatMap(p => [
      p.start_date ? new Date(p.start_date) : (p.created_at ? new Date(p.created_at) : new Date()),
      p.end_date ? new Date(p.end_date) : new Date()
    ]);

    if (dates.length === 0) {
      this.minDate = new Date();
      this.maxDate = new Date();
      this.maxDate.setMonth(this.maxDate.getMonth() + 1);
    } else {
      this.minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      this.maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    }

    // Add buffer: 15 days before, 15 days after
    this.minDate.setDate(this.minDate.getDate() - 15);
    this.maxDate.setDate(this.maxDate.getDate() + 15);

    // Normalize to start of day
    this.minDate.setHours(0, 0, 0, 0);
    this.maxDate.setHours(23, 59, 59, 999);

    this.totalDays = (this.maxDate.getTime() - this.minDate.getTime()) / (1000 * 60 * 60 * 24);

    // 2. Generate Months
    this.months = [];
    let current = new Date(this.minDate);
    current.setDate(1); // Start from 1st of month

    while (current <= this.maxDate) {
      this.months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
  }

  getProjectStyle(project: Project): any {
    const start = project.start_date ? new Date(project.start_date) : (project.created_at ? new Date(project.created_at) : new Date());
    const end = project.end_date ? new Date(project.end_date) : new Date(); // Default to today if no end date? Or start + 1 day?

    if (!project.end_date) {
      // If no end date, maybe show a small dot or default 1 day
      end.setDate(start.getDate() + 1);
    }

    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const offset = (start.getTime() - this.minDate.getTime()) / (1000 * 60 * 60 * 24);

    return {
      left: `${(offset / this.totalDays) * 100}%`,
      width: `${Math.max(0.5, (duration / this.totalDays) * 100)}%` // Min 0.5% width
    };
  }

  getPriorityColor(priority?: string): string {
    switch (priority) {
      case 'low': return 'bg-emerald-500';
      case 'medium': return 'bg-blue-500';
      case 'high': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  }

  getClientName(project: Project): string {
    if (!project.client) return 'Sin cliente';
    return project.client.business_name ||
      ((project.client.name || '') + ' ' + (project.client.apellidos || '')).trim() ||
      'Sin nombre';
  }
}
