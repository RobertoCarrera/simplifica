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
}

@Injectable({ providedIn: 'root' })
export class BlockDatesModalService {
  showModal = signal(false);
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
  });

  open(formData?: Partial<BlockDateFormData>) {
    const today = new Date().toISOString().split('T')[0];
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
    };
    this.formData.set(defaultData);
    this.showModal.set(true);
  }

  close() {
    this.showModal.set(false);
  }

  updateField(field: keyof BlockDateFormData, value: string | boolean) {
    this.formData.update(f => ({ ...f, [field]: value }));
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
}
