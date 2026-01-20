import { Component, OnInit, inject, ElementRef, ViewChild, OnDestroy, AfterViewInit, AfterViewChecked, ChangeDetectorRef, computed, Renderer2, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SupabaseTicketsService, Ticket, TicketTimelineEvent, TicketMacro } from '../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage as ConfigStage } from '../../../services/supabase-ticket-stages.service';
import { DevicesService, Device } from '../../../services/devices.service';
import { ProductsService } from '../../../services/products.service';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { TicketModalService } from '../../../services/ticket-modal.service';

import { environment } from '../../../../environments/environment';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseServicesService } from '../../../services/supabase-services.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../services/toast.service';
import { TenantService } from '../../../services/tenant.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';

// TipTap imports
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  client_id?: string; // Add client_id
  comment: string;
  created_at: string;
  is_internal: boolean;
  parent_id?: string | null;  // For nesting
  deleted_at?: string | null; // For soft delete
  edited_at?: string | null;  // For edit tracking
  user?: {
    name: string;
    surname?: string;
    email: string;
  };
  client?: {
    name: string;
    email: string;
  };
  children?: TicketComment[]; // UI helper for nesting
  showReplyEditor?: boolean;  // UI helper
  isEditing?: boolean;        // UI helper
  editContent?: string;       // UI helper
}

