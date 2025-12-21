import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnyChatService, AnyChatContact, AnyChatPaginatedResponse } from '../../../services/anychat.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-anychat-contacts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './anychat-contacts.component.html',
  styleUrls: ['./anychat-contacts.component.scss']
})
export class AnychatContactsComponent implements OnInit {
  private anychatService = inject(AnyChatService);
  private toastService = inject(ToastService);

  contacts = signal<AnyChatContact[]>([]);
  isLoadingContacts = signal(false);
  searchTerm = signal('');
  currentPage = signal(1);
  totalPages = signal(1);
  totalContacts = signal(0);

  filteredContacts = computed(() => {
    const search = this.searchTerm().toLowerCase().trim();
    const allContacts = this.contacts();
    if (!search) return allContacts;
    return allContacts.filter(c =>
      (c.name || '').toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.company || '').toLowerCase().includes(search)
    );
  });

  ngOnInit(): void {
    this.loadContacts();
  }

  loadContacts(page: number = 1): void {
    this.isLoadingContacts.set(true);
    this.anychatService.getContacts(page, 20).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatContact>) => {
        this.contacts.set(response.data);
        this.currentPage.set(response.page);
        this.totalPages.set(response.pages);
        this.totalContacts.set(response.total);
        this.isLoadingContacts.set(false);
      },
      error: (error) => {
        this.isLoadingContacts.set(false);
        if (error.message?.includes('CORS')) {
          this.toastService.error('Error de Configuración', 'Revisa el proxy AnyChat en Supabase y CORS');
        } else if (error.message?.includes('API Key')) {
          this.toastService.error('Configuración Requerida', 'Falta configurar la API Key de AnyChat');
        } else {
          this.toastService.error('Error', 'No se pudieron cargar los contactos');
        }
        console.error('❌ Error cargando contactos:', error);
      }
    });
  }

  searchContactsByEmail(): void {
    const email = this.searchTerm().trim();
    if (!email) {
      this.loadContacts(1);
      return;
    }
    this.isLoadingContacts.set(true);
    this.anychatService.searchContactByEmail(email).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatContact>) => {
        this.contacts.set(response.data);
        this.currentPage.set(1);
        this.totalPages.set(1);
        this.totalContacts.set(response.data.length);
        this.isLoadingContacts.set(false);
        if (response.data.length === 0) {
          this.toastService.info('Búsqueda', 'No se encontraron contactos con ese email');
        }
      },
      error: (error) => {
        this.isLoadingContacts.set(false);
        this.toastService.error('Error', 'Error al buscar contactos');
        console.error('Error buscando contactos:', error);
      }
    });
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.loadContacts(1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.loadContacts(this.currentPage() + 1);
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.loadContacts(this.currentPage() - 1);
    }
  }

  // ===== Sorting helpers (client-side) =====
  sortBy(field: 'name' | 'email' | 'company'): void {
    const list = [...this.contacts()];
    list.sort((a, b) => (a[field] || '').localeCompare((b as any)[field] || ''));
    this.contacts.set(list);
  }
}
