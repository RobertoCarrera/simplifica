// ==== CONFIGURACIÓN DE SUPABASE ====
// 1. Instalar dependencias:
// npm install @supabase/supabase-js

export const environment = {
  production: false,
  supabase: {
    url: 'YOUR_SUPABASE_PROJECT_URL', // https://xxxxx.supabase.co
    anonKey: 'YOUR_SUPABASE_ANON_KEY'  // Anon key de tu proyecto
  }
};

// ==== CREDENCIALES ====
// 1. Ve a tu proyecto en https://app.supabase.com
// 2. Ve a Settings → API
// 3. Copia:
//    - Project URL → url
//    - anon/public key → anonKey

// ==== CONFIGURACIÓN EN ANGULAR ====
// Reemplaza en src/app/services/supabase.service.ts líneas 110-113:

/*
this.supabase = createClient<Database>(
  environment.supabase.url,
  environment.supabase.anonKey
);
*/

// ==== EJEMPLO DE USO EN COMPONENTS ====

/*
// 1. En app.component.ts - manejo de autenticación:
import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './services/supabase.service';
import { CompanyMultiTenantService } from './services/company-multi-tenant.service';

@Component({
  selector: 'app-root',
  template: `
    <div *ngIf="!isLoggedIn">
      <!-- Login form -->
      <form (ngSubmit)="login()">
        <input [(ngModel)]="email" placeholder="Email" type="email">
        <input [(ngModel)]="password" placeholder="Password" type="password">
        <button type="submit">Login</button>
      </form>
    </div>

    <div *ngIf="isLoggedIn">
      <!-- Company selector -->
      <select (change)="switchCompany($event)">
        <option value="">Seleccionar empresa...</option>
        <option *ngFor="let company of companies" [value]="company.id">
          {{company.name}}
        </option>
      </select>

      <!-- Main app content -->
      <router-outlet></router-outlet>
    </div>
  `
})
export class AppComponent implements OnInit {
  email = '';
  password = '';
  isLoggedIn = false;
  companies: any[] = [];

  constructor(
    private supabase: SupabaseService,
    private companyService: CompanyMultiTenantService
  ) {}

  ngOnInit() {
    this.supabase.user$.subscribe(user => {
      this.isLoggedIn = !!user;
      if (user) {
        this.loadCompanies();
      }
    });
  }

  async login() {
    const { error } = await this.supabase.signIn(this.email, this.password);
    if (error) {
      alert(error.message);
    }
  }

  loadCompanies() {
    this.companyService.getUserCompanies().subscribe(companies => {
      this.companies = companies;
    });
  }

  switchCompany(event: any) {
    const companyId = event.target.value;
    if (companyId) {
      this.companyService.switchToCompany(companyId).subscribe();
    }
  }
}

// 2. En clients.component.ts - manejo de clientes:
import { Component, OnInit } from '@angular/core';
import { ClientsMultiTenantService } from '../services/clients-multi-tenant.service';

@Component({
  selector: 'app-clients',
  template: `
    <div>
      <h2>Clientes</h2>
      
      <button (click)="createClient()">Nuevo Cliente</button>
      
      <div *ngFor="let client of clients">
        <h3>{{client.name}}</h3>
        <p>{{client.email}}</p>
        <button (click)="editClient(client)">Editar</button>
        <button (click)="deleteClient(client.id)">Eliminar</button>
      </div>
    </div>
  `
})
export class ClientsComponent implements OnInit {
  clients: any[] = [];

  constructor(private clientsService: ClientsMultiTenantService) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    this.clientsService.getClients().subscribe(clients => {
      this.clients = clients;
    });
  }

  createClient() {
    const clientData = {
      name: 'Nuevo Cliente',
      email: 'nuevo@cliente.com'
    };

    this.clientsService.createClient(clientData).subscribe(client => {
      this.clients.push(client);
    });
  }

  deleteClient(id: string) {
    this.clientsService.deleteClient(id).subscribe(() => {
      this.clients = this.clients.filter(c => c.id !== id);
    });
  }
}

// 3. En jobs.component.ts - manejo de servicios con archivos:
import { Component, OnInit } from '@angular/core';
import { JobsMultiTenantService } from '../services/jobs-multi-tenant.service';

@Component({
  selector: 'app-jobs',
  template: `
    <div>
      <h2>Servicios</h2>
      
      <div *ngFor="let job of jobs">
        <h3>{{job.title}}</h3>
        <p>Cliente: {{job.client_name}}</p>
        <p>Estado: {{job.status}}</p>
        
        <input type="file" (change)="onFileSelected($event, job.id)" multiple>
        
        <div *ngFor="let attachment of job.attachments">
          <a [href]="attachment.url" target="_blank">{{attachment.file_name}}</a>
        </div>
      </div>
    </div>
  `
})
export class JobsComponent implements OnInit {
  jobs: any[] = [];

  constructor(private jobsService: JobsMultiTenantService) {}

  ngOnInit() {
    this.loadJobs();
  }

  loadJobs() {
    this.jobsService.getJobs().subscribe(jobs => {
      this.jobs = jobs;
      // Cargar adjuntos para cada servicio
      jobs.forEach(job => {
        this.loadJobAttachments(job.id);
      });
    });
  }

  loadJobAttachments(jobId: string) {
    this.jobsService.getJobAttachments(jobId).subscribe(attachments => {
      const job = this.jobs.find(j => j.id === jobId);
      if (job) {
        job.attachments = attachments;
        // Generar URLs de descarga
        attachments.forEach(attachment => {
          this.jobsService.getAttachmentUrl(attachment.file_path).subscribe(url => {
            attachment.url = url;
          });
        });
      }
    });
  }

  onFileSelected(event: any, jobId: string) {
    const files = event.target.files;
    
    for (let file of files) {
      this.jobsService.uploadAttachment(jobId, file).subscribe(attachment => {
        console.log('Archivo subido:', attachment);
        this.loadJobAttachments(jobId); // Recargar adjuntos
      });
    }
  }
}
*/

// ==== PASOS DE IMPLEMENTACIÓN ====
// 1. Ejecutar el script 03-setup-storage.sql en Supabase
// 2. Crear bucket 'attachments' en Supabase Storage
// 3. Instalar dependencias: npm install @supabase/supabase-js
// 4. Configurar credenciales en environment.ts
// 5. Actualizar SupabaseService con las credenciales
// 6. Usar los servicios en tus componentes
// 7. Configurar routing guards para verificar autenticación y empresa seleccionada
