import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EmployeeService, Employee, EmployeeDocument } from '../../../core/services/employee.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './employee-detail.component.html',
  styleUrls: ['./employee-detail.component.scss']
})
export class EmployeeDetailComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private employeeService = inject(EmployeeService);
  private authService = inject(AuthService);
  private toastElement = inject(ToastService); // Assuming generic toast service usage

  activeTab = signal<'profile' | 'documents'>('profile');
  isEditing = signal(false);
  loading = signal(false);
  uploading = signal(false);

  employeeId: string | null = null;
  documents = signal<EmployeeDocument[]>([]);

  form = this.fb.group({
    // User Link (Optional/Later)
    // Personal
    nif: ['', Validators.required],
    social_security_number: [''],
    iban: [''],

    // Job
    job_title: ['', Validators.required],
    hire_date: ['', Validators.required],
    contract_type: ['indefinido', Validators.required],
    salary_base: [0],
    commission_rate: [0],
    is_active: [true]
  });

  async ngOnInit() {
    this.employeeId = this.route.snapshot.paramMap.get('id');

    if (this.employeeId && this.employeeId !== 'new') {
      this.isEditing.set(true);
      await this.loadEmployee(this.employeeId);
      await this.loadDocuments(this.employeeId);
    }
  }

  async loadEmployee(id: string) {
    // For now, re-using getEmployees filtered, or we should add getEmployeeById to service
    // Assuming we fetch list and find (or add getById)
    // Quick fix: fetch all and find (not efficient but checking service) via service method
    // Wait, let's implement getEmployeeById in service or use single query here?
    // Let's use getEmployees for now as logic is simple or just direct query if needed. 
    // Actually, createEmployee returns data, update returns data.
    // Let's just assume we can get it.
    // For MVP, if service missing getById, I'll add it or query manually here?
    // Service has generic queries. I'll add a helper or just query manually if I could.
    // Let's rely on list for now or route resolves.

    // Better: Add getById to service. But for now I will try to use logic from list or just fetch directly.
    // Let's use the filtering from list if cached? No.
    // Let's just add logic to fetch.

    // I'll assume we can pass ID to getEmployees? No. 
    // Let's assume user Navigates from list.
    // I'll implement proper fetch in next step if it fails.

    // TEMPORARY: fetch all and find. 
    const cid = this.authService.companyId();
    if (cid) {
      this.employeeService.getEmployees(cid).subscribe(emps => {
        const emp = emps.find(e => e.id === id);
        if (emp) {
          this.form.patchValue({
            nif: emp.nif,
            social_security_number: emp.social_security_number,
            iban: emp.iban,
            job_title: emp.job_title,
            hire_date: emp.hire_date,
            contract_type: emp.contract_type || 'indefinido',
            salary_base: emp.salary_base,
            commission_rate: emp.commission_rate,
            is_active: emp.is_active
          });
        }
      });
    }
  }

  async loadDocuments(id: string) {
    try {
      const docs = await this.employeeService.getDocuments(id);
      this.documents.set(docs);
    } catch (e) {
      console.error('Error loading documents', e);
    }
  }

  async save() {
    if (this.form.invalid) return;
    this.loading.set(true);

    const data = this.form.value as Partial<Employee>;
    const cid = this.authService.companyId();
    if (!cid) return;

    try {
      if (this.isEditing() && this.employeeId) {
        await this.employeeService.updateEmployee(this.employeeId, data);
        this.toastElement.success('Empleado actualizado', 'El perfil ha sido guardado correctamente');
      } else {
        // New
        await this.employeeService.createEmployee({
          ...data,
          company_id: cid
        });
        this.toastElement.success('Empleado creado', 'Nuevo miembro del equipo añadido');
        this.router.navigate(['/rrhh/empleadas']);
      }
    } catch (e) {
      console.error(e);
      this.toastElement.error('Error al guardar', 'No se pudo guardar el perfil');
    } finally {
      this.loading.set(false);
    }
  }

  // Document Methods
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || !this.employeeId) return;

    this.uploading.set(true);
    const cid = this.authService.companyId();
    if (!cid) return;

    try {
      await this.employeeService.uploadDocument(this.employeeId, cid, file);
      this.toastElement.success('Documento subido', 'El archivo se ha guardado correctamente');
      await this.loadDocuments(this.employeeId);
    } catch (e) {
      console.error(e);
      this.toastElement.error('Error al subir documento', 'Falló la subida del archivo');
    } finally {
      this.uploading.set(false);
    }
  }

  async download(doc: EmployeeDocument) {
    const url = await this.employeeService.getDownloadUrl(doc.file_path);
    if (url) window.open(url, '_blank');
  }

  async deleteDoc(doc: EmployeeDocument) {
    if (!confirm('¿Seguro que quieres eliminar este documento?')) return;
    try {
      await this.employeeService.deleteDocument(doc.id, doc.file_path);
      this.toastElement.success('Documento eliminado', 'El archivo ha sido borrado');
      if (this.employeeId) await this.loadDocuments(this.employeeId);
    } catch (e) {
      this.toastElement.error('Error al eliminar', 'No se pudo eliminar el documento');
    }
  }
}
