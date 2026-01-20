import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AnyChatService,
  AnyChatContact,
  AnyChatConversation,
  AnyChatMessage,
  AnyChatPaginatedResponse
} from '../../../services/anychat.service';
import { SupabasePermissionsService } from '../../../services/supabase-permissions.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-anychat',
  imports: [CommonModule, FormsModule],
  templateUrl: './anychat.component.html'
})
export class AnychatComponent implements OnInit {
  private anychatService = inject(AnyChatService);
  private toastService = inject(ToastService);
  public permissionsService = inject(SupabasePermissionsService);

  // ===============================
  // SIGNALS - ESTADO REACTIVO
  // ===============================

  contacts = signal<AnyChatContact[]>([]);
  conversations = signal<AnyChatConversation[]>([]);
  messages = signal<AnyChatMessage[]>([]);
  // chat GUID to use with message endpoints (may differ from conversation.guid depending on API)
  private selectedChatGuid = signal<string | null>(null);

  selectedContact = signal<AnyChatContact | null>(null);
  selectedConversation = signal<AnyChatConversation | null>(null);

  isLoadingContacts = signal(false);
  isLoadingConversations = signal(false);
  isLoadingMessages = signal(false);
  isSendingMessage = signal(false);
  messagesUnavailable = signal(false);

  searchTerm = signal('');
  newMessage = signal('');

  // Paginación
  currentPage = signal(1);
  totalPages = signal(1);
  totalContacts = signal(0);
  totalConversations = signal(0);
  // Mensajes: paginación separada
  messagesPage = signal(1);
  messagesTotalPages = signal(1);
  // Sidebar responsive (mobile toggle)
  sidebarOpen = signal(false);

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

  filteredConversations = computed(() => {
    const search = this.searchTerm().toLowerCase().trim();
    const all = this.conversations();
    if (!search) return all;
    return all.filter(c =>
      c.guid?.toLowerCase().includes(search) ||
      c.status?.toLowerCase().includes(search)
    );
  });

  hasContacts = computed(() => this.contacts().length > 0);
  hasConversations = computed(() => this.conversations().length > 0);
  hasMessages = computed(() => this.messages().length > 0);
  canSendMessage = computed(() => {
    return this.newMessage().trim().length > 0 &&
      this.selectedChatGuid() !== null &&
      !this.isSendingMessage() &&
      !this.messagesUnavailable();
  });

  // Get contact name for a conversation
  getContactName(conversation: AnyChatConversation): string {
    if (!conversation.contact_guid) {
      return 'Nuevo usuario';
    }

    // Try to find contact in loaded contacts
    const contact = this.contacts().find(c => c.guid === conversation.contact_guid);
    if (contact?.name) {
      return contact.name;
    }

    // If selected conversation, check selectedContact
    if (this.selectedConversation()?.guid === conversation.guid && this.selectedContact()?.name) {
      return this.selectedContact()!.name;
    }

    return 'Usuario';
  }

  // Get contact initials for avatar
  getContactInitials(conversation: AnyChatConversation): string {
    const name = this.getContactName(conversation);
    if (name === 'Nuevo usuario' || name === 'Usuario') {
      return '?';
    }

    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  ngOnInit(): void {
    // Verificar si AnyChat está configurado y disponible
    const isAnyChatEnabled = this.checkAnyChatAvailability();
    if (isAnyChatEnabled) {
      // Cargar conversaciones y contactos en paralelo para tener nombres disponibles
      this.loadConversations();
      this.loadContacts();
    } else {
      console.warn('⚠️ AnyChat no disponible - módulo en modo solo visualización');
      this.toastService.info(
        'Módulo en Configuración',
        'AnyChat requiere configuración adicional para funcionar'
      );
    }
  }

  // Acceso al contenedor de mensajes para manejo de scroll
  @ViewChild('messagesContainer', { static: false })
  private messagesContainer!: ElementRef<HTMLDivElement>;

  // Listener de scroll (guardado para poder eliminarlo)
  private onScroll = (ev: Event) => {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (!el) return;
      // Si estamos cerca del top y hay más páginas, cargar la anterior
      if (el.scrollTop <= 120 && !this.isLoadingMessages() && this.messagesPage() < this.messagesTotalPages()) {
        this.loadOlderMessages();
      }
    } catch (e) { /* silencioso */ }
  };

