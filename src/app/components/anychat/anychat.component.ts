import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  AnyChatService, 
  AnyChatContact, 
  AnyChatConversation, 
  AnyChatMessage,
  AnyChatPaginatedResponse 
} from '../../services/anychat.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-anychat',
  imports: [CommonModule, FormsModule],
  templateUrl: './anychat.component.html',
  styleUrl: './anychat.component.scss'
})
export class AnychatComponent implements OnInit {
  private anychatService = inject(AnyChatService);
  private toastService = inject(ToastService);

  // ===============================
  // SIGNALS - ESTADO REACTIVO
  // ===============================
  
  contacts = signal<AnyChatContact[]>([]);
  conversations = signal<AnyChatConversation[]>([]);
  messages = signal<AnyChatMessage[]>([]);
  
  selectedContact = signal<AnyChatContact | null>(null);
  selectedConversation = signal<AnyChatConversation | null>(null);
  
  isLoadingContacts = signal(false);
  isLoadingConversations = signal(false);
  isLoadingMessages = signal(false);
  isSendingMessage = signal(false);
  
  searchTerm = signal('');
  newMessage = signal('');
  
  // Paginación
  currentPage = signal(1);
  totalPages = signal(1);
  totalContacts = signal(0);
  
  // ===============================
  // COMPUTED - DATOS DERIVADOS
  // ===============================
  
  filteredContacts = computed(() => {
    const search = this.searchTerm().toLowerCase().trim();
    const allContacts = this.contacts();
    
    if (!search) return allContacts;
    
    return allContacts.filter(contact =>
      contact.name?.toLowerCase().includes(search) ||
      contact.email?.toLowerCase().includes(search) ||
      contact.company?.toLowerCase().includes(search)
    );
  });

  hasContacts = computed(() => this.contacts().length > 0);
  hasMessages = computed(() => this.messages().length > 0);
  canSendMessage = computed(() => {
    return this.newMessage().trim().length > 0 && 
           this.selectedConversation() !== null &&
           !this.isSendingMessage();
  });

  ngOnInit(): void {
    this.loadContacts();
  }

  // ===============================
  // MÉTODOS - CONTACTOS
  // ===============================

  loadContacts(page: number = 1): void {
    this.isLoadingContacts.set(true);
    
    this.anychatService.getContacts(page, 20).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatContact>) => {
        this.contacts.set(response.data);
        this.currentPage.set(response.page);
        this.totalPages.set(response.pages);
        this.totalContacts.set(response.total);
        this.isLoadingContacts.set(false);
        
        console.log('✅ Contactos cargados:', response.data.length);
      },
      error: (error) => {
        this.isLoadingContacts.set(false);
        this.toastService.error('Error', 'No se pudieron cargar los contactos');
        console.error('Error cargando contactos:', error);
      }
    });
  }

  searchContactsByEmail(): void {
    const email = this.searchTerm().trim();
    
    if (!email) {
      this.loadContacts();
      return;
    }

    this.isLoadingContacts.set(true);
    
    this.anychatService.searchContactByEmail(email).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatContact>) => {
        this.contacts.set(response.data);
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

  selectContact(contact: AnyChatContact): void {
    this.selectedContact.set(contact);
    this.loadConversations();
    
    console.log('📱 Contacto seleccionado:', contact.name);
  }

  // ===============================
  // MÉTODOS - CONVERSACIONES
  // ===============================

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    
    // NOTA: Este endpoint aún no está documentado en AnyChat API
    // Por ahora mostramos un mensaje
    this.toastService.info(
      'En desarrollo', 
      'El módulo de conversaciones estará disponible próximamente'
    );
    
    this.isLoadingConversations.set(false);
    
    // Simulación temporal para UI
    /* this.anychatService.getConversations().subscribe({
      next: (response) => {
        this.conversations.set(response.data);
        this.isLoadingConversations.set(false);
      },
      error: (error) => {
        this.isLoadingConversations.set(false);
        console.error('Error cargando conversaciones:', error);
      }
    }); */
  }

  selectConversation(conversation: AnyChatConversation): void {
    this.selectedConversation.set(conversation);
    this.loadMessages(conversation.guid);
  }

  // ===============================
  // MÉTODOS - MENSAJES
  // ===============================

  loadMessages(conversationId: string): void {
    this.isLoadingMessages.set(true);
    
    this.anychatService.getMessages(conversationId).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatMessage>) => {
        this.messages.set(response.data);
        this.isLoadingMessages.set(false);
      },
      error: (error) => {
        this.isLoadingMessages.set(false);
        this.toastService.error('Error', 'No se pudieron cargar los mensajes');
        console.error('Error cargando mensajes:', error);
      }
    });
  }

  sendMessage(): void {
    const message = this.newMessage().trim();
    const conversation = this.selectedConversation();
    
    if (!message || !conversation) return;
    
    this.isSendingMessage.set(true);
    
    this.anychatService.sendMessage(conversation.guid, message).subscribe({
      next: (sentMessage: AnyChatMessage) => {
        // Agregar mensaje a la lista
        this.messages.update(msgs => [...msgs, sentMessage]);
        
        // Limpiar input
        this.newMessage.set('');
        
        this.isSendingMessage.set(false);
        this.toastService.success('Enviado', 'Mensaje enviado correctamente');
      },
      error: (error) => {
        this.isSendingMessage.set(false);
        this.toastService.error('Error', 'No se pudo enviar el mensaje');
        console.error('Error enviando mensaje:', error);
      }
    });
  }

  // ===============================
  // UTILIDADES
  // ===============================

  formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }
  }

  getContactInitials(contact: AnyChatContact): string {
    if (!contact.name) return '?';
    
    const names = contact.name.split(' ');
    if (names.length === 1) {
      return names[0].substring(0, 2).toUpperCase();
    }
    
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
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
}
