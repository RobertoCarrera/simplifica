import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EmployeeService, Employee, EmployeeDocument, CommissionConfig, Service } from '../../../core/services/employee.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ThemeService } from '../../../services/theme.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { lastValueFrom } from 'rxjs';

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
  private toastElement = inject(ToastService);
  private themeService = inject(ThemeService);
  private modulesService = inject(SupabaseModulesService);

  activeTab = signal<'profile' | 'documents' | 'commissions'>('profile');
  isEditing = signal(false);
  loading = signal(false);
  uploading = signal(false);

  employeeId: string | null = null;
  documents = signal<EmployeeDocument[]>([]);
  commissionsConfig = signal<CommissionConfig[]>([]);
  availableServices = signal<Service[]>([]);

  // Module Access
  hasHRAccess = signal(false);
  loadingModuleAccess = signal(false);
  private targetUserId: string | null = null;

  form = this.fb.group({
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

    const cid = this.authService.companyId();
    if (cid) {
      this.employeeService.getServices(cid).then(s => this.availableServices.set(s));
    }

    if (this.employeeId && this.employeeId !== 'new') {
      this.isEditing.set(false);
      await this.loadEmployee(this.employeeId);
      await this.loadDocuments(this.employeeId);
      await this.loadCommissions(this.employeeId);
    } else {
      this.isEditing.set(true);
    }
  }

  toggleEdit() {
    this.isEditing.set(!this.isEditing());
  }

  async loadEmployee(id: string) {
    this.loading.set(true);
    const cid = this.authService.companyId();
    if (!cid) return;

    this.employeeService.getEmployees(cid).subscribe(async (emps) => {
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
        this.targetUserId = emp.user_id || null;

        if (this.targetUserId) {
          await this.loadModuleAccess();
        }
      }
      this.loading.set(false);
    });
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
      if (this.employeeId && this.employeeId !== 'new') {
        await this.employeeService.updateEmployee(this.employeeId, data);
        this.toastElement.success('Empleado actualizado', 'El perfil ha sido guardado correctamente');
        this.isEditing.set(false);
      } else {
        const newEmp = await this.employeeService.createEmployee({
          ...data,
          company_id: cid
        });
        this.toastElement.success('Empleado creado', 'Nuevo miembro del equipo añadido');
        this.router.navigate(['/rrhh/empleadas', newEmp.id]);
      }
    } catch (e) {
      console.error(e);
      this.toastElement.error('Error al guardar', 'No se pudo guardar el perfil');
    } finally {
      this.loading.set(false);
    }
  }

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

  async loadCommissions(id: string) {
    try {
      const commissions = await this.employeeService.getCommissionsConfig(id);
      this.commissionsConfig.set(commissions);
    } catch (e) {
      console.error("Error loading commissions", e);
    }
  }

  async addCommission(serviceId: string, percentage: string | number, fixed: string | number) {
    if (!this.employeeId) return;
    const cid = this.authService.companyId();
    if (!cid) return;

    const numPercentage = Number(percentage);
    const numFixed = Number(fixed);

    try {
      await this.employeeService.upsertCommissionConfig({
        company_id: cid,
        employee_id: this.employeeId,
        service_id: serviceId,
        commission_percentage: numPercentage,
        fixed_amount: numFixed
      });
      this.toastElement.success('Comisión guardada', 'Configuración actualizada');
      await this.loadCommissions(this.employeeId);
    } catch (e) {
      console.error(e);
      this.toastElement.error('Error', 'No se pudo guardar la comisión');
    }
  }

  async removeCommission(id: string) {
    if (!confirm('¿Eliminar esta configuración de comisión?')) return;
    try {
      if (!id) return;
      await this.employeeService.deleteCommissionConfig(id);
      this.toastElement.success('Eliminado', 'Configuración de comisión eliminada');
      if (this.employeeId) await this.loadCommissions(this.employeeId);
    } catch (e) {
      this.toastElement.error('Error', 'No se pudo eliminar');
    }
  }

  async loadModuleAccess() {
    if (!this.targetUserId) return;

    this.loadingModuleAccess.set(true);
    try {
      const cid = this.authService.companyId();
      const { assignments } = await lastValueFrom(this.modulesService.adminListUserModules(cid));

      if (assignments) {
        const access = assignments.some((a: any) =>
          a.user_id === this.targetUserId &&
          a.module_key === 'moduloRRHH' &&
          a.status === 'activado'
        );
        this.hasHRAccess.set(access);
      }
    } catch (e) {
      console.error('Error loading module access', e);
    } finally {
      this.loadingModuleAccess.set(false);
    }
  }

  async toggleHRAccess(enable: boolean) {
    if (!this.targetUserId) return;

    this.loadingModuleAccess.set(true);
    try {
      await this.modulesService.adminSetUserModule(this.targetUserId, 'moduloRRHH', enable ? 'activado' : 'desactivado');
      this.hasHRAccess.set(enable);
      this.toastElement.success('Acceso actualizado', `Módulo RRHH ${enable ? 'activado' : 'desactivado'}`);
    } catch (e) {
      console.error(e);
      this.toastElement.error('Error', 'No se pudo actualizar el acceso');
      this.hasHRAccess.set(!enable);
    } finally {
      this.loadingModuleAccess.set(false);
    }
  }
}
