import { Injectable, signal } from '@angular/core';

export type BlockMode = 'professional' | 'service';

export interface BlockDateFormData {
  professionalId: string;
  serviceId: string;
  blockMode: BlockMode;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  allDay: boolean;
  // Editing support (added 2026-06-10): when set, the modal saves via
  // updateBlockedDate() instead of createBlockedDate().
  editingId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BlockDatesModalService {
  showModal = signal(false);
  editingBlockId = signal<string | null>(null);
  editingBlockType = signal<'professional' | 'service' | null>(null);
  formData = signal<BlockDateFormData>({
    professionalId: '',
    serviceId: '',
    blockMode: 'professional',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    reason: '',
    allDay: false,
    editingId: null,
  });

  /**
   * Open the modal. Pass `editing` to enter edit mode for an existing block.
   */
  open(
    formData?: Partial<BlockDateFormData>,
    editing?: { id: string },
  ) {
    // Use local-date components to avoid toISOString() shifting to the
    // previous/next UTC day.
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const defaultData: BlockDateFormData = {
      professionalId: formData?.professionalId ?? '',
      serviceId: formData?.serviceId ?? '',
      blockMode: formData?.blockMode ?? 'professional',
      startDate: formData?.startDate ?? today,
      endDate: formData?.endDate ?? today,
      startTime: formData?.startTime ?? '09:00',
      endTime: formData?.endTime ?? '18:00',
      reason: formData?.reason ?? '',
      allDay: formData?.allDay ?? false,
      editingId: editing?.id ?? null,
    };
    this.formData.set(defaultData);
    this.showModal.set(true);
  }

  close() {
    this.showModal.set(false);
  }

  updateField(field: keyof BlockDateFormData, value: string | boolean) {
    this.formData.update(f => {
      const next = { ...f, [field]: value };
      // Bug fix 2026-06-10: when toggling allDay ON, replicate startDate to
      // endDate so the user lands on a single-day block. They can then extend
      // endDate to a later day if they want a range.
      if (field === 'allDay' && value === true && f.startDate && !f.endDate) {
        next.endDate = f.startDate;
      }
      return next;
    });
  }

  setBlockMode(mode: BlockMode) {
    this.formData.update(f => ({
      ...f,
      blockMode: mode,
      // Reset relevant fields when switching modes
      professionalId: mode === 'professional' ? f.professionalId : '',
      serviceId: mode === 'service' ? f.serviceId : '',
    }));
  }

  editBlock(block: BlockDateFormData, type: BlockMode, id: string) {
    this.editingBlockId.set(id);
    this.editingBlockType.set(type);
    this.formData.set(block);
    this.showModal.set(true);
  }

  resetForm() {
    this.editingBlockId.set(null);
    this.editingBlockType.set(null);
    this.close();
  }
}