import { ClientDevicesModalComponent } from '../../../features/devices/client-devices-modal/client-devices-modal.component';
import { ProductCreateModalComponent } from '../../../features/products/product-create-modal/product-create-modal.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientDevicesModalComponent, SkeletonLoaderComponent, TagManagerComponent, ProductCreateModalComponent],
  styleUrls: ['./ticket-detail.component.scss'],
  templateUrl: './ticket-detail.component.html'
})
export class TicketDetailComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() inputTicketId?: string;
  loading = true;
  error: string | null = null;
  ticket: Ticket | null = null;
  ticketServices: any[] = [];
  ticketProducts: any[] = [];
  ticketDevices: Device[] = [];
  // All devices for the ticket's company (authoritative)
  companyDevices: Device[] = [];
  // Set of linked device ids (from ticket_devices)
  linkedDeviceIds: Set<string> = new Set();

  allStages: ConfigStage[] = [];
  private stagesSvc = inject(SupabaseTicketStagesService);
  recentActivity: any[] = [];
  ticketId: string | null = null;

  // State for comments
  comments: TicketComment[] = [];
  showDeletedComments = false;
  isInternalComment = false;
  isUploadingImage = false;
  isSubmitting = false; // Prevent double-submission race conditions

  // Rich editor state
  commentEditorHtml: string = '';

  // Modal controls
  showChangeStageModal = false;
  showUpdateHoursModal = false;
  showAttachmentModal = false;
  showClientDevicesModal = false;
  returnToSelectionModal = false;

  // Modal form data
  selectedStageId: string = '';
  newHoursValue: number = 0;
  selectedFile: File | null = null;
  // Edit modal form data (handled by central modal)
  // Advanced Config & Agents
  staffUsers: { id: string, name: string, email: string }[] = [];
  macros: any[] = []; // TicketMacro[]
  ticketConfig: any = {};


  // Visibility Modal
  showVisibilityModal = false;
  commentToToggle: TicketComment | null = null;
  visibilityModalTitle = '';
  visibilityModalMessage = '';

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SimpleSupabaseService);
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);
  private devicesService = inject(DevicesService);
  private productsService = inject(ProductsService);
  private productMetadataService = inject(ProductMetadataService); // Injected
  private settingsService = inject(SupabaseSettingsService);
  private ticketModalService = inject(TicketModalService);

  private quotesService = inject(SupabaseQuotesService);
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);

  // Brand Autocomplete state
  availableBrands: any[] = [];
  filteredBrands: any[] = [];
  brandSearchText: string = '';
  showBrandInput = false;

  // Track if there is an existing active quote derived from this ticket
  activeQuoteId: string | null = null;

  // Client portal mode - using computed signal based on user role (like supabase-tickets)
  isClient = computed(() => this.authService.userRole() === 'client');

  activeTab: string = 'comments';

  // Legacy property for backward compatibility (will be removed)
  isClientPortal = false;

  // Services Selection Modal state
  showServicesModal = false;
  servicesCatalog: any[] = [];
  filteredServices: any[] = [];
  serviceSearchText = '';
  selectedServiceIds: Set<string> = new Set();

  // Products Selection Modal state
  showProductsModal = false;
  productsCatalog: any[] = [];
  filteredProducts: any[] = [];
  productSearchText = '';
  selectedProductIds: Set<string> = new Set();
  tempProductQuantities: Map<string, number> = new Map();

  // Devices Selection Modal state
  showDevicesModal = false;
  availableDevices: Device[] = [];
  filteredDevices: Device[] = [];
  deviceSearchText = '';
  selectedDeviceIds: Set<string> = new Set();

  // Create Product Modal state
  showCreateProductModal = false;

  // History management for modals
  private popStateListener: any = null;
  // Keep quantities for selected services
  selectedServiceQuantities: Map<string, number> = new Map();

  // Minimal in-component toast system
  // Deprecated local toast ids (kept for backward compat, no longer used)
  private nextToastId = 1;

  // Track saving state per assigned service id when persisting inline quantity edits
  savingAssignedServiceIds: Set<string> = new Set();

  // Create Device Modal state
  showCreateDeviceForm = false;
  showDeletedDevices = false;
  editingDeviceId: string | null = null;
  deviceFormData: any = {};
  selectedDeviceImages: { file: File, preview: string }[] = [];

  // Tab management for content organization (Comments first as it's most used)


  // TipTap Editor
  editor: Editor | null = null;
  @ViewChild('editorElement', { static: false }) editorElement!: ElementRef;
  private editorTried = false;
  private cdr = inject(ChangeDetectorRef);
  private renderer = inject(Renderer2);
  private sanitizer = inject(DomSanitizer);

  // Client Devices Modal Mode
  clientDevicesModalMode: 'view' | 'select' = 'view';

  openClientDevicesModal() {
    this.clientDevicesModalMode = 'view';
    this.showClientDevicesModal = true;
    this.lockBodyScroll();
  }

  closeClientDevicesModal() {
    this.showClientDevicesModal = false;
    this.unlockBodyScroll();
  }


  async onSelectDevices(devices: Device[]) {
    try {
      if (!this.ticket?.id) return;
      const deviceIds = devices.map(d => d.id);
      await this.devicesService.linkDevicesToTicket(this.ticket.id, deviceIds);
      this.showToast('Dispositivos vinculados correctamente', 'success');
      this.showClientDevicesModal = false;
      this.unlockBodyScroll();
      this.loadTicketDevices();
    } catch (error) {
      console.error('Error linking devices:', error);
      this.showToast('Error al vincular dispositivos', 'error');
    }
  }

  onCreateNewDeviceFromModal() {
    this.showClientDevicesModal = false;
    // Open the standard creation form
    // reset return flag so we know to come back here
    this.returnToSelectionModal = true;

    // We can reuse the existing openCreateDeviceForm logic but manually since that method resets some things
    // Or just call it? calling it might reset returnToSelectionModal inside it if I'm not careful.
    // openCreateDeviceForm sets returnToSelectionModal = this.showDevicesModal (which is false here).

    // So better to manually open it:
    this.deviceFormData = {
      company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || '',
      status: 'received',
      priority: 'normal',
      brand: '',
      model: '',
      device_type: '',
      reported_issue: '',
      imei: '',
      color: '',
      condition_on_arrival: ''
    };
    this.selectedDeviceImages = [];
    this.showCreateDeviceForm = true;

  }

  // Counters
  activeCommentsCount: number = 0;

  // Lazy Loading / Fade Logic
  visibleCommentsLimit: number = 3;
  totalCommentsCount: number = 0;
  commentsExpanded: boolean = false;
  commentsLoading: boolean = false;

  // Unified Badge Configurations (following app style guide)
  ticketStatusConfig: Record<string, { label: string; classes: string; icon: string }> = {
    open: {
      label: 'Abierto',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      icon: 'fa-folder-open'
    },
    in_progress: {
      label: 'En Progreso',
      classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      icon: 'fa-spinner'
    },
    on_hold: {
      label: 'En Espera',
      classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
      icon: 'fa-pause-circle'
    },
    completed: {
      label: 'Completado',
      classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      icon: 'fa-check-circle'
    }
  };

  ticketPriorityConfig: Record<string, { label: string; classes: string; icon: string }> = {
    low: {
      label: 'Baja',
      classes: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      icon: 'fa-arrow-down'
    },
    normal: {
      label: 'Normal',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      icon: 'fa-minus'
    },
    high: {
      label: 'Alta',
      classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
      icon: 'fa-arrow-up'
    },
    urgent: {
      label: 'Urgente',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      icon: 'fa-exclamation-circle'
    }
  };

  timelineEventColors: Record<string, string> = {
    created: 'bg-green-500',
    updated: 'bg-blue-500',
    service: 'bg-purple-500',
    status: 'bg-gray-400 dark:bg-gray-500',
    comment: 'bg-orange-500',
    completed: 'bg-green-600'
  };

  // Custom Image extension to carry a temporary id attribute for preview replacement
  private ImageWithTemp = Image.extend({
    addAttributes() {
      return {
        ...(this.parent?.() as any),
        dataTempId: {
          default: null,
          renderHTML: (attrs: any) => attrs?.dataTempId ? { 'data-temp-id': attrs.dataTempId } : {},
          parseHTML: (element: HTMLElement) => element.getAttribute('data-temp-id'),
        },
      } as any;
    },
  });

  // Lightbox State
  selectedImage: string | null = null;



  // Handle delegated clicks for images
  handleImageClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      this.openLightbox(img.src);
    }
  }

  handleDescriptionClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      // If image is inside a link, prevent default navigation
      if (img.parentElement?.tagName === 'A') {
        event.preventDefault();
      }
      this.openLightbox(img.src);
    }
  }
  openLightbox(imageUrl: string) {
    if (!imageUrl) return;
    this.selectedImage = imageUrl;
    this.lockBodyScroll();
    this.loadConfig();
  }

  async loadStaff(companyId?: string) {
    const cid = companyId || this.ticket?.company_id || this.ticket?.company?.id || this.authService.userProfile?.company_id;
    if (cid) {
      this.staffUsers = await this.ticketsService.getCompanyStaff(cid);
    }
  }

  loadConfig() {
    const user = this.authService.userProfile;
    if (user?.company?.settings) {
      this.ticketConfig = user.company.settings;
      // Set default internal comment state
      if (this.ticketConfig.ticket_default_internal_comment) {
        this.isInternalComment = true;
      }
    }
  }

  async assignTicket(userId: string) {
    if (!this.ticket || this.isClient()) return;
    try {
      await this.ticketsService.updateTicket(this.ticket.id, { assigned_to: userId });
      this.ticket.assigned_to = userId;
      this.toastService.success('Agente asignado', 'El agente ha sido asignado correctamente');
    } catch (error) {
      this.toastService.error('Error', 'Error al asignar agente');
    }
  }

  openVisibilityModal(comment: TicketComment) {
    this.commentToToggle = comment;
    const willBeInternal = !comment.is_internal;
    this.visibilityModalTitle = willBeInternal ? '¿Marcar como Interno?' : '¿Hacer Público?';
    this.visibilityModalMessage = willBeInternal
      ? 'El cliente dejará de ver este comentario.'
      : '⚠️ ATENCIÓN: El cliente podrá ver este comentario y recibirá una notificación.';
    this.showVisibilityModal = true;
  }

  async confirmVisibilityChange() {
    if (!this.commentToToggle) return;

    const newStatus = !this.commentToToggle.is_internal;
    const { error } = await this.authService.client
      .from('ticket_comments')
      .update({ is_internal: newStatus })
      .eq('id', this.commentToToggle.id);

    if (error) {
      this.toastService.error('Error', 'Error al cambiar visibilidad');
    } else {
      this.commentToToggle.is_internal = newStatus;
      this.toastService.success('Correcto', 'Visibilidad actualizada');
    }
    this.showVisibilityModal = false;
    this.commentToToggle = null;
  }

  closeLightbox() {
    this.selectedImage = null;
    this.unlockBodyScroll(); // Restore scroll
  }



  ngOnInit() {
    this.debugLog('TicketDetailComponent ngOnInit called');
    // Also set legacy isClientPortal for any remaining uses
    this.isClientPortal = this.tenantService.isClientPortal() || this.authService.userRole() === 'client';

    if (this.inputTicketId) {
      this.ticketId = this.inputTicketId;
      this.debugLog('Ticket ID from Input:', this.ticketId);
      this.loadTicketDetail();
      this.subscribeToComments();
    } else {
      this.route.params.subscribe(params => {
        this.ticketId = params['id'];
        this.debugLog('Ticket ID from route:', this.ticketId);
        if (this.ticketId) {
          this.loadTicketDetail();
          // Subscribe to comments regardless of initial load success to ensure we catch updates
          this.subscribeToComments();
        } else {
          this.error = 'ID de ticket no válido';
          this.loading = false;
        }
      });
    }
  }

  ngAfterViewInit() {
    this.debugLog('ngAfterViewInit called');
    // Wait for DOM to be fully rendered
    setTimeout(() => {
      this.debugLog('Attempting to initialize editor after DOM render...');
      this.initializeEditor();
    }, 200);
  }

  ngAfterViewChecked() {
    // If the ticket block just became visible, ensure editor is mounted once
    if (!this.editor && !this.editorTried && this.editorElement?.nativeElement) {
      this.editorTried = true;
      setTimeout(() => this.initializeEditor(), 0);
    }
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.destroy();
    }
    if (this.commentsSubscription) {
      this.commentsSubscription.unsubscribe();
    }
    // Asegurar que el scroll se restaure
    document.documentElement.style.overflow = '';
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }

  private commentsSubscription: any;
  private subscribeToComments() {
    if (!this.ticketId) return;

    // Log start of subscription attempt
    console.log('Starting Realtime subscription for ticket:', this.ticketId);

    // Use a unique channel name to avoid collisions if multiple tabs are open
    const channelName = `ticket-comments-${this.ticketId}-${Date.now()}`;

    const channel = this.supabase.getClient()
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${this.ticketId}` },
        (payload) => {
          this.debugLog('Realtime update received:', payload);

          // Verify if we should show this update (e.g. internal comment for client)
          if (this.isClient() && payload.new && (payload.new as any).is_internal) {
            return; // Ignore internal updates for clients
          }
          // Trigger reload
          this.loadComments();
        }
      )
      .subscribe((status, err) => {
        console.log('Realtime subscription status:', status, err); // Force log
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to ticket comments updates. Channel:', channelName);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error:', err);
        }
      });

    this.commentsSubscription = channel;
  }

  // Helper to transform HTML content (e.g. make images clickable thumbnails)
  getProcessedContent(htmlContent: string): any {
    if (!htmlContent) return '';

    // Sanitize first to prevent XSS
    const sanitizedHtml = DOMPurify.sanitize(htmlContent, {
      ADD_ATTR: ['target'], // Allow target="_blank"
    });

    // simple string manipulation to add class/onclick logic or wrap in anchor
    // We want: output <a href="src" target="_blank"><img src="src" class="comment-thumbnail" /></a>

    // Create a temporary DOM element to parse content
    const div = document.createElement('div');
    div.innerHTML = sanitizedHtml;

    const images = div.querySelectorAll('img');
    images.forEach((img: HTMLImageElement) => {
      // Skip if already wrapped in anchor (avoid double wrapping on re-renders if logic changes)
      // Skip if already wrapped (should not happen with this new logic)
      if (img.parentElement?.tagName === 'A') return;

      const src = img.getAttribute('src');
      if (src) {
        // Use a simple span wrapper with cursor-pointer to indicate clickability
        // We rely on the container's click handler to catch the click on the img

        const newImg = img.cloneNode(true) as HTMLImageElement;
        newImg.classList.add('comment-thumbnail');
        newImg.style.maxWidth = '150px';
        newImg.style.maxHeight = '150px';
        newImg.style.objectFit = 'contain';
        newImg.style.cursor = 'zoom-in';
        newImg.style.borderRadius = '0.375rem';
        newImg.style.border = '1px solid #e5e7eb';

        // No <a> wrapper needed, just the img
        img.replaceWith(newImg);
      }


    });

    return this.sanitizer.bypassSecurityTrustHtml(div.innerHTML);
  }

  // Development-only logger: will be a no-op in production
  private debugLog(...args: any[]) {
    if (!environment.production) {
      try { console.log(...args); } catch { }
    }
  }

  /**
   * Return a sensible full name for a client object.
   * Supports multiple possible field names coming from different imports (name, first_name, last_name, apellidos, etc.).
   */
  getClientFullName(client: any): string {
    if (!client) return '';
    const rawName = (client.name || client.nombre || '').toString().trim();
    const first = (client.first_name || client.firstName || client.nombre || '').toString().trim();
    const last = (client.last_name || client.lastName || client.apellido || client.apellidos || client.surname || '').toString().trim();

    // If there's a raw `name` and no separate last name, prefer it as-is.
    if (rawName && !last) return rawName;

    // If rawName exists and last is present but not already included in rawName, append it.
    if (rawName && last && !rawName.includes(last)) return `${rawName} ${last}`.trim();

    // Otherwise build from first + last
    const parts: string[] = [];
    if (first) parts.push(first);
    if (last) parts.push(last);
    const combined = parts.join(' ').trim();
    if (combined) return combined;

    // Fallback to any available name-like fields
    return rawName || client.email || '';
  }

  initializeEditor() {
    // Debug DOM state
    this.debugLog('DOM debug:');
    this.debugLog('- .tiptap-editor exists:', !!document.querySelector('.tiptap-editor'));
    this.debugLog('- #editorElement exists:', !!document.querySelector('#editorElement'));
    this.debugLog('- ViewChild editorElement:', this.editorElement);
    this.debugLog('- All elements with class tiptap-editor:', document.querySelectorAll('.tiptap-editor'));

    // Prefer ViewChild; fall back to query selectors
    let element = (this.editorElement && this.editorElement.nativeElement) as HTMLElement;
    if (!element) {
      element = document.querySelector('#editorElement') as HTMLElement;
    }
    if (!element) {
      element = document.querySelector('.tiptap-editor') as HTMLElement;
    }

    if (!element) {
      console.warn('Editor element not found with any selector, will retry once on next check...');
      this.editorTried = false; // allow ngAfterViewChecked to try again once
      return;
    }

    if (this.editor) {
      this.editor.destroy();
    }

    this.debugLog('Initializing TipTap editor on element:', element);
    this.editor = new Editor({
      element: element,
      extensions: [
        StarterKit.configure({
          // Disable the built-in link to avoid conflict with our custom Link extension
          link: false,
        }),
        this.ImageWithTemp.configure({
          inline: true,
          HTMLAttributes: {
            class: 'max-w-full rounded-lg',
          },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 underline',
          },
        }),
        Placeholder.configure({
          placeholder: 'Escribe tu comentario aquí...',
        }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none',
        },
        handleDrop: (view, event, slice, moved) => {
          const hasFiles = !!event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0;
          if (hasFiles) {
            this.handleEditorDrop(event);
            return true; // handled, prevent browser default navigation
          }
          return false;
        },
        handlePaste: (view, event, slice) => {
          // If files are present in paste, handle and stop default
          const items = event.clipboardData?.items || [];
          const hasFiles = Array.from(items).some(i => i.kind === 'file');
          if (hasFiles) {
            this.handleEditorPaste(event);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        this.commentEditorHtml = editor.getHTML();
      },
      onCreate: ({ editor }) => {
        this.debugLog('TipTap editor created successfully');
        // Trigger change detection to reflect buttons state bound to editor
        try { this.cdr.detectChanges(); } catch { }
      },
    });
  }

  // TipTap Editor Methods
  focusEditor() {
    this.editor?.commands.focus();
  }

  toggleBold() {
    this.editor?.chain().focus().toggleBold().run();
  }

  toggleItalic() {
    this.editor?.chain().focus().toggleItalic().run();
  }

  toggleBulletList() {
    this.editor?.chain().focus().toggleBulletList().run();
  }

  toggleOrderedList() {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  private async handleEditorPaste(event: ClipboardEvent) {
    try {
      const items = event.clipboardData?.items || [];
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        for (const f of files) {
          if (f.type.startsWith('image/')) {
            // 1) Insert a temporary preview image
            const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const objectUrl = URL.createObjectURL(f);
            this.insertTempImage(objectUrl, tmpId, f.name);
            // 2) Upload and replace src once ready
            const url = await this.uploadCommentFile(f);
            if (url && this.editor) {
              // Replace the temp img (by data attribute)
              this.editor.commands.command(({ tr, state }) => {
                const { doc } = state;
                let replaced = false;
                doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && (node.attrs as any)?.dataTempId === tmpId) {
                    const newAttrs = { ...(node.attrs as any), src: url, alt: f.name, dataTempId: null };
                    tr.setNodeMarkup(pos, undefined, newAttrs as any);
                    replaced = true; // stop traversal
                  }
                  return true;
                });
                if (replaced) {
                  tr.setMeta('addToHistory', true);
                  return true;
                }
                return false;
              });
            }
            // 3) Release object URL
            URL.revokeObjectURL(objectUrl);
          } else {
            // Non-image: upload and insert link
            const url = await this.uploadCommentFile(f);
            if (url && this.editor) {
              const safeName = f.name.replace(/[<>]/g, '');
              this.editor.chain().focus()
                .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${safeName}</a>`)
                .run();
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error procesando pegado:', e);
    }
  }

  private async handleEditorDrop(event: DragEvent) {
    try {
      if (!event.dataTransfer?.files?.length) return;
      const files = Array.from(event.dataTransfer.files);
      event.preventDefault();
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const objectUrl = URL.createObjectURL(f);
          this.insertTempImage(objectUrl, tmpId, f.name);
          const url = await this.uploadCommentFile(f);
          if (url && this.editor) {
            this.editor.commands.command(({ tr, state }) => {
              const { doc } = state;
              let replaced = false;
              doc.descendants((node, pos) => {
                if (node.type.name === 'image' && (node.attrs as any)?.dataTempId === tmpId) {
                  const newAttrs = { ...(node.attrs as any), src: url, alt: f.name, dataTempId: null };
                  tr.setNodeMarkup(pos, undefined, newAttrs as any);
                  replaced = true; return false;
                }
                return true;
              });
              if (replaced) { tr.setMeta('addToHistory', true); return true; }
              return false;
            });
          }
          URL.revokeObjectURL(objectUrl);
        } else {
          // Upload non-image and insert a link
          const url = await this.uploadCommentFile(f);
          if (url && this.editor) {
            const safeName = f.name.replace(/[<>]/g, '');
            this.editor.chain().focus()
              .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${safeName}</a>`)
              .run();
          }
        }
      }
    } catch (e) {
      console.warn('Error procesando drop:', e);
    }
  }

  // selected services handled via selectedServiceIds in modal

  // Load services catalog (for selection modal)
  private async loadServicesCatalog() {
    try {
      // Use SupabaseServicesService to get mapped services (category names, tags, etc.)
      const companyId = String((this.ticket as any)?.company_id || (this.ticket as any)?.company?.id || '');
      try {
        const services = await this.servicesService.getServices(companyId);
        this.servicesCatalog = services || [];
      } catch (e) {
        // Fallback to direct query if the service helper fails
        const { data: services } = await this.supabase.getClient().from('services').select('*').order('name');
        this.servicesCatalog = services || [];
      }
      this.filterServices();
    } catch (err) {
      console.warn('Error loading services catalog', err);
      this.servicesCatalog = [];
      this.filteredServices = [];
    }
  }

  // customer-related helpers removed (not needed in services-only modal)

  filterServices() {
    const q = (this.serviceSearchText || '').toLowerCase();
    if (!q) {
      this.filteredServices = this.servicesCatalog.slice(0, 10);
      return;
    }
    this.filteredServices = this.servicesCatalog.filter(s => {
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const descMatch = (s.description || '').toLowerCase().includes(q);
      const catMatch = (s.category || '').toLowerCase().includes(q);
      const tagsMatch = Array.isArray((s as any).tags) && (s as any).tags.some((t: string) => (t || '').toLowerCase().includes(q));
      return nameMatch || descMatch || catMatch || tagsMatch;
    }).slice(0, 200);
  }

  isServiceIdSelected(id: string) { return this.selectedServiceIds.has(id); }
  toggleServiceSelection(svc: any) {
    const id = svc?.id;
    if (!id) return;
    if (this.selectedServiceIds.has(id)) {
      // Prevent deselecting the last remaining service
      if (this.selectedServiceIds.size <= 1) {
        this.showToast('Debe mantener al menos un servicio seleccionado.', 'info');
        return;
      }
      this.selectedServiceIds.delete(id);
    } else {
      this.selectedServiceIds.add(id);
      // Ensure a quantity exists for newly selected services
      if (!this.selectedServiceQuantities.has(id)) this.selectedServiceQuantities.set(id, 1);
    }
  }



  async loadTicketDevices() {
    try {
      // Load linked devices and build set of linked IDs
      this.linkedDeviceIds = new Set();
      if (this.ticketId) {
        // Load ticket devices (including deleted if toggled)
        const linked = await this.devicesService.getTicketDevices(this.ticketId, this.showDeletedDevices);
        if (linked && linked.length > 0) {
          this.ticketDevices = linked;
          this.linkedDeviceIds.clear();
          linked.forEach(d => this.linkedDeviceIds.add(d.id));
        } else {
          this.ticketDevices = [];
        }
      }

      // Load all devices for the ticket's company (company is authoritative)
      // Check if we are in client portal or agent view
      // If isClient(), we MUST load devices but scoped to this client.
      // If agent, we load all company devices (to allow searching/reassigning if needed) BUT filter by client in logic later if strict.

      const companyId = (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id;

      if (companyId) {
        try {
          // For clients, we might need a specific RPC or just filter after fetch if RLS allows fetching all (which it shouldn't).
          // Assuming getDevices returns what the user *can* see.
          // However, for agents, we want to see ALL devices to potentially link them.
          // The user requirement: "el usuario sólo liste los dispositivos que pertenencen a ese cliente".

          const devices = await this.devicesService.getDevices(companyId);
          this.companyDevices = devices || [];
        } catch (err) {
          console.warn('Error cargando dispositivos de la empresa:', err);
          this.companyDevices = [];
        }
      } else {
        this.companyDevices = [];
      }
    } catch (error) {
      console.error('Error cargando dispositivos:', error);
      this.ticketDevices = [];
      this.companyDevices = [];
    }
  }

  isDeviceLinked(deviceId: string): boolean {
    return this.linkedDeviceIds.has(deviceId);
  }


  toggleCommentsExpansion() {
    this.commentsExpanded = !this.commentsExpanded;
    this.loadComments(); // Reload with new limit/no limit
  }

  async loadComments() {
    if (!this.ticketId) return;

    try {
      this.commentsLoading = true;
      const isClient = this.isClient();
      let query = this.supabase.getClient()
        .from('ticket_comments')
        .select(`
          *,
          user:users(name, surname, email),
          client:clients(name, email)
        `, { count: 'exact' }) // Get count
        .eq('ticket_id', this.ticketId)
        .order('created_at', { ascending: false }); // Newest first

      // Clients should NOT see internal comments
      if (isClient) {
        query = query.eq('is_internal', false);
      }

      // Apply limit if not expanded
      if (!this.commentsExpanded) {
        query = query.range(0, this.visibleCommentsLimit - 1);
      }

      const { data: comments, count, error } = await query;

      if (error) {
        console.warn('Error cargando comentarios:', error);
        this.comments = [];
        this.activeCommentsCount = 0;
        this.totalCommentsCount = 0;
        return;
      }

      this.totalCommentsCount = count || 0;

      // Use DB count for badge
      this.activeCommentsCount = count || 0;

      // Build Tree Structure
      this.comments = this.buildCommentTree(comments || []);
    } catch (error) {
      console.error('Error en loadComments:', error);
      this.comments = [];
    } finally {
      this.commentsLoading = false;
    }
  }

  buildCommentTree(flatComments: any[]): TicketComment[] {
    const map = new Map<string, TicketComment>();
    const roots: TicketComment[] = [];

    // 1. Initialize map and add UI flags
    flatComments.forEach(c => {
      c.children = [];
      c.showReplyEditor = false;
      c.isEditing = false;
      c.editContent = c.comment;
      map.set(c.id, c);
    });

    // 2. Build tree
    flatComments.forEach(c => {
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.children!.push(c);
      } else {
        roots.push(c);
      }
    });

    return roots;
  }

  // --- NEW ACTIONS ---

  toggleReply(comment: TicketComment) {
    comment.showReplyEditor = !comment.showReplyEditor;
    if (comment.showReplyEditor) {
      setTimeout(() => {
        const el = document.getElementById('reply-input-' + comment.id);
        if (el) el.focus();
      }, 50);
    }
  }

  async replyTo(parentComment: TicketComment, content: string) {
    if (!content.trim()) return;

    // Inherit internal status from parent if it is internal
    // If user replies to an internal comment, the reply MUST be internal
    const isInternal = parentComment.is_internal;

    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.postComment(content, parentComment.id, isInternal);
      parentComment.showReplyEditor = false;
    } finally {
      this.isSubmitting = false;
    }
  }

  toggleEdit(comment: TicketComment) {
    comment.isEditing = !comment.isEditing;
    // Strip HTML for plain text editing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = comment.comment;
    comment.editContent = tempDiv.textContent || tempDiv.innerText || '';
  }

  async saveEdit(comment: TicketComment) {
    if (!comment.editContent || comment.editContent === comment.comment) {
      comment.isEditing = false;
      return;
    }

    try {
      // 1. Save specific version history (Frontend triggered for simplicity, could be trigger based)
      const { error: versionError } = await this.supabase.getClient()
        .from('ticket_comment_versions')
        .insert({
          comment_id: comment.id,
          content: comment.comment, // Old content
          changed_by: (await this.supabase.getClient().auth.getUser()).data.user?.id
        });

      if (versionError) console.warn('Error saving version history', versionError);

      // 2. Update comment
      // Wrap in <p> if saving as simple text to maintain consistency with editor, or just save text
      // User requested "Texto plano y limpio" but system uses HTML. 
      // best compromise: basic wrapping or just text (will render as text).
      // Let's replace newlines with <br> for basic formatting if we save as "plain".
      const formattedContent = comment.editContent?.replace(/\\n/g, '<br>') || '';

      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          comment: formattedContent,
          edited_at: new Date().toISOString()
        })
        .eq('id', comment.id);

      if (error) throw error;

      // Reload
      this.loadComments();
      this.showToast('Comentario actualizado', 'success');
    } catch (err) {
      console.error('Error editing comment', err);
      this.showToast('Error al editar comentario', 'error');
    }
  }

  async softDeleteComment(comment: TicketComment) {
    if (!confirm('¿Estás seguro de eliminar este comentario?')) return;

    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          deleted_at: new Date().toISOString()
        })
        .eq('id', comment.id);

      if (error) throw error;
      this.loadComments();
    } catch (err) {
      console.error('Error deleted comment', err);
      this.showToast('Error al eliminar comentario', 'error');
    }
  }

  async restoreComment(comment: TicketComment) {
    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          deleted_at: null
        })
        .eq('id', comment.id);

      if (error) throw error;
      this.loadComments();
    } catch (err) {
      console.error('Error restoring comment', err);
    }
  }

  getCommentAuthorName(comment: TicketComment): string {
    if (comment.user?.name) {
      const surname = comment.user.surname || '';
      return surname ? `${comment.user.name} ${surname.charAt(0)}.` : comment.user.name;
    }
    if (comment.user?.surname) return comment.user.surname; // Fallback just in case
    if (comment.client) return this.getClientFullName(comment.client);
    return comment.client_id ? 'Cliente' : (comment.user?.email ? comment.user.email.split('@')[0] : 'Usuario');
  }

  getAuthorInitials(comment: TicketComment): string {
    const name = this.getCommentAuthorName(comment);
    if (!name) return '?';
    // If it's "Usuario" or "Cliente", take 2 chars?
    if (name === 'Usuario' || name === 'Cliente') return name.substring(0, 2).toUpperCase();

    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // --- REFACTORED ADD ---
  async postComment(content: string, parentId: string | null = null, forceInternal: boolean | null = null) {
    if (!content || content === '<p></p>') return;

    try {
      const { data: { user } } = await this.supabase.getClient().auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const isClient = this.isClient();
      let payload: any = {
        ticket_id: this.ticketId,
        comment: content,
        // If forceInternal is true (relying to internal), enforce it.
        // Otherwise fallback to checkbox or false for clients.
        is_internal: forceInternal === true ? true : (isClient ? false : this.isInternalComment),
        parent_id: parentId // Set parent for reply
      };

      if (isClient) {
        const { data: clientData } = await this.supabase.getClient()
          .from('clients')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!clientData) throw new Error('Perfil de cliente no encontrado');
        payload.client_id = clientData.id;
        payload.user_id = null;
      } else {
        payload.user_id = user.id;
      }

      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .insert(payload);

      if (error) throw error;

      this.editor?.commands.setContent('');
      // Reset internal check based on config
      this.isInternalComment = this.ticketConfig?.ticket_default_internal_comment || false;
      this.loadComments();
      this.showToast('Comentario añadido', 'success');

      // Auto-assign Logic
      if (!isClient && !this.ticket?.assigned_to && this.ticketConfig?.ticket_auto_assign_on_reply) {
        this.assignTicket(user.id);
      }

    } catch (e: any) {
      console.error('Error adding comment', e);
      if (e.code === '23503') {
        this.showToast('Error de permisos: No puedes comentar en este ticket.', 'error');
      } else {
        this.showToast('Error al añadir comentario: ' + (e?.message || ''), 'error');
      }
    }
  }

  // Wrapper for template
  async addComment() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      const content = this.editor?.getHTML()?.trim() || '';
      await this.postComment(content);
    } finally {
      this.isSubmitting = false;
    }
  }

  // --- Smart Send Actions ---
  showSmartSendDropdown = false;

  get waitingStage() {
    return this.allStages.find(s => s.workflow_category === 'waiting' || s.stage_category === 'on_hold');
  }

  get solvedStage() {
    return this.allStages.find(s => s.workflow_category === 'final' || s.stage_category === 'completed');
  }

  toggleSmartSendDropdown() {
    this.showSmartSendDropdown = !this.showSmartSendDropdown;
  }

  async replyAndSetStage(stageId: string | undefined) {
    if (!stageId) return;
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    // Validar contenido
    const content = this.editor?.getHTML()?.trim() || '';
    if (!content || content === '<p></p>') return;

    try {
      // 1. Enviar comentario
      // Reuse postComment logic but we capture the promise to ensure order
      await this.postComment(content);

      // 2. Cambiar estado
      if (this.ticket && this.ticket.stage_id !== stageId) {
        try {
          await this.ticketsService.updateTicket(this.ticket.id, { stage_id: stageId });
          this.showToast('Estado actualizado automáticamente', 'success');
          // Update local state purely for UI snapiness before reload? 
          // Better to just reload to be safe
          this.loadTicketDetail();
        } catch (error) {
          console.error('Error auto-updating stage:', error);
          this.showToast('Comentario enviado, pero falló el cambio de estado', 'info');
        }
      }
    } catch (e) {
      console.error('Error in smart send:', e);
    } finally {
      this.showSmartSendDropdown = false;
      this.isSubmitting = false;
    }
  }

  // Auto-advance logic for First Open
  async handleFirstOpenAutoAdvance() {
    if (!this.ticket || !this.allStages?.length) return;

    const currentStageIndex = this.allStages.findIndex(s => s.id === this.ticket!.stage_id);
    if (currentStageIndex === -1) return; // Current stage not found?

    // Check if there is a next stage
    if (currentStageIndex < this.allStages.length - 1) {
      const nextStage = this.allStages[currentStageIndex + 1];

      console.log('🚀 Auto-advancing ticket on first open:', nextStage);

      // Update DB
      try {
        const updatePayload = {
          is_opened: true,
          stage_id: nextStage.id
        };
        await this.ticketsService.updateTicket(this.ticket.id, updatePayload);

        // Update Local State
        this.ticket.is_opened = true;
        this.ticket.stage_id = nextStage.id;
        this.ticket.stage = nextStage as any; // Update relation object nicely if possible

        this.showToast(`Ticket abierto: Avanzado a ${nextStage.name}`, 'info');
      } catch (e) {
        console.warn('Error auto-advancing ticket:', e);
        // Fallback: at least mark opened
        this.ticketsService.markTicketOpened(this.ticket.id);
      }
    } else {
      // Is last stage? Just mark opened
      this.ticketsService.markTicketOpened(this.ticket.id);
    }
  }

  // Navigation and actions
  goBack() {
    this.router.navigate(['/tickets']);
  }

  // Crear un presupuesto a partir de los servicios asignados al ticket
  async convertToQuoteFromTicket() {
    try {
      // If there's already an active quote, navigate to it
      if (this.activeQuoteId) {
        try {
          this.router.navigate(['/presupuestos', 'edit', this.activeQuoteId]);
        } catch {
          this.router.navigate(['/presupuestos', this.activeQuoteId]);
        }
        return;
      }
      if (!this.ticket) { this.showToast('Ticket no cargado', 'error'); return; }
      const clientId = (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || null;
      if (!clientId) { this.showToast('El ticket no tiene cliente asociado', 'error'); return; }
      if (!this.ticketServices || this.ticketServices.length === 0) {
        this.showToast('No hay servicios asignados para convertir', 'info');
        return;
      }

      // Validar completitud del cliente antes de crear presupuesto
      try {
        const customer = await firstValueFrom(this.customersService.getCustomer(String(clientId)));
        const comp = this.customersService.computeCompleteness(customer);
        if (!comp.complete) {
          // 'warning' no es tipo permitido en showToast -> usar 'info'
          this.showToast('El cliente está incompleto y no puede generar presupuestos. Faltan: ' + comp.missingFields.join(', '), 'info');
          return;
        }
      } catch (e: any) {
        this.showToast('No se pudo validar el cliente para el presupuesto: ' + (e?.message || ''), 'error');
        return;
      }

      // Construir DTO de creación de presupuesto
      const items = (this.ticketServices || []).map((it: any) => ({
        description: (it?.service?.name || 'Servicio'),
        quantity: Math.max(1, Number(it?.quantity || 1)),
        unit_price: Math.max(0, Number(this.getUnitPrice(it) || 0)),
        tax_rate: 21,
        notes: it?.service?.description || null,
        service_id: it?.service?.id || null,
        product_id: null
      }));

      const dto = {
        client_id: String(clientId),
        title: `Presupuesto Ticket #${(this.ticket as any)?.ticket_number || ''} - ${(this.ticket as any)?.title || ''}`.trim(),
        description: (this.ticket as any)?.description || '',
        items,
        // Link to ticket for uniqueness enforcement server-side
        ticket_id: (this.ticket as any)?.id || null
      } as any;

      this.showToast('Creando presupuesto...', 'info', 2500);
      const quote = await firstValueFrom(this.quotesService.createQuote(dto));
      this.activeQuoteId = quote?.id || null;
      this.showToast(`Se ha creado el presupuesto a partir del ticket #${(this.ticket as any)?.ticket_number || ''}`, 'success');
      // Navegar al editor de presupuesto
      try {
        this.router.navigate(['/presupuestos', 'edit', quote.id]);
      } catch {
        // Fallback a detalle si el editor no está disponible
        this.router.navigate(['/presupuestos', quote.id]);
      }
    } catch (err: any) {
      console.error('Error creando presupuesto desde ticket:', err);
      this.showToast('Error creando presupuesto: ' + (err?.message || ''), 'error');
    }
  }

  // Helper: Check if ticket is in a final/solved state
  isTicketSolved(): boolean {
    return this.ticket?.stage?.workflow_category === 'final' || this.ticket?.stage?.name === 'Solucionado';
  }

  // Client action: Mark ticket as solved
  async markAsSolved() {
    if (!this.ticket) return;

    // Find 'Solucionado' or a final stage
    const solvedStage = this.allStages.find(s =>
      s.name.toLowerCase() === 'solucionado' ||
      s.workflow_category === 'final'
    );

    if (!solvedStage) {
      this.showToast('No se encontró un estado "Solucionado" configurado.', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de que quieres marcar este ticket como solucionado?')) return;

    try {
      this.loading = true;
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: solvedStage.id })
        .eq('id', this.ticket.id);

      if (error) throw error;

      this.showToast('Ticket marcado como solucionado', 'success');
      await this.loadTicketDetail();
    } catch (err: any) {
      this.showToast('Error al actualizar ticket: ' + err.message, 'error');
    } finally {
      this.loading = false;
    }
  }

  async deleteTicket() {

    if (!confirm('¿Estás seguro de que deseas eliminar este ticket?')) return;

    try {
      await this.ticketsService.deleteTicket(this.ticketId!);
      this.router.navigate(['/tickets']);
    } catch (error: any) {
      this.showToast('Error al eliminar ticket: ' + (error?.message || ''), 'error');
    }
  }


  insertMacro(macro: TicketMacro) {
    if (this.editor) {
      this.editor.commands.insertContent(macro.content);
      this.toggleMacrosDropdown();
    }
  }

  toggleMacrosDropdown() {
    this.showMacrosDropdown = !this.showMacrosDropdown;
  }

  get showMacrosDropdown(): boolean {
    return this._showMacrosDropdown;
  }
  set showMacrosDropdown(val: boolean) {
    this._showMacrosDropdown = val;
  }
  private _showMacrosDropdown = false;



  // SLA Helpers
  get firstResponseTime(): string | null {
    if (!this.ticket?.first_response_at) return null;
    const start = new Date(this.ticket.created_at).getTime();
    const end = new Date(this.ticket.first_response_at).getTime();
    const diffMins = Math.round((end - start) / 60000);
    return `${diffMins} min`;
  }

  get resolutionTime(): string | null {
    if (!this.ticket?.resolution_time_mins) return null;
    return `${this.ticket.resolution_time_mins} min`;
  }

  changeStage() {
    if (!this.ticket) return;
    this.selectedStageId = this.ticket.stage_id || '';
    this.showChangeStageModal = true;
    document.body.classList.add('modal-open');
  }

  updateHours() {
    if (!this.ticket) return;
    this.newHoursValue = this.getActualHours();
    this.showUpdateHoursModal = true;
    document.body.classList.add('modal-open');
  }

  addAttachment() {
    this.showAttachmentModal = true;
    document.body.classList.add('modal-open');
  }

  // Modal methods
  closeChangeStageModal() {
    this.showChangeStageModal = false;
    document.body.classList.remove('modal-open');
  }

  closeUpdateHoursModal() {
    this.showUpdateHoursModal = false;
    document.body.classList.remove('modal-open');
  }

  closeAttachmentModal() {
    this.showAttachmentModal = false;
    this.selectedFile = null;
    document.body.classList.remove('modal-open');
  }

  // Robust body scroll lock helpers
  private _scrollTopBackup: number | null = null;
  lockBodyScroll() {
    try {
      // Save current scroll position
      this._scrollTopBackup = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      // Add inline style to prevent scrolling and keep visual position
      document.body.style.top = `-${this._scrollTopBackup}px`;
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } catch (e) {
      // Fallback: add modal-open class which sets overflow hidden via scss
      document.body.classList.add('modal-open');
    }
  }

  unlockBodyScroll() {
    try {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (this._scrollTopBackup !== null) {
        window.scrollTo(0, this._scrollTopBackup);
      }
      this._scrollTopBackup = null;
    } catch (e) {
      document.body.classList.remove('modal-open');
    }
  }

  async loadTicketDetail() {
    try {
      this.loading = true;
      this.error = null;

      // Cargar ticket con relaciones
      const { data: ticketData, error: ticketError } = await this.supabase.getClient()
        .from('tickets')
        .select(`
          *,
          client:clients(id, name, email, phone),
          stage:ticket_stages(id, name, position, color),
          company:companies(id, name),
          assigned_user:users(id, name, email)
        `)
        .eq('id', this.ticketId)
        .single();

      if (ticketError) throw new Error('Error cargando ticket: ' + ticketError.message);
      console.log('🎫 Ticket loaded:', ticketData);
      console.log('🎫 Initial Attachment URL:', ticketData.initial_attachment_url);
      this.ticket = ticketData;

      // UI-level check: does a quote already exist for this ticket?
      try {
        await this.checkActiveQuoteForTicket();
      } catch { }

      // Determine company ID early
      const companyId = ticketData.company_id || ticketData.company?.id || this.authService.userProfile?.company_id;

      // Parallelize independent data loading
      await Promise.all([
        this.loadTicketServices(),
        this.loadTicketProducts(),
        this.loadTicketDevices(),
        this.loadComments(),
        this.loadMacros(),
        this.loadStaff(companyId) // Use the company ID from the ticket
      ]);

      // Cargar estados visibles (genéricos no ocultos + específicos de empresa)
      try {
        const { data, error } = await this.stagesSvc.getVisibleStages();
        if (error) {
          console.warn('Error cargando estados visibles:', error);
          this.allStages = [];
        } else {
          this.allStages = (data || []).slice().sort((a: any, b: any) => (Number(a?.position ?? 0) - Number(b?.position ?? 0)));

          // --- First Open Auto-Advance ---
          // DISABLED: User requested "First Open" logic to be replaced by "First Staff Comment" logic.
          /*
          if (this.ticket && !this.ticket.is_opened && !this.isClient()) {
            await this.handleFirstOpenAutoAdvance();
          }
           */
          // Ensure it is marked as opened regardless
          if (this.ticket && !this.ticket.is_opened && !this.isClient()) {
            try { this.ticketsService.markTicketOpened(this.ticket.id); } catch { }
          }
        }
      } catch (err) {
        console.warn('Excepción cargando estados visibles:', err);
        this.allStages = [];
      }

      // Load history (timeline)
      await this.loadTicketHistory();


    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      // Ensure the editor initializes after the DOM renders the *ngIf block
      setTimeout(() => {
        try {
          this.initializeEditor();
        } catch { }
      }, 0);
    }
  }

  async loadMacros() {
    if (!this.ticket?.company_id) return;
    try {
      this.macros = await this.ticketsService.getMacros(this.ticket.company_id);
    } catch (err) {
      console.warn('Error loading macros:', err);
    }
  }

  async loadTicketHistory() {
    this.recentActivity = [];
    if (!this.ticketId) return;

    try {
      // Use the new Enterprise Timeline Service
      const timelineEvents = await this.ticketsService.getTicketTimeline(this.ticketId);

      this.recentActivity = timelineEvents.map(event => ({
        event_type: event.event_type,
        created_at: event.created_at,
        actor: event.actor,
        metadata: event.metadata,
        description: this.getEventDescription(event) // Helper to generate text if needed
      }));

    } catch (err) {
      console.warn('Error loading timeline:', err);
      // Fallback or leave empty
    }
  }

  getEventDescription(event: any): string {
    switch (event.event_type) {
      case 'creation': return 'Ticket creado';
      case 'stage_change': return `Cambió estado a ${event.metadata?.new_stage}`;
      case 'assignment_change': return `Asignó a ${event.metadata?.new_assignee || 'nadie'}`;
      case 'priority_change': return 'Cambió prioridad';
      case 'comment': return 'Añadió un comentario';
      default: return 'Actividad registrada';
    }
  }

  /**
   * Look for an existing quote created from this ticket and set activeQuoteId if found.
   * We match by client and a title pattern "Presupuesto Ticket #<ticket_number>".
   */
  private async checkActiveQuoteForTicket(): Promise<void> {
    try {
      const ticketId = (this.ticket as any)?.id;
      if (!ticketId) { this.activeQuoteId = null; return; }
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('quotes')
        .select('id, status')
        .eq('ticket_id', ticketId)
        .in('status', ['draft', 'sent', 'viewed', 'accepted'])
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) { this.activeQuoteId = null; return; }
      const found = (data || [])[0];
      this.activeQuoteId = found?.id || null;
    } catch (e) {
      this.activeQuoteId = null;
    }
  }

  async saveStageChange() {
    if (!this.ticket || !this.selectedStageId) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: this.selectedStageId })
        .eq('id', this.ticket.id);
      if (error) throw error;

      // Log timeline history
      const newStage = this.allStages.find(s => s.id === this.selectedStageId);
      if (newStage) {
        await this.addSystemComment(`Cambiado a: ${newStage.name}`);
      }

      await this.loadTicketDetail(); // This will reload activity
      this.closeChangeStageModal();
    } catch (err: any) {
      this.showToast('Error al cambiar estado: ' + (err?.message || err), 'error');
    }
  }

  // Persist hours update from modal
  async saveHoursUpdate() {
    if (!this.ticket) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ actual_hours: this.newHoursValue })
        .eq('id', this.ticket.id);
      if (error) throw error;
      // Update local
      this.ticket.actual_hours = this.newHoursValue;
      // System comment
      const comment = `Horas reales actualizadas a ${this.newHoursValue}h`;
      await this.addSystemComment(comment);
      this.closeUpdateHoursModal();
    } catch (err: any) {
      this.showToast('Error al actualizar horas: ' + (err?.message || err), 'error');
    }
  }

  onFileSelected(event: any) {
    const file = (event?.target?.files || [])[0];
    this.selectedFile = file || null;
  }

  async uploadAttachment() {
    if (!this.ticket || !this.selectedFile) return;
    try {
      // Placeholder: Implement storage upload if needed
      // After upload, add a system comment with the file name
      await this.addSystemComment(`Archivo adjuntado: ${this.selectedFile.name}`);
      this.selectedFile = null;
      this.closeAttachmentModal();
      this.showToast('Archivo adjuntado (simulado)', 'success');
    } catch (err: any) {
      this.showToast('Error al adjuntar archivo: ' + (err?.message || err), 'error');
    }
  }

  async addSystemComment(content: string) {
    try {
      await this.supabase.getClient().from('ticket_comments').insert({
        ticket_id: this.ticketId,
        comment: content,
        is_internal: true
      });
      await this.loadComments();
    } catch (e) {
      console.warn('No se pudo registrar comentario del sistema');
    }
  }

  printTicket() {
    try { window.print(); } catch { }
  }

  hasEditorContent(): boolean {
    if (!this.editor) return false;
    const html = this.editor.getHTML().trim();
    const text = this.editor.getText().trim();
    return !!text || /<img\b/i.test(html);
  }



  private async uploadCommentImage(file: File): Promise<string | null> {
    // Backward-compatible wrapper for images
    return this.uploadCommentFile(file);
  }

  private async uploadCommentFile(file: File): Promise<string | null> {
    if (!this.ticket) return null;
    try {
      this.isUploadingImage = true;
      const bucket = 'attachments';
      const originalExt = (file.name.split('.').pop() || '').toLowerCase();
      const ext = originalExt || 'bin';
      const path = `tickets/${this.ticket.id}/comments/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await this.supabase.getClient().storage
        .from(bucket)
        .upload(path, file);
      if (uploadError) throw uploadError;
      // Always create a signed URL (bucket is private, public URL may 400)
      const { data: signed, error: signErr } = await this.supabase.getClient()
        .storage.from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const url = signed?.signedUrl || '';

      // Optional: register in attachments table (works for any file type)
      try {
        await this.supabase.getClient().from('attachments').insert({
          company_id: (this.ticket as any)?.company_id,
          job_id: null,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type
        });
      } catch { }

      return url || null;
    } catch (e: any) {
      console.error('Error subiendo imagen pegada:', e);
      this.showToast('Error subiendo imagen', 'error');
      return null;
    } finally {
      this.isUploadingImage = false;
    }
  }

  // Handle file attachment selection from the file input
  async onCommentFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const isImage = file.type.startsWith('image/');

    try {
      this.isUploadingImage = true;
      const url = await this.uploadCommentFile(file);

      if (url && this.editor) {
        if (isImage) {
          // Insert image into editor
          this.editor.chain().focus().setImage({ src: url, alt: file.name } as any).run();
        } else {
          // Insert file as a link with icon
          const fileIcon = this.getFileIcon(file.name);
          const linkHtml = `<a href="${url}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:underline"><i class="${fileIcon}"></i> ${file.name}</a>`;
          this.editor.chain().focus().insertContent(linkHtml).run();
        }
        this.showToast('Archivo adjuntado correctamente', 'success');
      }
    } catch (e) {
      console.error('Error adjuntando archivo:', e);
      this.showToast('Error al adjuntar archivo', 'error');
    } finally {
      this.isUploadingImage = false;
      // Reset input to allow selecting same file again
      input.value = '';
    }
  }

  // Helper to get appropriate icon for file types
  private getFileIcon(filename: string): string {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const icons: Record<string, string> = {
      pdf: 'fas fa-file-pdf',
      doc: 'fas fa-file-word',
      docx: 'fas fa-file-word',
      xls: 'fas fa-file-excel',
      xlsx: 'fas fa-file-excel',
      txt: 'fas fa-file-alt',
      png: 'fas fa-file-image',
      jpg: 'fas fa-file-image',
      jpeg: 'fas fa-file-image',
      gif: 'fas fa-file-image'
    };
    return icons[ext] || 'fas fa-file';
  }

  private insertTempImage(objectUrl: string, tempId: string, alt: string) {
    if (!this.editor) return;
    // Insert image node with our custom schema attribute dataTempId
    this.editor.chain().focus().insertContent({ type: 'image', attrs: { src: objectUrl, alt, dataTempId: tempId } as any }).run();
  }

  private async linkCommentAttachments(commentId: string, html: string) {
    try {
      const imgSrcs = this.extractImageSrcs(html || '');
      const linkHrefs = this.extractAnchorHrefs(html || '');
      const srcs = [...imgSrcs, ...linkHrefs];
      if (srcs.length === 0) return;
      const bucket = 'attachments';
      for (const src of srcs) {
        const path = this.extractStoragePathFromUrl(src, bucket);
        if (!path) continue;
        // Find attachment by file_path or insert if missing
        let attachmentId: string | null = null;
        try {
          const { data: existing } = await this.supabase.getClient()
            .from('attachments')
            .select('id')
            .eq('file_path', path)
            .limit(1)
            .single();
          attachmentId = existing?.id || null;
        } catch { }
        if (!attachmentId) {
          // create minimal row
          const { data: created } = await this.supabase.getClient()
            .from('attachments')
            .insert({
              company_id: (this.ticket as any)?.company_id,
              file_name: path.split('/').pop() || 'image',
              file_path: path
            })
            .select('id')
            .single();
          attachmentId = created?.id || null;
        }
        if (attachmentId) {
          try {
            // Prefer secure insert via Edge Function (uses service_role under the hood)
            const payload = { p_comment_id: commentId, p_attachment_id: attachmentId };
            const { data: funcData, error: funcError } = await this.supabase.getClient()
              .functions.invoke('upsert-ticket-comment-attachment', { body: payload });
            if (funcError) throw funcError;
          } catch (efErr) {
            // Fallback: direct insert (if RLS allows)
            try {
              await this.supabase.getClient().from('ticket_comment_attachments').insert({
                comment_id: commentId,
                attachment_id: attachmentId
              });
            } catch (dbErr) {
              console.warn('No se pudo crear vínculo de comentario-adjunto:', dbErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn('No se pudieron vincular attachments al comentario:', e);
    }
  }

  private extractImageSrcs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return Array.from(div.querySelectorAll('img'))
      .map(img => img.getAttribute('src') || '')
      .filter(Boolean);
  }

  private extractAnchorHrefs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return Array.from(div.querySelectorAll('a'))
      .map(a => a.getAttribute('href') || '')
      .filter(Boolean);
  }

  private extractStoragePathFromUrl(url: string, bucket: string): string | null {
    try {
      // Public URL pattern: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
      const pubRe = new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`);
      const m = url.match(pubRe);
      if (m && m[1]) return m[1];
      // Signed URL pattern: .../object/sign/<bucket>/<path>?token=...
      const signRe = new RegExp(`/storage/v1/object/sign/${bucket}/([^?]+)`);
      const m2 = url.match(signRe);
      if (m2 && m2[1]) return m2[1];
      return null;
    } catch { return null; }
  }

  // Native event guards to ensure Chrome doesn't navigate away when dropping files
  onNativeDragOver(e: DragEvent) {
    if (e?.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  onNativeDrop(e: DragEvent) {
    if (e?.dataTransfer?.files?.length) {
      e.preventDefault();
      e.stopPropagation();
      this.handleEditorDrop(e);
    }
  }

  // Services selection modal methods (class scope)
  async openServicesModal() {
    if (!this.ticket) return;
    await this.loadServicesCatalog();
    // Preselect from current ticket services
    this.selectedServiceIds = new Set((this.ticketServices || []).map((ts: any) => ts?.service?.id).filter(Boolean));
    // Prefill quantities from current ticket services
    this.selectedServiceQuantities = new Map();
    for (const it of this.ticketServices || []) {
      const sid = it?.service?.id; if (sid) this.selectedServiceQuantities.set(sid, Math.max(1, Number(it.quantity || 1)));
    }
    // Ensure at least one selected for safety
    // Ensure at least one selected for safety - REMOVED to avoid misleading logic
    /*
    if (this.selectedServiceIds.size === 0 && this.servicesCatalog.length > 0) {
      this.selectedServiceIds.add(this.servicesCatalog[0].id);
      // default quantity
      this.selectedServiceQuantities.set(this.servicesCatalog[0].id, 1);
    }
    */
    this.showServicesModal = true;
    document.body.classList.add('modal-open');
    this.lockBodyScroll();
  }

  closeServicesModal() {
    this.showServicesModal = false;
    document.body.classList.remove('modal-open');
    this.unlockBodyScroll();
  }

  async saveServicesSelection() {
    if (!this.ticket) return;
    if (this.selectedServiceIds.size === 0) {
      this.showToast('Debe seleccionar al menos un servicio.', 'info');
      return;
    }
    try {
      const existingQty = new Map<string, number>();
      for (const it of this.ticketServices || []) {
        const sid = it?.service?.id; const q = it?.quantity || 1; if (sid) existingQty.set(sid, q);
      }
      // Use quantities from selectedServiceQuantities if available, otherwise keep existing or 1
      const items = Array.from(this.selectedServiceIds).map(id => {
        const qty = this.selectedServiceQuantities.get(id) || existingQty.get(id) || 1;
        // Lookup service to get base price
        const svcInfo = this.servicesCatalog.find(s => s.id === id);
        let unitPrice = 0;
        if (svcInfo && typeof svcInfo.base_price === 'number') {
          unitPrice = svcInfo.base_price;
        } else {
          // Fallback to existing price if service not in catalog (e.g. hidden/inactive)
          const existing = (this.ticketServices || []).find(ts => ts.service?.id === id);
          unitPrice = (existing?.unit_price || existing?.service?.base_price) || 0;
        }
        return {
          service_id: id,
          quantity: qty,
          unit_price: unitPrice
        };
      });
      const companyIdForReplace = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');
      await this.ticketsService.replaceTicketServices(this.ticket.id, companyIdForReplace, items);
      await this.loadTicketServices();
      this.closeServicesModal();
      this.showToast('Servicios actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error guardando servicios:', err);
      this.showToast('Error al guardar servicios: ' + (err?.message || err), 'error');
    }
  }

  scrollToComment() {
    this.activeTab = 'comments';
    // Small delay to allow tab switch/DOM render
    setTimeout(() => {
      if (this.editorElement && this.editorElement.nativeElement) {
        this.editorElement.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.focusEditor();
      }
    }, 100);
  }

  // Helpers for modal quantity + pricing display
  getServiceUnitPrice(svc: any): number {
    if (!svc) return 0;
    // Prefer explicit base_price on service record
    return typeof svc.base_price === 'number' ? svc.base_price : 0;
  }

  // Parse numeric tolerant of strings using comma as decimal separator
  private parseNumeric(v: any): number {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Return the estimated hours for the given ticket service row multiplied by quantity
  getLineEstimatedHours(serviceItem: any): number {
    try {
      const hrs = this.parseNumeric(serviceItem?.service?.estimated_hours ?? serviceItem?.estimated_hours ?? 0);
      const qty = Math.max(1, Math.floor(this.parseNumeric(serviceItem?.quantity ?? 1)) || 1);
      return Math.round(hrs * qty * 100) / 100;
    } catch (e) {
      return 0;
    }
  }

  getSelectedQuantity(svc: any): number {
    const id = svc?.id; if (!id) return 1;
    return Math.max(1, Number(this.selectedServiceQuantities.get(id) || 1));
  }

  // Inline assigned-services quantity editing handlers
  async onAssignedQuantityChange(serviceItem: any, newVal: any) {
    const sid = serviceItem?.service?.id; if (!sid) return;
    const q = Math.max(1, Math.floor(Number(newVal) || 1));
    serviceItem.quantity = q;
    await this.persistAssignedServiceQuantity(serviceItem);
  }

  increaseAssignedQty(serviceItem: any) { serviceItem.quantity = Math.max(1, (Number(serviceItem.quantity) || 1) + 1); this.onAssignedQuantityChange(serviceItem, serviceItem.quantity); }
  decreaseAssignedQty(serviceItem: any) { serviceItem.quantity = Math.max(1, (Number(serviceItem.quantity) || 1) - 1); this.onAssignedQuantityChange(serviceItem, serviceItem.quantity); }

  private async persistAssignedServiceQuantity(serviceItem: any) {
    const sid = serviceItem?.service?.id; if (!sid || !this.ticket) return;
    try {
      this.savingAssignedServiceIds.add(sid);
      // Build items from current ticketServices, using current quantities
      // Include unit_price when available so DB rows keep price_per_unit/total_price and UI can compute totals
      const items = (this.ticketServices || []).map((it: any) => {
        const unit = this.getUnitPrice(it);
        const obj: any = { service_id: it.service?.id, quantity: Math.max(1, Number(it.quantity || 1)) };
        if (typeof unit === 'number' && unit > 0) obj.unit_price = unit;
        return obj;
      });
      const companyIdForReplace = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');
      await this.ticketsService.replaceTicketServices(this.ticket.id, companyIdForReplace, items);
      // Refresh services to get any persisted price changes
      await this.loadTicketServices();
      this.showToast('Cantidad guardada', 'success');
    } catch (err: any) {
      console.error('Error guardando cantidad asignada:', err);
      this.showToast('Error guardando cantidad: ' + (err?.message || ''), 'error');
    } finally {
      this.savingAssignedServiceIds.delete(sid);
    }
  }

  // Toast helpers (use global ToastService)
  showToast(msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000) {
    const title = type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : 'Info';
    if (type === 'success') this.toastService.success(title, msg, duration);
    else if (type === 'error') this.toastService.error(title, msg, duration);
    else this.toastService.info(title, msg, duration);
  }

  setSelectedQuantity(svc: any, qty: number) {
    const id = svc?.id; if (!id) return;
    const n = Number(qty) || 1;
    const q = Math.max(1, Math.floor(n));
    this.selectedServiceQuantities.set(id, q);
  }

  increaseQty(svc: any) { this.setSelectedQuantity(svc, this.getSelectedQuantity(svc) + 1); }
  decreaseQty(svc: any) { this.setSelectedQuantity(svc, Math.max(1, this.getSelectedQuantity(svc) - 1)); }

  // Load ticket services and map category UUIDs to names
  async loadTicketServices() {
    try {
      const { data: services, error } = await this.supabase.getClient()
        .from('ticket_services')
        .select(`
          *,
          service:services(
            id,
            name,
            description,
            base_price,
            estimated_hours,
            category,
            is_active
          )
        `)
        .eq('ticket_id', this.ticketId);

      if (error) {
        console.warn('Error cargando servicios del ticket:', error);
        this.ticketServices = [];
        return;
      }

      const items = services || [];
      const categoryIds: string[] = Array.from(new Set(
        (items as any[])
          .map((it: any) => it?.service?.category)
          .filter((v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
      ));

      let categoriesById: Record<string, { id: string; name: string }> = {};
      if (categoryIds.length > 0) {
        const { data: cats, error: catErr } = await this.supabase.getClient()
          .from('service_categories')
          .select('id, name')
          .in('id', categoryIds);
        if (!catErr && Array.isArray(cats)) {
          categoriesById = (cats as any[]).reduce((acc, c: any) => { acc[c.id] = { id: c.id, name: c.name }; return acc; }, {} as Record<string, { id: string; name: string }>);
        } else if (catErr) {
          console.warn('Error cargando categorías de servicios:', catErr);
        }
      }

      this.ticketServices = (items as any[]).map((it: any) => {
        const svc = it?.service || {};

        // Ensure estimated_hours is a number
        if (svc && svc.estimated_hours !== undefined && svc.estimated_hours !== null) {
          const n = Number(svc.estimated_hours);
          svc.estimated_hours = Number.isFinite(n) ? n : 0;
        } else {
          svc.estimated_hours = 0;
        }

        // Ensure base_price is a number
        if (svc && svc.base_price !== undefined && svc.base_price !== null) {
          const n = Number(svc.base_price);
          svc.base_price = Number.isFinite(n) ? n : 0;
        } else {
          svc.base_price = 0;
        }

        const cat = svc?.category;
        const isUuid = typeof cat === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat);
        const category_name = isUuid ? (categoriesById[cat]?.name || 'Sin categoría') : (cat || 'Sin categoría');
        return { ...it, service: { ...svc, category_name } };
      });

      // Add service names to timeline activity (if not already present)
      if (this.ticketServices && this.ticketServices.length > 0) {
        this.ticketServices.forEach((ts: any) => {
          const serviceName = ts?.service?.name;
          const createdAt = ts?.created_at || this.ticket?.updated_at;

          // Check if already exists from system comments to avoid duplicates
          const alreadyExists = this.recentActivity.some(a =>
            a.action.includes(serviceName) &&
            Math.abs(new Date(a.created_at).getTime() - new Date(createdAt).getTime()) < 5000 // 5 sec threshold
          );

          if (serviceName && !alreadyExists) {
            this.recentActivity.push({
              action: `Servicio añadido: ${serviceName}`,
              created_at: createdAt,
              icon: 'fas fa-tools',
              color: 'text-purple-500'
            });
          }
        });
        // Re-sort
        this.recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    } catch (error) {
      console.error('Error en loadTicketServices:', error);
      this.ticketServices = [];
    }
  }

  // UI helpers
  formatDescription(description?: string): string {
    const text = String(description || '');
    return text
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="mt-2 rounded-lg max-w-full h-auto border border-gray-200 dark:border-gray-700 block" />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }

  getPriorityClasses(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.classes || this.ticketPriorityConfig['normal'].classes;
  }

  getPriorityLabel(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.label || this.ticketPriorityConfig['normal'].label;
  }

  getPriorityIcon(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.icon || this.ticketPriorityConfig['normal'].icon;
  }

  // Status/Stage category helpers (using stage_category from ticket_stages table)
  getStatusClasses(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.classes || this.ticketStatusConfig['open'].classes;
  }

  getStatusLabel(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.label || this.ticketStatusConfig['open'].label;
  }

  getStatusIcon(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.icon || this.ticketStatusConfig['open'].icon;
  }



  getVisibleStages(): ConfigStage[] {
    return this.allStages || [];
  }

  private currentStageIndex(): number {
    const id = this.ticket?.stage_id;
    return Math.max(0, (this.allStages || []).findIndex(s => s.id === id));
  }

  getStagePosition(index: number): number {
    const total = Math.max(1, (this.allStages || []).length - 1);
    return (index / total) * 100;
  }

  getStageMarkerClass(stage: ConfigStage): string {
    const idx = (this.allStages || []).findIndex(s => s.id === stage.id);
    const cur = this.currentStageIndex();
    if (idx < cur) return 'bg-blue-500';
    if (idx === cur) return 'bg-blue-600 ring-2 ring-blue-300';
    return 'bg-gray-300';
  }

  isStageCompleted(stage: ConfigStage): boolean {
    const idx = (this.allStages || []).findIndex(s => s.id === stage.id);
    return idx <= this.currentStageIndex();
  }

  getProgressPercentage(): number {
    const total = Math.max(1, (this.allStages || []).length - 1);
    return (this.currentStageIndex() / total) * 100;
  }

  // Get current stage color for progress bar styling
  getCurrentStageColor(): string {
    const stage = this.allStages?.find(s => s.id === this.ticket?.stage_id);
    return stage?.color || '#3b82f6'; // Fallback to blue-500
  }

  formatPrice(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  getDeviceStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      'received': 'bg-blue-100 text-blue-800',
      'in_diagnosis': 'bg-yellow-100 text-yellow-800',
      'in_repair': 'bg-orange-100 text-orange-800',
      'waiting_parts': 'bg-purple-100 text-purple-800',
      'waiting_client': 'bg-indigo-100 text-indigo-800',
      'ready': 'bg-green-100 text-green-800',
      'delivered': 'bg-gray-100 text-gray-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return statusClasses[status] || 'bg-gray-100 text-gray-800';
  }

  getDeviceStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      'received': 'Recibido',
      'in_diagnosis': 'En Diagnóstico',
      'in_repair': 'En Reparación',
      'waiting_parts': 'Esperando Repuestos',
      'waiting_client': 'Esperando Cliente',
      'ready': 'Listo',
      'delivered': 'Entregado',
      'cancelled': 'Cancelado'
    };
    return statusLabels[status] || status;
  }

  calculateServicesTotal(): number {
    try {
      const items = this.ticketServices || [];
      return items.reduce((sum: number, serviceItem: any) => sum + this.getLineTotal(serviceItem), 0);
    } catch (e) {
      return 0;
    }
  }

  calculateProductsTotal(): number {
    try {
      const items = this.ticketProducts || [];
      return items.reduce((sum: number, productItem: any) => sum + this.getProductLineTotal(productItem), 0);
    } catch (e) {
      return 0;
    }
  }

  calculateEstimatedHours(): number {
    try {
      const items = this.ticketServices || [];
      const total = items.reduce((sum: number, serviceItem: any) => {
        const hours = this.parseNumeric(serviceItem?.service?.estimated_hours ?? serviceItem?.estimated_hours ?? 0);
        const qty = Math.max(1, Math.floor(this.parseNumeric(serviceItem?.quantity ?? 1)) || 1);
        return sum + hours * qty;
      }, 0);
      return Math.round(total * 100) / 100;
    } catch (e) {
      return 0;
    }
  }

  getEstimatedHours(): number {
    // Prefer an explicit ticket-level override if present and numeric
    const t: any = this.ticket as any;
    const ticketEst = t && (t.estimated_hours ?? t.estimatedHours ?? t.estimatedHoursRaw);
    const tNum = Number(ticketEst);
    if (Number.isFinite(tNum) && tNum > 0) return Math.round(tNum * 100) / 100;
    return this.calculateEstimatedHours();
  }

  getActualHours(): number {
    if (!this.ticket) return 0;
    // Support multiple possible column names for backward compatibility
    const t2: any = this.ticket as any;
    const raw = t2.actual_hours ?? t2.hours_real ?? t2.actualHours ?? t2.hoursReal ?? t2.hours_real_backup;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCompanyName(): string {
    return (this.ticket as any)?.company?.name || '';
  }

  // Copy text to clipboard with a friendly toast
  copyToClipboard(text?: string) {
    if (!text) {
      this.showToast('Nada para copiar', 'info');
      return;
    }
    try {
      navigator.clipboard.writeText(text);
      this.showToast('Copiado al portapapeles', 'success');
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); this.showToast('Copiado al portapapeles', 'success'); } catch { this.showToast('No se pudo copiar', 'error'); }
      ta.remove();
    }
  }

  // Pricing helpers: prefer persisted values from ticket_services with fallback to service.base_price
  getUnitPrice(item: any): number {
    let fromRelation: number | null = null;
    if (item?.price_per_unit !== undefined && item?.price_per_unit !== null) {
      fromRelation = Number(item.price_per_unit);
    } else if (item?.unit_price !== undefined && item?.unit_price !== null) {
      fromRelation = Number(item.unit_price);
    }

    let fromService = 0;
    if (item?.service?.base_price !== undefined && item?.service?.base_price !== null) {
      fromService = Number(item.service.base_price);
    }

    // If fromRelation is a valid number, use it. Otherwise fallback.
    // Note: If stored price is 0, we trust it IF it was a valid number, 
    // BUT given the bug context, if it's 0 we might want to fallback if base_price > 0.
    // However, intentional 0 price is possible.
    // For the specific bug fix: The bug caused 0 to be stored. 
    // We'll use the fallback if fromRelation is falsy (0) AND fromService is truthy (>0),
    // which implies the stored 0 is likely an error. 
    // However, to be safe and allow intentional free items, we usually shouldn't override 0.
    // But due to the widespread issue, we will allow fallback if 0 to fix the display for existing tickets.
    // This is a trade-off: intentional free items need to be handled carefully, but 
    // likely services usually have a price.
    if (fromRelation && !isNaN(fromRelation)) return fromRelation;
    // If 0 or NaN, try fallback
    if (fromService && !isNaN(fromService)) return fromService;

    return fromRelation || 0;
  }

  getLineTotal(item: any): number {
    if (typeof item?.total_price === 'number') return item.total_price;
    const qty = Math.max(1, Number(item?.quantity || 1));
    return this.getUnitPrice(item) * qty;
  }

  // ============================================
  // PRODUCTS MANAGEMENT
  // ============================================

  async openProductsModal() {
    try {
      this.showProductsModal = true;
      document.body.classList.add('modal-open');

      // Add to history for back button
      history.pushState({ modal: 'products-modal' }, '');
      if (!this.popStateListener) {
        this.popStateListener = (event: PopStateEvent) => {
          if (this.showProductsModal) this.closeProductsModal();
          else if (this.showServicesModal) this.closeServicesModal();
          else if (this.showDevicesModal) this.closeDevicesModal();
        };
        window.addEventListener('popstate', this.popStateListener);
      }

      // Load products catalog
      this.productsService.getProducts().subscribe({
        next: (products) => {
          this.productsCatalog = products || [];
          this.filteredProducts = [...this.productsCatalog];

          // Pre-select currently assigned products
          this.selectedProductIds.clear();
          this.tempProductQuantities.clear();
          for (const item of this.ticketProducts || []) {
            if (item.product?.id) {
              this.selectedProductIds.add(item.product.id);
              this.tempProductQuantities.set(item.product.id, item.quantity || 1);
            }
          }
        },
        error: (err) => {
          console.error('Error loading products:', err);
          this.showToast('Error cargando productos', 'error');
        }
      });
    } catch (err) {
      console.error('Error opening products modal:', err);
    }
  }

  closeProductsModal() {
    this.showProductsModal = false;
    document.body.classList.remove('modal-open');
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
  }

  // --- Product Creation Modal (create new product) ---

  openCreateProductModal() {
    console.log('openCreateProductModal called!');
    this.showCreateProductModal = true;
    document.body.classList.add('modal-open');
  }

  closeCreateProductModal() {
    this.showCreateProductModal = false;
    document.body.classList.remove('modal-open');
  }

  async onProductCreated(product?: any) {
    this.closeCreateProductModal();

    if (product && this.ticket?.id) {
      // If we have a valid product and ticket context, link it immediately
      try {
        const payload = {
          ticket_id: this.ticket.id,
          product_id: product.id,
          quantity: 1,
          price_per_unit: product.price || 0,
          company_id: (this.ticket as any).company_id
        };

        const { error } = await this.supabase.getClient()
          .from('ticket_products')
          .insert(payload);

        if (error) throw error;

        this.toastService.success('Éxito', 'Producto creado y añadido al ticket');
        await this.loadTicketProducts();
      } catch (err: any) {
        console.error('Error linking new product to ticket:', err);
        // Fallback message if linking fails but creation succeeded
        this.toastService.warning('Producto creado', 'El producto se creó pero no se pudo vincular automáticamente al ticket.');
      }
    } else {
      this.toastService.success('Éxito', 'Producto creado correctamente');
    }
  }

  filterProductsList() {
    if (!this.productSearchText.trim()) {
      this.filteredProducts = [...this.productsCatalog];
      return;
    }
    const search = this.productSearchText.toLowerCase();
    this.filteredProducts = this.productsCatalog.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.brand?.toLowerCase().includes(search) ||
      p.category?.toLowerCase().includes(search)
    );
  }

  toggleProductSelection(product: any) {
    const id = product?.id;
    if (!id) return;
    if (this.selectedProductIds.has(id)) {
      this.selectedProductIds.delete(id);
      this.tempProductQuantities.delete(id);
    } else {
      this.selectedProductIds.add(id);
      this.tempProductQuantities.set(id, 1);
    }
  }

  getProductQuantity(product: any): number {
    return this.tempProductQuantities.get(product?.id) || 1;
  }

  setProductQuantity(product: any, qty: number) {
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    this.tempProductQuantities.set(product?.id, n);
  }

  increaseProductQty(product: any) {
    this.setProductQuantity(product, this.getProductQuantity(product) + 1);
  }

  decreaseProductQty(product: any) {
    this.setProductQuantity(product, Math.max(1, this.getProductQuantity(product) - 1));
  }

  async saveProductsSelection() {
    if (!this.ticket) return;
    try {
      // Build items array
      const items = Array.from(this.selectedProductIds).map(productId => {
        const prod = this.productsCatalog.find(p => p.id === productId);
        let unitPrice = 0;
        if (prod && typeof prod.price === 'number') {
          unitPrice = prod.price;
        } else {
          // Fallback if product not in catalog (e.g. archived)
          const existing = (this.ticketProducts || []).find(tp => tp.product?.id === productId);
          unitPrice = (existing?.price_per_unit || existing?.product?.price) || 0;
        }
        return {
          product_id: productId,
          quantity: this.tempProductQuantities.get(productId) || 1,
          unit_price: unitPrice
        };
      });

      // Get company ID
      const companyId = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');

      // Use tickets service to save products
      await this.ticketsService.replaceTicketProducts(this.ticket.id, companyId, items);
      await this.loadTicketProducts();

      this.closeProductsModal();
      this.showToast('Productos actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error saving products:', err);
      this.showToast('Error guardando productos: ' + (err?.message || ''), 'error');
    }
  }

  async loadTicketProducts() {
    if (!this.ticket) return;
    try {
      const { data, error } = await this.supabase.getClient()
        .from('ticket_products')
        .select('*, product:products(*)')
        .eq('ticket_id', this.ticket.id);

      if (error) throw error;

      // Coerce product prices
      this.ticketProducts = (data || []).map((tp: any) => {
        const prod = tp.product || {};
        if (prod.price !== undefined && prod.price !== null) {
          prod.price = Number(prod.price) || 0;
        }
        return tp;
      });

    } catch (err) {
      console.error('Error loading ticket products:', err);
      this.ticketProducts = [];
    }
  }

  getProductUnitPrice(item: any): number {
    const p1 = Number(item?.price_per_unit);
    const p2 = Number(item?.product?.price);
    const v1 = !isNaN(p1) ? p1 : 0;
    const v2 = !isNaN(p2) ? p2 : 0;
    // Fallback if 0 (bug fix heuristic)
    return v1 || v2 || 0;
  }

  getProductLineTotal(item: any): number {
    const qty = Math.max(1, Number(item?.quantity || 1));
    return this.getProductUnitPrice(item) * qty;
  }

  async removeProductFromTicket(productId: string) {
    if (!this.ticket || !confirm('¿Eliminar este producto del ticket?')) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_products')
        .delete()
        .eq('ticket_id', this.ticket.id)
        .eq('product_id', productId);

      if (error) throw error;
      await this.loadTicketProducts();
      this.showToast('Producto eliminado', 'success');
    } catch (err: any) {
      console.error('Error removing product:', err);
      this.showToast('Error eliminando producto', 'error');
    }
  }

  // ============================================
  // DEVICES MANAGEMENT
  // ============================================

  async openDevicesModal() {
    try {
      this.showDevicesModal = true;
      document.body.classList.add('modal-open');

      // Add to history
      history.pushState({ modal: 'devices-modal' }, '');
      if (!this.popStateListener) {
        this.popStateListener = (event: PopStateEvent) => {
          if (this.showDevicesModal) this.closeDevicesModal();
          else if (this.showProductsModal) this.closeProductsModal();
          else if (this.showServicesModal) this.closeServicesModal();
        };
        window.addEventListener('popstate', this.popStateListener);
      }
      this.lockBodyScroll();

      // Load available devices
      // Filter primarily by client_id to ensure we only show devices belonging to the ticket's client
      const ticketClientId = (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id;

      if (ticketClientId) {
        this.availableDevices = this.companyDevices.filter(d => d.client_id === ticketClientId);
      } else {
        // If no client assigned to ticket yet, show all? Or none? Safe to show all for agent, none for client?
        // User requested: "el usuario sólo liste los dispositivos que pertenencen a ese cliente"
        // If no client, maybe we shouldn't show devices or show all.
        // Let's fallback to all if no client, but if isClient() is strictly enforcing RLS, they only see theirs anyway.
        this.availableDevices = [...this.companyDevices];
      }

      this.filteredDevices = [...this.availableDevices];

      // Pre-select linked devices
      this.selectedDeviceIds = new Set(this.linkedDeviceIds);
    } catch (err) {
      console.error('Error opening devices modal:', err);
    }
  }

  closeDevicesModal() {
    this.showDevicesModal = false;
    this.unlockBodyScroll();
    document.body.classList.remove('modal-open');
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
  }

  filterDevicesList() {
    if (!this.deviceSearchText.trim()) {
      this.filteredDevices = [...this.availableDevices];
      return;
    }
    const search = this.deviceSearchText.toLowerCase();
    this.filteredDevices = this.availableDevices.filter(d =>
      d.brand?.toLowerCase().includes(search) ||
      d.model?.toLowerCase().includes(search) ||
      d.device_type?.toLowerCase().includes(search) ||
      d.imei?.toLowerCase().includes(search)
    );
  }

  toggleDeviceSelection(device: Device) {
    const id = device?.id;
    if (!id) return;
    if (this.selectedDeviceIds.has(id)) {
      this.selectedDeviceIds.delete(id);
    } else {
      this.selectedDeviceIds.add(id);
    }
  }

  async saveDevicesSelection() {
    if (!this.ticket) return;
    try {
      // Delete all existing links
      await this.supabase.getClient()
        .from('ticket_devices')
        .delete()
        .eq('ticket_id', this.ticket.id);

      // Insert new links
      if (this.selectedDeviceIds.size > 0) {
        const links = Array.from(this.selectedDeviceIds).map(deviceId => ({
          ticket_id: this.ticket!.id,
          device_id: deviceId
        }));

        const { error } = await this.supabase.getClient()
          .from('ticket_devices')
          .insert(links);

        if (error) throw error;
      }

      await this.loadTicketDevices();
      this.closeDevicesModal();
      this.showToast('Dispositivos actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error saving devices:', err);
      this.showToast('Error guardando dispositivos: ' + (err?.message || ''), 'error');
    }
  }

  // ============================================
  // CREATE DEVICE MODAL LOGIC (Ported)
  // ============================================


  // ============================================
  // BRAND AUTOCOMPLETE LOGIC
  // ============================================

  loadBrands() {
    this.productMetadataService.getBrands().subscribe(brands => {
      this.availableBrands = brands;
      this.filterBrandsList();
    });
  }

  filterBrandsList() {
    const search = (this.deviceFormData.brand || '').toLowerCase();
    this.filteredBrands = this.availableBrands.filter(b =>
      b.name.toLowerCase().includes(search)
    );
    this.showBrandInput = true;
  }

  selectBrand(brand: any) {
    this.deviceFormData.brand = brand.name;
    this.deviceFormData.brand_id = brand.id; // Store brand_id for filtering models
    this.showBrandInput = false;
    this.deviceFormData.model = ''; // Reset model when brand changes
    this.loadModels(brand.id);
  }

  onBrandEnter() {
    // If exact match in filtered, select it
    const exactMatch = this.filteredBrands.find(b => b.name.toLowerCase() === (this.deviceFormData.brand || '').toLowerCase());
    if (exactMatch) {
      this.selectBrand(exactMatch);
    } else {
      // Allow custom brand (will be created in createAndSelectDevice)
      this.showBrandInput = false;
      this.deviceFormData.brand_id = null; // New brand, no ID yet
      this.availableModels = []; // No models for new brand
      this.filteredModels = [];
    }
  }

  // Close brand dropdown on blur (delayed to allow click)
  onBrandBlur() {
    setTimeout(() => {
      this.showBrandInput = false;
    }, 200);
  }

  onBrandFocus() {
    this.loadBrands();
    this.filterBrandsList();
    this.showBrandInput = true;
  }


  // ============================================
  // MODEL AUTOCOMPLETE LOGIC
  // ============================================

  // Model Autocomplete state
  availableModels: any[] = [];
  filteredModels: any[] = [];
  showModelInput = false;


  loadModels(brandId: string) {
    if (!brandId) {
      this.availableModels = [];
      this.filteredModels = [];
      return;
    }
    this.productMetadataService.getModels(brandId).subscribe(models => {
      this.availableModels = models;
      this.filterModelsList();
    });
  }

  filterModelsList() {
    const search = (this.deviceFormData.model || '').toLowerCase();
    this.filteredModels = this.availableModels.filter(m =>
      m.name.toLowerCase().includes(search)
    );
    this.showModelInput = true;
  }

  selectModel(model: any) {
    this.deviceFormData.model = model.name;
    this.showModelInput = false;
  }

  onModelEnter() {
    const exactMatch = this.filteredModels.find(m => m.name.toLowerCase() === (this.deviceFormData.model || '').toLowerCase());
    if (exactMatch) {
      this.selectModel(exactMatch);
    } else {
      this.showModelInput = false;
    }
  }

  onModelFocus() {
    // Only load/show if we have models or if we want to confirm no models
    if (this.availableModels.length > 0 || this.deviceFormData.brand_id) {
      if (this.availableModels.length === 0 && this.deviceFormData.brand_id) {
        this.loadModels(this.deviceFormData.brand_id);
      }
      this.filterModelsList();
      this.showModelInput = true;
    }
  }

  onModelBlur() {
    setTimeout(() => {
      this.showModelInput = false;
    }, 200);
  }

  openCreateDeviceForm() {
    if (this.isClient()) {
      this.clientDevicesModalMode = 'select';
      this.showClientDevicesModal = true;
      this.lockBodyScroll();
      return;
    }

    this.deviceFormData = {
      // Use ticket's client and company context
      company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || '',
      status: 'received',
      priority: 'normal',
      brand: '',
      model: '',
      device_type: '',
      reported_issue: '',
      imei: '',
      color: '',
      condition_on_arrival: ''
    };
    this.selectedDeviceImages = [];
    this.showCreateDeviceForm = true;

    this.returnToSelectionModal = this.showDevicesModal;
    this.showDevicesModal = false;
    this.lockBodyScroll();
  }

  cancelCreateDevice() {
    this.showCreateDeviceForm = false;
    this.deviceFormData = {};
    this.selectedDeviceImages = [];
    this.editingDeviceId = null;
    // Restore the selection modal only if we came from there
    if (this.returnToSelectionModal) {
      if (this.isClient()) {
        this.showClientDevicesModal = true;
      } else {
        this.showDevicesModal = true;
      }
    }
    this.unlockBodyScroll();
  }

  toggleDeletedDevices() {
    this.showDeletedDevices = !this.showDeletedDevices;
    this.loadTicketDevices();
  }

  editDevice(device: any) {
    if (this.isClient()) return; // Extra check

    this.editingDeviceId = device.id;
    this.deviceFormData = { ...device }; // Clone data

    this.returnToSelectionModal = this.showDevicesModal;
    this.showDevicesModal = false; // Hide selection modal if open

    this.showCreateDeviceForm = true;
    this.lockBodyScroll();
  }

  closeClientDevicesModalAndEdit(device: any) {
    this.showClientDevicesModal = false;
    this.editDevice(device);
  }

  async deleteConfirmDevice(device: any) {
    if (this.isClient()) return; // Extra check

    const reason = window.prompt('Por favor ingrese el motivo para eliminar el dispositivo ' + device.brand + ' ' + device.model + ':');
    if (reason === null) return; // Cancelled
    if (!reason.trim()) {
      this.showToast('Debe ingresar un motivo para eliminar el dispositivo', 'error');
      return;
    }

    try {
      await this.devicesService.softDeleteDevice(device.id, reason.trim());
      this.showToast('Dispositivo eliminado correctamente', 'success');
      this.loadTicketDevices();
    } catch (error: any) {
      console.error('Error deleting device:', error);
      this.showToast('Error al eliminar el dispositivo: ' + (error.message || error), 'error');
    }
  }

  async createAndSelectDevice() {
    if (!this.deviceFormData.brand || !this.deviceFormData.model ||
      !this.deviceFormData.device_type || !this.deviceFormData.reported_issue) {
      this.showToast('Por favor complete los campos obligatorios', 'error');
      return;
    }

    try {
      // 1. Ensure brand exists in shared table
      if (this.deviceFormData.brand && this.deviceFormData.company_id) {
        // We use createBrand from metadata service which handles get-or-create logic
        try {
          // Fire and forget or await? Better await to ensure it exists for future queries
          await this.productMetadataService.createBrand(
            this.deviceFormData.brand,
            this.deviceFormData.company_id
          );
        } catch (e) {
          console.warn('Could not sync brand to shared table, proceeding with device creation', e);
        }
      }

      let deviceData = {
        ...this.deviceFormData,
        // Ensure authoritative IDs
        client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id,
        company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      };

      let resultDevice;

      if (this.editingDeviceId) {
        // Update mode
        delete deviceData.id; // Don't update ID
        delete deviceData.created_at;
        delete deviceData.updated_at; // Let DB handle it or service

        resultDevice = await this.devicesService.updateDevice(this.editingDeviceId, deviceData);
        this.showToast('Dispositivo actualizado correctamente', 'success');
      } else {
        // Create mode
        deviceData = {
          ...deviceData,
          status: 'received',
          priority: 'normal',
          received_at: new Date().toISOString()
        };
        resultDevice = await this.devicesService.createDevice(deviceData);
        this.showToast('Dispositivo creado correctamente', 'success');
      }

      // If we created a new device, we MUST link it to the ticket to get the ticket_device_id
      // This is required for the new image storage structure and association
      let ticketDeviceId: string | undefined;

      if (!this.editingDeviceId && resultDevice && this.ticket?.id) {
        try {
          // Link immediately
          ticketDeviceId = await this.devicesService.linkDeviceToTicket(this.ticket.id, resultDevice.id);
          this.linkedDeviceIds.add(resultDevice.id);

          // Add to local list immediately to reflect stats
          this.companyDevices.push(resultDevice);
          if (this.filteredDevices) this.filteredDevices.unshift(resultDevice);
          this.selectedDeviceIds.add(resultDevice.id);
        } catch (linkError) {
          console.error('Error auto-linking created device:', linkError);
          this.showToast('Dispositivo creado pero error al vincular: ' + (linkError as Error).message, 'error');
        }
      } else if (this.editingDeviceId && this.ticket?.id) {
        // If editing, we might already have a link. We need to find the ticket_device_id.
        // Since we don't have it handy, we might need to fetch it or skip passing it if acceptable for updates.
        // But strict requirement says "asociar y mostrar en el ticket".
        // If we are editing, standard flow assumes it's already linked or we don't care about re-linking.
        // But for images, we ideally want them associated with this ticket context.
        // Let's try to find the link id from the loaded devices?
        // The current `availableDevices` or `companyDevices` are simple Device objects.
        // `getTicketDevices` returns devices with media, but maybe not the link ID directly visible?
        // `getTicketDevices` joins `ticket_devices`, but strict typing returns `Device[]`.
        // We might need to query it or just pass ticketId for path structure at least.
        // For now, let's pass ticketId for path structure. ticketDeviceId might be skipped for updates if too complex to fetch synchronously.
      }

      // Upload images if any (works for both create and update)
      if (this.selectedDeviceImages.length > 0) {
        for (const imageData of this.selectedDeviceImages) {
          try {
            await this.devicesService.uploadDeviceImage(
              resultDevice.id,
              imageData.file,
              'arrival',
              'Estado del dispositivo',
              ticketDeviceId, // Pass specific link ID if we have it (newly created)
              this.ticketId || this.ticket?.id, // Pass ticket ID for folder structure (prefer ID from route)
              { brand: resultDevice.brand, model: resultDevice.model } // deviceInfo for naming
            );
          } catch (imageError) {
            console.error('Error uploading device image:', imageError);
          }
        }
      }

      // Refresh list and close
      this.loadTicketDevices(); // Refresh ticket devices list (this will fetch the new media)
      this.cancelCreateDevice();

      // If we were editing, we don't necessarily need to "select" it for the ticket because it's already there.
      // But if we created it, we usually want to link it.
      // Wait, createAndSelectDevice was originally called from the SELECTION modal.
      // If we are in edit mode, we might have been called from the LIST directly.
      // The current logic in `cancelCreateDevice` re-opens `showDevicesModal`.
      // If we edited from the LIST, we probably don't want to open the selection modal.
      // But for now, keeping it simple is safer.
      // However, if we edit from the list, opening the selection modal is annoying.

      // Let's improve cancelCreateDevice logic later if needed. For now, let's assume sticking to the existing flow is acceptable MVP.
      // But wait! If I add "Edit" button to the MAIN LIST (Ticket Detail Tab), and I edit, then Save/Cancel...
      // `cancelCreateDevice` will open `showDevicesModal`. That is unintended behavior if I didn't come from there.
      // I need to know where I came from.
      // But the variable `showDevicesModal` was toggled.
      // If I come from list, `showDevicesModal` is false initially.
      // `openCreateDeviceForm` sets `showDevicesModal = false`.
      // `cancelCreateDevice` sets `showDevicesModal = true`.
      // This forces the modal open.

      // I should modify `openCreateDeviceForm` and `cancelCreateDevice` to handle source?
      // Or just check if it was open?
      // `showDevicesModal` is the visibility state.
      // I can add `returnToSelectionModal: boolean = false`.

      // I will add that property in the next step to fix the flow.

      // Refresh list and close
      // this.loadTicketDevices(); // Already called above

      // this.linkedDeviceIds.add(resultDevice.id); // Already handled in the new block above

      // Auto-select if created -> Logic moved up to "Link immediately" block using resultDevice
      if (this.editingDeviceId && resultDevice) {
        // Update local list
        const idx = this.companyDevices.findIndex(d => d.id === resultDevice.id);
        if (idx !== -1) this.companyDevices[idx] = resultDevice;
      }

      this.showToast(this.editingDeviceId ? 'Dispositivo actualizado' : 'Dispositivo creado y seleccionado', 'success');
      this.cancelCreateDevice();

    } catch (error: any) {
      console.error('Error processing device:', error);
      this.showToast('Error al procesar el dispositivo: ' + (error.message || error), 'error');
    }
  }

  onDeviceImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      Array.from(input.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.selectedDeviceImages.push({
              file: file,
              preview: e.target?.result as string
            });
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }

  removeDeviceImage(index: number) {
    this.selectedDeviceImages.splice(index, 1);
  }
}

