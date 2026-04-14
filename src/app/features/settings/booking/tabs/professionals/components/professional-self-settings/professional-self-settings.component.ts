import { Component, OnInit, OnDestroy, inject, signal, computed, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseProfessionalsService, Professional, ProfessionalSchedule, ProfessionalDocument } from '../../../../../../../services/supabase-professionals.service';
import { AuthService } from '../../../../../../../services/auth.service';
import { ToastService } from '../../../../../../../services/toast.service';
import { SignaturePadComponent } from '../../../../../../../shared/components/signature-pad/signature-pad.component';

@Component({
  selector: 'app-professional-self-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent],
  templateUrl: './professional-self-settings.component.html',
  styleUrls: ['./professional-self-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionalSelfSettingsComponent implements OnInit, OnDestroy {
  @Input() professionalId?: string;
  @Output() close = new EventEmitter<void>();
  @Output() calendarViewsChanged = new EventEmitter<string[]>();

  private professionalsService = inject(SupabaseProfessionalsService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  // State
  isLoading = signal(true);
  isSaving = signal(false);
  activeTab: 'general' | 'horarios' | 'documentos' = 'general';
  isNewProfessional = signal(false); // Track if this is a new professional record

  // Professional data
  professional = signal<Professional | null>(null);
  schedules = signal<ProfessionalSchedule[]>([]);
  documents = signal<ProfessionalDocument[]>([]);
  availableColors = signal<string[]>([]);

  // Editable fields for General tab
  editDisplayName = signal('');
  editBio = signal('');
  editColor = signal('#6366f1');
  calendarViews = signal<string[]>(['week']); // up to 3 views

  readonly availableCalendarViews = ['day', '3days', 'week', 'month'] as const;

  // Document signing state
  signingDocument = signal<ProfessionalDocument | null>(null);
  showSignaturePad = signal(false);

  // Color palette (same as ProfessionalsComponent)
  private readonly colorPalette = [
    '#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA',
    '#F472B6', '#F59E42', '#38BDF8', '#4ADE80', '#FACC15',
    '#818CF8', '#FCD34D', '#A3E635', '#F9A8D4', '#FDBA74',
    '#6EE7B7', '#C084FC', '#FDE68A', '#FCA5A5', '#D1D5DB',
  ];

  ngOnInit() {
    this.availableColors.set(this.colorPalette);
    this.loadData();
  }

  ngOnDestroy() {}

  private async loadData() {
    this.isLoading.set(true);
    try {
      // Get professional ID from auth if not provided
      let profId: string | undefined = this.professionalId;
      if (!profId) {
        const result = await this.getOrCreateCurrentProfessional();
        profId = result?.id;
        
        if (!profId) {
          this.toastService.error('Error', 'No se pudo crear tu perfil de profesional');
          this.close.emit();
          return;
        }
        
        // If we just created it, set the flag to show appropriate UI
        if (result && result.isNew) {
          this.isNewProfessional.set(true);
        }
      }

      // Load professional data
      const prof = await this.professionalsService.getProfessionalById(profId);
      if (!prof) {
        this.toastService.error('Error', 'Profesional no encontrado');
        this.close.emit();
        return;
      }
      this.professional.set(prof);
      this.editDisplayName.set(prof.display_name || '');
      this.editBio.set(prof.bio || '');
      this.editColor.set(prof.color || '#6366f1');
      this.calendarViews.set(prof.calendar_views || ['week']);

      // Load schedules
      const scheds = await this.professionalsService.getProfessionalSchedules(profId);
      this.schedules.set(scheds);

      // Load documents
      const docs = await this.professionalsService.getProfessionalDocuments(profId);
      this.documents.set(docs);
    } catch (err: unknown) {
      console.error('Error loading professional data:', err);
      this.toastService.error('Error', 'No se pudieron cargar los datos');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async getOrCreateCurrentProfessional(): Promise<{ id: string; isNew: boolean } | null> {
    // Delegate to the SECURITY DEFINER RPC which handles all three cases:
    //   A) professional row already linked by user_id  → returns it
    //   B) professional row exists with email match but user_id IS NULL → links + returns it
    //   C) no row at all → creates one and returns it
    try {
      const result = await this.professionalsService.linkOrCreateMyProfessional();
      if (result.is_new) {
        this.toastService.success('Perfil creado', 'Se ha creado tu perfil de profesional');
      }
      return { id: result.id, isNew: result.is_new };
    } catch (err) {
      console.error('Error in link_or_create_my_professional:', err);
      return null;
    }
  }

  private async getCurrentProfessionalId(): Promise<string | null> {
    const userId = this.authService.userProfile?.id;
    if (!userId) return null;
    const professionals = await this.professionalsService.getProfessionalsBasic().toPromise();
    const basicProf = professionals?.find(p => p.user_id === userId);
    return basicProf?.id ?? null;
  }

  // Tab navigation
  switchTab(tab: 'general' | 'horarios' | 'documentos') {
    this.activeTab = tab;
  }

  // Avatar upload
  async onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.toastService.error('Error', 'Selecciona una imagen');
      return;
    }

    const prof = this.professional();
    if (!prof) return;

    this.isSaving.set(true);
    try {
      const url = await this.professionalsService.uploadAvatar(file);
      await this.professionalsService.updateProfessional(prof.id, { avatar_url: url });
      this.professional.set({ ...prof, avatar_url: url });
      this.toastService.success('Éxito', 'Avatar actualizado');
    } catch (err: unknown) {
      console.error('Error uploading avatar:', err);
      this.toastService.error('Error', 'No se pudo subir el avatar');
    } finally {
      this.isSaving.set(false);
    }
  }

  // Color change with validation
  onColorChange(newColor: string) {
    // Check if color is used by another professional
    const prof = this.professional();
    if (!prof) return;

    // Get all professionals and check colors (excluding current)
    this.professionalsService.getProfessionalsBasic().subscribe({
      next: (pros) => {
        const usedColors = new Set(pros
          .filter(p => p.id !== prof!.id && p.color)
          .map(p => p.color!)
        );
        if (usedColors.has(newColor)) {
          this.toastService.error('Color en uso', 'Ese color ya está asignado a otro profesional');
          this.editColor.set(prof!.color || '#6366f1');
          return;
        }
        this.editColor.set(newColor);
      }
    });
  }

  // Save General settings
  async saveGeneral() {
    const prof = this.professional();
    if (!prof) return;

    this.isSaving.set(true);
    try {
      const updated = await this.professionalsService.updateProfessional(prof.id, {
        display_name: this.editDisplayName(),
        bio: this.editBio(),
        color: this.editColor(),
        calendar_views: this.calendarViews(),
      });
      this.professional.set({ ...prof, ...updated });
      this.toastService.success('Éxito', 'Cambios guardados');
    } catch (err: unknown) {
      console.error('Error saving:', err);
      this.toastService.error('Error', 'No se pudieron guardar los cambios');
    } finally {
      this.isSaving.set(false);
    }
  }

  // Toggle a calendar view in/out of the preferred list (max 3)
  toggleCalendarView(view: string) {
    const current = this.calendarViews();
    let next: string[];
    if (current.includes(view)) {
      // Don't allow removing if only 1 left
      if (current.length <= 1) {
        this.toastService.error('Mínimo una vista', 'Debes mantener al menos una vista seleccionada');
        return;
      }
      next = current.filter(v => v !== view);
    } else {
      if (current.length >= 3) {
        this.toastService.error('Máximo 3 vistas', 'Puedes seleccionar hasta 3 vistas como máximo');
        return;
      }
      next = [...current, view];
    }
    this.calendarViews.set(next);
    // Emit immediately so parent updates calendar constraints without waiting for save
    this.calendarViewsChanged.emit(next);
    // Auto-save to DB in background
    const prof = this.professional();
    if (!prof) return;
    this.professionalsService.updateProfessional(prof.id, {
      calendar_views: next,
    }).then(() => {
      const added = next.includes(view) && !current.includes(view);
      if (added) {
        this.toastService.success('Vista añadida', `${this.getViewLabel(view)} añadida a tus vistas`);
      }
    }).catch(() => {
      this.toastService.error('Error', 'No se pudieron guardar las vistas');
      // Revert
      this.calendarViews.set(current);
      this.calendarViewsChanged.emit(current);
    });
  }

  isCalendarViewSelected(view: string): boolean {
    return this.calendarViews().includes(view);
  }

  getViewLabel(view: string): string {
    const labels: Record<string, string> = { day: 'Día', '3days': '3 Días', week: 'Semana', month: 'Mes' };
    return labels[view] || view;
  }

  // Schedule methods
  getScheduleForDay(day: number): ProfessionalSchedule | undefined {
    return this.schedules().find(s => s.day_of_week === day);
  }

  toggleDay(day: number, enabled: boolean, event: Event) {
    event.stopPropagation();
    const existing = this.getScheduleForDay(day);

    if (enabled && !existing) {
      // Create new schedule for this day (default 9-18)
      const newSched: Partial<ProfessionalSchedule> = {
        professional_id: this.professional()?.id,
        day_of_week: day,
        start_time: '09:00:00',
        end_time: '18:00:00',
        is_active: true,
      };
      this.saveSchedule(newSched);
    } else if (!enabled && existing) {
      // Delete or deactivate
      if (existing.id) {
        // If has ID, we could delete it or set is_active false
        // For now, just remove from local state
        this.schedules.update(s => s.filter(sched => sched.day_of_week !== day));
      }
    }
  }

  updateScheduleTime(day: number, field: 'start_time' | 'end_time' | 'break_start' | 'break_end', value: string) {
    const sched = this.getScheduleForDay(day);
    if (!sched) return;

    const updated = { ...sched, [field]: value };
    this.saveSchedule(updated);
  }

  private async saveSchedule(schedule: Partial<ProfessionalSchedule>) {
    try {
      const saved = await this.professionalsService.saveProfessionalSchedule(schedule);
      this.schedules.update(scheds => {
        const idx = scheds.findIndex(s => s.day_of_week === saved.day_of_week);
        if (idx >= 0) {
          scheds[idx] = saved;
          return [...scheds];
        } else {
          return [...scheds, saved];
        }
      });
    } catch (err: unknown) {
      console.error('Error saving schedule:', err);
      this.toastService.error('Error', 'No se pudo guardar el horario');
    }
  }

  // Document methods
  downloadDocument(doc: ProfessionalDocument) {
    window.open(doc.file_url, '_blank');
  }

  openSignaturePad(doc: ProfessionalDocument) {
    this.signingDocument.set(doc);
    this.showSignaturePad.set(true);
  }

  async onSignatureComplete(signatureDataUrl: string | null) {
    if (!signatureDataUrl) return;
    const doc = this.signingDocument();
    if (!doc) return;
    const res = await fetch(signatureDataUrl);
    const signatureBlob = await res.blob();

    try {
      const updated = await this.professionalsService.signDocument(doc.id, signatureBlob);
      this.documents.update(docs => docs.map(d => d.id === doc.id ? updated : d));
      this.toastService.success('Éxito', 'Documento firmado');
    } catch (err: unknown) {
      console.error('Error signing:', err);
      this.toastService.error('Error', 'No se pudo firmar el documento');
    } finally {
      this.signingDocument.set(null);
      this.showSignaturePad.set(false);
    }
  }

  closeSignaturePad() {
    this.signingDocument.set(null);
    this.showSignaturePad.set(false);
  }

  // Close
  onClose() {
    this.close.emit();
  }

  // Helper for day names
  getDayName(day: number): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[day] || '';
  }
}
