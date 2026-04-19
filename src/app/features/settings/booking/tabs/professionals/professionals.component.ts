import { Component, OnInit, OnDestroy, inject, signal, computed, input, Output, EventEmitter, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RealtimeChannel } from '@supabase/supabase-js';
import { CommonModule, NgClass, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseProfessionalsService, Professional, ProfessionalSchedule, ProfessionalDocument } from '../../../../../services/supabase-professionals.service';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { Resource } from '../../../../../services/supabase-resources.service';
import { ToastService } from '../../../../../services/toast.service';
import { AuthService } from '../../../../../services/auth.service';
import { ProfessionalContractDialogComponent } from './components/professional-contract-dialog/professional-contract-dialog.component';

@Component({
    selector: 'app-professionals',
    standalone: true,
    imports: [CommonModule, NgClass, DatePipe, FormsModule, ReactiveFormsModule, ProfessionalContractDialogComponent],
    templateUrl: './professionals.component.html',
    styleUrls: ['./professionals.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionalsComponent implements OnInit, OnDestroy {
    private realtimeChannel: RealtimeChannel | null = null;
    private supabaseClient = inject(SupabaseClientService);
    private professionalsService = inject(SupabaseProfessionalsService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);
    private destroyRef = inject(DestroyRef);

    availableCalendars = input<any[]>([]);
    availableResources = input<Resource[]>([]);

    professionals = signal<Professional[]>([]);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

// Role detection
  userRole = this.authService.userRole;
  isClient = computed(() => this.userRole() === 'client');

  @Output() reserve = new EventEmitter<Professional>();
  @Output() goBack = new EventEmitter<void>();

  // Visibility Logic
  currentUser = this.authService.currentUser$;
  currentUserId = signal<string | null>(null);
  isAdmin = this.authService.isAdmin;

    visibleProfessionals = computed(() => {
        const all = this.professionals();
        const admin = this.isAdmin();
        const uid = this.currentUserId();

        if (admin) {
            // Active professionals first (alphabetical), then inactive at the bottom
            return [...all].sort((a, b) => {
                if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
                return a.display_name.localeCompare(b.display_name);
            });
        }
        // If not admin, only show own professional card
        return all.filter(p => p.user_id === uid);
    });

    // Modal state
    showModal = false;
    editingId: string | null = null;
    activeTab = signal<'general' | 'schedules' | 'documents'>('general');

    // Default color palette
    readonly colorPalette = [
        '#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA',
        '#F472B6', '#F59E42', '#38BDF8', '#4ADE80', '#FACC15',
        '#818CF8', '#FCD34D', '#A3E635', '#F9A8D4', '#FDBA74',
        '#6EE7B7', '#C084FC', '#FDE68A', '#FCA5A5', '#D1D5DB'
    ];

    // Form
    form: FormGroup;

    // Available members, titles and services for assignment
    companyMembers = signal<{ id: string; user_id: string; full_name: string; email: string }[]>([]);
    /** All company members, including those already linked to a professional (used for search feedback) */
    allCompanyMembers = signal<{ id: string; user_id: string; full_name: string; email: string }[]>([]);
    // Services for assignment
    bookableServices = signal<{ id: string; name: string }[]>([]);
    professionalTitles = signal<{ id: string; name: string }[]>([]);
    selectedServiceIds: string[] = [];

    // Image Upload
    selectedFile: File | null = null;
    previewUrl = signal<string | null>(null);

    // Searchable Titles Dropdown
    showTitleDropdown = signal<boolean>(false);
    titleSearchText = signal<string>('');

    // Searchable Users Dropdown & Invites
    showUserDropdown = signal<boolean>(false);
    userSearchText = signal<string>('');
    invitedEmail = signal<string | null>(null);

    constructor() {
        // user_id is no longer strictly required at creation if we are inviting by email
        // We will validate manually before submit
        this.form = this.fb.group({
            user_id: [''], 
            display_name: ['', Validators.required],
            title: [''],
            bio: [''],
            is_active: [true],
            google_calendar_id: [''],
            default_resource_id: [''],
            color: ['']
        });
    }

    get filteredTitles() {
        const search = this.titleSearchText().toLowerCase().trim();
        const titles = this.professionalTitles();
        if (!search) return titles;
        return titles.filter(t => t.name.toLowerCase().includes(search));
    }

    hasExactTitleMatch(): boolean {
        const search = this.titleSearchText().toLowerCase().trim();
        return this.professionalTitles().some(t => t.name.toLowerCase() === search);
    }

    selectTitle(titleName: string) {
        this.form.patchValue({ title: titleName });
        this.showTitleDropdown.set(false);
        this.titleSearchText.set('');
    }

    async handleCreateTitle() {
        const newName = this.titleSearchText().trim();
        if (!newName) return;
        
        await this.addNewTitle(newName);
        this.selectTitle(newName);
    }

    // --- User Selection Logic ---
    get filteredUsers() {
        const search = this.userSearchText().toLowerCase().trim();
        const members = this.companyMembers();
        if (!search) return members;
        return members.filter(m => 
            m.full_name.toLowerCase().includes(search) || 
            m.email.toLowerCase().includes(search)
        );
    }

    hasExactUserMatch(): boolean {
        const search = this.userSearchText().toLowerCase().trim();
        // Check ALL members, not just those available for new linking
        return this.allCompanyMembers().some(m => m.email.toLowerCase() === search);
    }

    /** True when the linked-user field is editable (no user/email linked yet, regardless of create vs edit mode) */
    canEditLinkedUser(): boolean {
        return !this.form.get('user_id')?.value && !this.invitedEmail();
    }

    /** True when the typed email belongs to a member who already has a professional profile */
    isAlreadyLinkedProfessional(): boolean {
        const search = this.userSearchText().toLowerCase().trim();
        if (!search) return false;
        const inAll = this.allCompanyMembers().some(m => m.email.toLowerCase() === search);
        const inAvailable = this.companyMembers().some(m => m.email.toLowerCase() === search);
        return inAll && !inAvailable;
    }

    isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    selectUser(userId: string, displayName: string) {
        this.form.patchValue({ user_id: userId });
        this.invitedEmail.set(null); // Clear invite if selecting an existing user
        if (!this.form.get('display_name')?.value) {
            this.form.patchValue({ display_name: displayName });
        }
        this.showUserDropdown.set(false);
        this.userSearchText.set('');
    }

    async handleInviteUser() {
        const email = this.userSearchText().trim().toLowerCase();
        if (!email || !this.isValidEmail(email)) return;
        
        try {
            this.toast.info('Enviando...', 'Enviando invitación por email');
            const res = await this.authService.sendCompanyInvite({
                email,
                role: 'professional'
            });
            if (res.success) {
                this.toast.success('Invitación enviada', `Se ha invitado a ${email}`);
                this.invitedEmail.set(email);
                this.form.patchValue({ user_id: '' }); // Clear any selected user
                if (!this.form.get('display_name')?.value) {
                    this.form.patchValue({ display_name: email.split('@')[0] });
                }
                this.showUserDropdown.set(false);
            } else {
                 this.toast.error('Error', res.error || 'No se pudo enviar la invitación');
            }
        } catch(e) {
            this.toast.error('Error', 'No se pudo enviar la invitación');
        }
    }

    ngOnInit() {
        this.currentUser.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(u => {
            if (u) this.currentUserId.set(u.id);
        });
        this.loadProfessionals();
        this.loadCompanyMembers();
        this.loadBookableServices();
        this.loadProfessionalTitles();
        this.setupRealtimeSubscription();
    }

    setupRealtimeSubscription() {
        this.realtimeChannel = this.professionalsService.subscribeToChanges(() => {
            this.loadProfessionals();
        });
    }

    ngOnDestroy() {
        if (this.realtimeChannel) {
            this.supabaseClient.instance.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    async loadProfessionals() {
        this.loading.set(true);
        this.professionalsService.getProfessionals(undefined, true).subscribe({
            next: (data) => {
                this.professionals.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toast.error('Error', 'No se pudieron cargar los profesionales');
                this.loading.set(false);
            }
        });
    }

    async loadCompanyMembers() {
        try {
            const members = await this.professionalsService.getCompanyMembers();
            // Keep the full list for search feedback
            this.allCompanyMembers.set(members);
            // Filter out those who are already professionals to avoid unique constraint conflicts
            const existingProfessionalUserIds = this.professionals().map(p => p.user_id);
            const filteredMembers = members.filter(m => !existingProfessionalUserIds.includes(m.user_id));
            this.companyMembers.set(filteredMembers);
        } catch (e) {
            console.error('Error loading company members:', e);
        }
    }

    async loadBookableServices() {
        try {
            const services = await this.professionalsService.getBookableServices();
            this.bookableServices.set(services);
        } catch (e) {
            console.error('Error loading bookable services:', e);
        }
    }

    async loadProfessionalTitles() {
        try {
            const titles = await this.professionalsService.getProfessionalTitles();
            this.professionalTitles.set(titles);
        } catch (e) {
            console.error('Error loading professional titles:', e);
        }
    }

    async addNewTitle(name: string) {
        if (!name.trim()) return;
        try {
            const newTitle = await this.professionalsService.createProfessionalTitle(name);
            this.professionalTitles.update(titles => [...titles, newTitle].sort((a,b) => a.name.localeCompare(b.name)));
            this.form.patchValue({ title: newTitle.name });
            this.toast.success('Creado', `Cargo "${name}" añadido`);
        } catch (e: any) {
            if (e.code === '23505') { // Unique violation
                this.form.patchValue({ title: name });
            } else {
                this.toast.error('Error', 'No se pudo crear el cargo');
            }
        }
    }

    openModal(professional?: Professional) {
        this.editingId = professional?.id || null;
        this.selectedServiceIds = professional?.services?.map(s => s.id) || [];

        if (professional) {
            this.form.patchValue({
                user_id: professional.user_id || '',
                display_name: professional.display_name,
                title: professional.title || '',
                bio: professional.bio || '',
                is_active: professional.is_active,
                google_calendar_id: professional.google_calendar_id || '',
                default_resource_id: professional.default_resource_id || '',
                color: professional.color || this.getSuggestedColor()
            });
            this.invitedEmail.set(professional.email || null);
            this.previewUrl.set(professional.avatar_url || null);
        } else {
            this.form.reset({
                user_id: '',
                display_name: '',
                title: '',
                bio: '',
                is_active: true,
                google_calendar_id: '',
                default_resource_id: '',
                color: this.getSuggestedColor()
            });
            this.invitedEmail.set(null);
            this.userSearchText.set('');
            this.selectedServiceIds = [];
            this.previewUrl.set(null);
        }
        this.selectedFile = null;
        this.activeTab.set('general');
        this.showModal = true;
    }

    private getSuggestedColor(): string {
        const usedColors = new Set(this.professionals().map(p => p.color).filter(Boolean));
        // Find first unused color in palette
        for (const color of this.colorPalette) {
            if (!usedColors.has(color)) return color;
        }
        // If all colors used, return a random hex color
        return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    closeModal() {
        this.showModal = false;
        this.editingId = null;
    }

    selectTab(tab: 'general' | 'schedules' | 'documents') {
        this.activeTab.set(tab);
        if (tab === 'schedules' && this.editingId) {
            this.loadSchedules(this.editingId);
        }
        if (tab === 'documents' && this.editingId) {
            this.loadDocuments(this.editingId);
        }
    }

    // --- Schedules Logic ---

    schedules = signal<ProfessionalSchedule[]>([]);
    weekDays = [
        { id: 1, name: 'Lunes' },
        { id: 2, name: 'Martes' },
        { id: 3, name: 'Miércoles' },
        { id: 4, name: 'Jueves' },
        { id: 5, name: 'Viernes' },
        { id: 6, name: 'Sábado' },
        { id: 0, name: 'Domingo' }
    ];

    async loadSchedules(professionalId: string) {
        try {
            const data = await this.professionalsService.getProfessionalSchedules(professionalId);
            this.schedules.set(data);
        } catch (e) {
            console.error('Error loading schedules', e);
            this.toast.error('Error', 'No se pudieron cargar los horarios');
        }
    }

    getScheduleForDay(dayId: number): Partial<ProfessionalSchedule> {
        return this.schedules().find(s => s.day_of_week === dayId) || {
            day_of_week: dayId,
            is_active: false,
            start_time: '09:00',
            end_time: '18:00'
        };
    }

    async updateSchedule(dayId: number, field: keyof ProfessionalSchedule, value: any) {
        if (!this.editingId) return;

        const current = this.getScheduleForDay(dayId);
        const updated = { ...current, [field]: value, professional_id: this.editingId };

        try {
            const saved = await this.professionalsService.saveProfessionalSchedule(updated);
            this.schedules.update(list => {
                const idx = list.findIndex(s => s.day_of_week === dayId);
                if (idx > -1) {
                    const newList = [...list];
                    newList[idx] = saved;
                    return newList;
                }
                return [...list, saved];
            });
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar el horario');
        }
    }

    async copyMondayToWeek() {
        if (!this.editingId) return;
        const monday = this.getScheduleForDay(1); // Lunes
        
        // Copiar a Martes (2) hasta Viernes (5)
        const daysToUpdate = [2, 3, 4, 5];
        this.loading.set(true);
        
        try {
            const promises = daysToUpdate.map(day => {
                const targetDay = this.getScheduleForDay(day);
                return this.professionalsService.saveProfessionalSchedule({
                    id: targetDay.id,
                    professional_id: this.editingId!,
                    day_of_week: day,
                    start_time: monday.start_time,
                    end_time: monday.end_time,
                    break_start: monday.break_start,
                    break_end: monday.break_end,
                    is_active: monday.is_active
                });
            });
            
            await Promise.all(promises);
            await this.loadSchedules(this.editingId);
            this.toast.success('Horarios copiados', 'Se aplicó el horario de Lunes a toda la semana laboral');
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'Falló la copia masiva');
        } finally {
            this.loading.set(false);
        }
    }

    // --- Documents Logic ---
    documents = signal<ProfessionalDocument[]>([]);
    showGeneratorModal = signal(false);
    showSignatureModal = false;
    signingDocumentId: string | null = null;
    
    // Canvas State
    isDrawing = false;
    canvasContext: CanvasRenderingContext2D | null = null;
    
    // We access the canvas via ViewChild in AfterViewInit or just getElementById in open methods
    // For simplicity with *ngIf, we'll get it when modal opens.

    async loadDocuments(professionalId: string) {
        try {
            const docs = await this.professionalsService.getProfessionalDocuments(professionalId);
            this.documents.set(docs);
        } catch (e) {
            console.error('Error loading documents', e);
            this.toast.error('Error', 'No se pudieron cargar los documentos');
        }
    }

    async onDocumentSelected(event: any) {
        if (!this.editingId) return;
        const file = event.target.files[0];
        if (!file) return;

        this.loading.set(true);
        try {
            await this.professionalsService.uploadProfessionalDocument(this.editingId, file, 'contract'); // Default type for now
            this.toast.success('Subido', 'Documento subido correctamente');
            this.loadDocuments(this.editingId);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo subir el documento');
        } finally {
            this.loading.set(false);
        }
    }

    async deleteDocument(doc: ProfessionalDocument) {
        if (!confirm(`¿Eliminar documento ${doc.name}?`)) return;
        try {
            await this.professionalsService.deleteProfessionalDocument(doc.id);
            this.toast.success('Eliminado', 'Documento eliminado');
            if (this.editingId) this.loadDocuments(this.editingId);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }

    openSignatureModal(docId: string) {
        this.signingDocumentId = docId;
        this.showSignatureModal = true;
        // Wait for modal to render
        setTimeout(() => this.initCanvas(), 100);
    }

    closeSignatureModal() {
        this.showSignatureModal = false;
        this.signingDocumentId = null;
        this.isDrawing = false;
    }

    initCanvas() {
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        if (!canvas) return;
        
        // Adjust resolution
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d')?.scale(ratio, ratio);

        this.canvasContext = canvas.getContext('2d');
        if (this.canvasContext) {
            this.canvasContext.lineWidth = 2;
            this.canvasContext.lineCap = 'round';
            this.canvasContext.strokeStyle = '#000000';
        }
    }

    // Helper for Generator
    getCompanyId(): string {
        return this.authService.companyId() || '';
    }

    getProfessionalName(): string {
        const p = this.professionals().find(p => p.id === this.editingId);
        return p?.display_name || '';
    }

    startDrawing(event: MouseEvent | TouchEvent) {
        this.isDrawing = true;
        this.draw(event);
    }

    stopDrawing() {
        this.isDrawing = false;
        if (this.canvasContext) {
            this.canvasContext.beginPath();
        }
    }

    draw(event: MouseEvent | TouchEvent) {
        if (!this.isDrawing || !this.canvasContext) return;

        event.preventDefault();
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        if (event instanceof MouseEvent) {
            clientX = event.clientX;
            clientY = event.clientY;
        } else {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        }

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        this.canvasContext.lineTo(x, y);
        this.canvasContext.stroke();
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(x, y);
    }

    clearSignature() {
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        if (canvas && this.canvasContext) {
            this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    async saveSignature() {
        if (!this.signingDocumentId) return;
        
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        if (!canvas) return;

        this.loading.set(true);
        try {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Could not generate signature image');

            await this.professionalsService.signDocument(this.signingDocumentId, blob);
            this.toast.success('Firmado', 'Documento firmado correctamente');
            if (this.editingId) this.loadDocuments(this.editingId);
            this.closeSignatureModal();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la firma');
        } finally {
            this.loading.set(false);
        }
    }

    toggleService(serviceId: string) {
        if (this.selectedServiceIds.includes(serviceId)) {
            this.selectedServiceIds = this.selectedServiceIds.filter(id => id !== serviceId);
        } else {
            this.selectedServiceIds = [...this.selectedServiceIds, serviceId];
        }
    }

    isServiceSelected(serviceId: string): boolean {
        return this.selectedServiceIds.includes(serviceId);
    }

    getServiceClasses(serviceId: string): string {
        const selected = this.isServiceSelected(serviceId);
        let base = "px-4 py-2.5 text-sm font-medium rounded-lg border transition-all text-left truncate flex items-center justify-between group ";
        
        if (selected) {
            base += "ring-2 ring-primary-500 bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-800";
        } else {
            base += "border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600";
        }
        return base;
    }

    // Auto-fill display name when user changes
    onUserChange() {
        const userId = this.form.get('user_id')?.value;
        const member = this.companyMembers().find(m => m.user_id === userId);
        if (member && !this.form.get('display_name')?.value) {
            this.form.patchValue({ display_name: member.full_name });
        }
    }


    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.selectedFile = file;
            // Create preview
            const objectUrl = URL.createObjectURL(file);
            this.previewUrl.set(objectUrl);
        }
    }

    getInitials(name?: string): string {
        const displayName = name || this.form.get('display_name')?.value || '';
        return displayName
            .split(' ')
            .map((n: string) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    shouldShowCurrentUserOption(): boolean {
        const userId = this.form.get('user_id')?.value;
        if (!this.editingId || !userId) return false;
        return !this.companyMembers().some(m => m.user_id === userId);
    }

    async submit() {
        if (this.form.invalid) return;
        
        const val = this.form.value;

        // Ensure unique color
        const existingColor = this.professionals().some(p => p.id !== this.editingId && p.color === val.color);
        if (existingColor) {
            this.toast.error('Color duplicado', 'Este color ya está asignado a otro profesional.');
            return;
        }

        const invited = this.invitedEmail();
        
        // Custom validation: must have user_id OR invitedEmail OR be editing with an existing email
        if (!val.user_id && !invited && !this.editingId) {
            this.toast.error('Faltan datos', 'Debes seleccionar un usuario vinculado o invitar a alguien mediante su correo electrónico.');
            return;
        }

        this.saving.set(true);

        try {
            const val = this.form.value;

            // Ensure title is added to the pool if it's new
            if (val.title && !this.professionalTitles().some(t => t.name.toLowerCase() === val.title.toLowerCase())) {
                await this.addNewTitle(val.title);
            }

            let avatarUrl = this.previewUrl();

            // Upload image if selected
            if (this.selectedFile) {
                avatarUrl = await this.professionalsService.uploadAvatar(this.selectedFile);
            }

            const payload: Partial<Professional> = {
                user_id: val.user_id || undefined,
                display_name: val.display_name,
                email: invited || undefined,
                title: val.title,
                bio: val.bio,
                is_active: val.is_active,
                avatar_url: avatarUrl || undefined,
                google_calendar_id: val.google_calendar_id || undefined,
                default_resource_id: val.default_resource_id || null,
                color: val.color || undefined
            };

            let professionalId = this.editingId;

            if (this.editingId) {
                await this.professionalsService.updateProfessional(this.editingId, payload);
                this.toast.success('Actualizado', 'Profesional actualizado correctamente');
            } else {
                const created = await this.professionalsService.createProfessional(payload);
                professionalId = created.id;
                this.toast.success('Creado', 'Nuevo profesional creado');
            }

            // Assign services
            if (professionalId) {
                await this.professionalsService.assignServices(professionalId, this.selectedServiceIds);
            }

            this.closeModal();
            this.loadProfessionals();
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar el profesional');
        } finally {
            this.saving.set(false);
        }
    }

    async deleteProfessional(professional: Professional) {
        if (!confirm(`¿Eliminar a ${professional.display_name}?`)) return;
        try {
            await this.professionalsService.deleteProfessional(professional.id);
            this.toast.success('Eliminado', 'Profesional eliminado');
            this.loadProfessionals();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }
}
