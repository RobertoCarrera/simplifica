import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { EmployeeService, Employee } from '../../../core/services/employee.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './employee-list.component.html',
  styleUrls: ['./employee-list.component.scss']
})
export class EmployeeListComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService); // Ensure theme service is active if needed

  employees = signal<Employee[]>([]);
  loading = signal(true);

  // Track companyId
  companyId = this.authService.companyId;

  async ngOnInit() {
    this.loadEmployees();
  }

  loadEmployees() {
    const cid = this.companyId();
    if (!cid) return;

    this.loading.set(true);
    this.employeeService.getEmployees(cid).subscribe({
      next: (data) => {
        this.employees.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading employees', err);
        this.loading.set(false);
      }
    });
  }

  getInitials(name: string): string {
    return name
      ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : 'E';
  }
}