  ngAfterViewInit(): void {
    // Añadir listener de scroll al contenedor de mensajes
    try {
      setTimeout(() => {
        if (this.messagesContainer && this.messagesContainer.nativeElement) {
          this.messagesContainer.nativeElement.addEventListener('scroll', this.onScroll);
        }
      }, 0);
    } catch (e) { }
  }

  ngOnDestroy(): void {
    try {
      if (this.messagesContainer && this.messagesContainer.nativeElement) {
        this.messagesContainer.nativeElement.removeEventListener('scroll', this.onScroll as any);
      }
    } catch (e) { }
  }

  /**
   * Verifica si AnyChat está disponible y configurado
   */
  private checkAnyChatAvailability(): boolean {
    // Aquí podrías agregar más verificaciones
    // Por ejemplo, hacer un ping a la API primero

    // Por ahora, simplemente verificamos que exista el servicio
    // En el futuro, se puede agregar una verificación de conectividad

    return true; // Cambiar a false para deshabilitar temporalmente
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

        // Manejo específico de errores CORS
        if (error.message?.includes('CORS')) {
          this.toastService.error(
            'Error de Configuración',
            'La API de AnyChat requiere configuración adicional. Contacta con soporte.'
          );
          console.error('❌ Error CORS de AnyChat:', error);
        } else if (error.message?.includes('API Key')) {
          this.toastService.error(
            'Configuración Requerida',
            'Falta configurar la API Key de AnyChat'
          );
          console.error('❌ API Key no configurada:', error);
        } else {
          this.toastService.error('Error', 'No se pudieron cargar los contactos');
          console.error('❌ Error cargando contactos:', error);
        }
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

  loadConversations(page: number = 1): void {
    this.isLoadingConversations.set(true);
    this.anychatService.getConversations(page, 20).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatConversation>) => {
        // Ordenar conversaciones de más reciente a más antigua
        const sortedConversations = [...response.data].sort((a, b) => {
          const dateA = new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime();
          const dateB = new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime();
          return dateB - dateA; // Más reciente primero
        });
        this.conversations.set(sortedConversations);
        this.currentPage.set(response.page);
        this.totalPages.set(response.pages);
        this.totalConversations.set(response.total);
        this.isLoadingConversations.set(false);
      },
      error: (error) => {
        this.isLoadingConversations.set(false);
        if (error.message?.includes('deshabilitad')) {
          console.warn('ℹ️ Conversaciones de AnyChat deshabilitadas.');
          this.toastService.info('Conversaciones no disponibles', 'La API de conversaciones aún no está habilitada');
        } else if (error.message?.includes('CORS')) {
          this.toastService.error('Error de Configuración', 'Revisa el proxy AnyChat en Supabase y CORS');
        } else {
          this.toastService.error('Error', 'No se pudieron cargar las conversaciones');
        }
        console.error('❌ Error cargando conversaciones:', error);
      }
    });
  }

  selectConversation(conversation: AnyChatConversation): void {
    this.selectedConversation.set(conversation);
    // Prefer explicit chat_guid when provided by API; fallback to guid
    const chatGuid = (conversation as any)?.chat_guid || conversation.guid;
    this.selectedChatGuid.set(chatGuid);
    this.loadMessages(chatGuid);
    // Cargar datos del contacto asociado a la conversación para mostrar en header
    if (conversation.contact_guid) {
      this.anychatService.getContact(conversation.contact_guid).subscribe({
        next: (contact) => this.selectedContact.set(contact),
        error: () => {/* silencioso */ }
      });
    }
  }

  // ===============================
  // MÉTODOS - MENSAJES
  // ===============================

  loadMessages(conversationId: string): void {
    this.isLoadingMessages.set(true);
    this.messagesUnavailable.set(false);
    // Reset pagination for messages when loading a new conversation
    this.messagesPage.set(1);
    this.messagesTotalPages.set(1);

    this.anychatService.getMessages(conversationId, 1, 50).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatMessage>) => {
        // Ensure messages are oldest->newest
        const ordered = (response.data || []).slice().sort((a, b) => (a.created_at - b.created_at));
        console.log('🔍 DEBUG MENSAJES:', ordered.map(m => ({ guid: m.guid, direction: m.direction, message: m.message?.substring(0, 30) })));
        this.messages.set(ordered);
        this.messagesPage.set(response.page || 1);
        this.messagesTotalPages.set(response.pages || 1);
        this.isLoadingMessages.set(false);
        // Scroll to bottom on initial load
        setTimeout(() => this.scrollMessagesToBottom(), 50);
      },
      error: (error) => {
        this.isLoadingMessages.set(false);
        this.messagesUnavailable.set(true);
        if (error.message?.includes('deshabilitad')) {
          this.toastService.info('Mensajes no disponibles', 'La API de conversaciones aún no está habilitada');
        } else {
          // Evitar ruido excesivo si los endpoints de mensajes no están disponibles
          console.warn('Mensajes no disponibles vía API de AnyChat en este entorno.');
        }
        console.error('Error cargando mensajes:', error);
      }
    });
  }

  /** Carga páginas anteriores (mensajes más antiguos) y las antepone manteniendo la posición de scroll */
  private loadOlderMessages(): void {
    const conversationId = this.selectedChatGuid();
    if (!conversationId) return;
    const nextPage = this.messagesPage() + 1;
    if (nextPage > this.messagesTotalPages()) return;
    this.isLoadingMessages.set(true);

    const el = this.messagesContainer?.nativeElement;
    // Guardar scrollHeight previo para preservar posición
    const prevScrollHeight = el ? el.scrollHeight : 0;

    this.anychatService.getMessages(conversationId, nextPage, 50).subscribe({
      next: (response: AnyChatPaginatedResponse<AnyChatMessage>) => {
        const older = (response.data || []).slice().sort((a, b) => (a.created_at - b.created_at));
        // Anteponer mensajes antiguos
        this.messages.update(msgs => [...older, ...msgs]);
        this.messagesPage.set(response.page || nextPage);
        this.messagesTotalPages.set(response.pages || this.messagesTotalPages());
        this.isLoadingMessages.set(false);
        // Ajustar scroll para mantener la posición relativa
        setTimeout(() => {
          try {
            if (el) {
              const newScroll = el.scrollHeight - prevScrollHeight;
              el.scrollTop = newScroll + el.scrollTop;
            }
          } catch (e) { }
        }, 20);
      },
      error: (error) => {
        this.isLoadingMessages.set(false);
        console.error('Error cargando mensajes antiguos:', error);
      }
    });
  }

  private scrollMessagesToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch (e) { }
  }

  sendMessage(): void {
    const message = this.newMessage().trim();
    const chatGuid = this.selectedChatGuid();
    if (!message || !chatGuid) return;

    this.isSendingMessage.set(true);

    this.anychatService.sendMessage(chatGuid, message).subscribe({
      next: (sentMessage: AnyChatMessage) => {
        // Agregar mensaje a la lista
        this.messages.update(msgs => [...msgs, sentMessage]);

        // Limpiar input
        this.newMessage.set('');

        this.isSendingMessage.set(false);
        // Mantener vista en la parte inferior tras enviar
        setTimeout(() => this.scrollMessagesToBottom(), 50);
        this.toastService.success('Enviado', 'Mensaje enviado correctamente');
      },
      error: (error) => {
        this.isSendingMessage.set(false);
        if (error.message?.includes('deshabilitad')) {
          this.toastService.info('Mensajes no disponibles', 'La API de conversaciones aún no está habilitada');
        } else {
          this.toastService.error('Error', 'No se pudo enviar el mensaje');
        }
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

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.loadConversations(this.currentPage() + 1);
    }
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.loadConversations(this.currentPage() - 1);
    }
  }
}
