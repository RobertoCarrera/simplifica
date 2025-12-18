import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseTicketsService, Ticket } from '../../services/supabase-tickets.service';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AiService } from '../../services/ai.service';
import { DevicesService } from '../../services/devices.service';
import { CameraCaptureComponent } from '../commons/camera-capture/camera-capture.component';

type WizardStep = 'type' | 'details' | 'review';
type TicketType = 'incidence' | 'request' | 'question';

@Component({
    selector: 'app-portal-ticket-wizard',
    standalone: true,
    imports: [CommonModule, FormsModule, CameraCaptureComponent],
    templateUrl: './portal-ticket-wizard.component.html',
    styleUrls: ['./portal-ticket-wizard.component.scss']
})
export class PortalTicketWizardComponent {
    @Output() close = new EventEmitter<void>();
    @Output() ticketCreated = new EventEmitter<void>();

    currentStep: WizardStep = 'type';
    selectedType: TicketType | null = null;

    // Audio State
    isRecording = false;
    isProcessingAudio = false;
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];

    // Camera / Device State
    showCamera = false;
    createdDeviceId: string | null = null;
    createdDeviceName: string | null = null;
    isScanningDevice = false;

    // Attachment State
    attachmentFile: File | null = null;
    attachmentUrl: string | null = null;
    isUploadingAttachment = false;

    ticketData: any = {
        title: '',
        description: '',
        priority: 'normal',
        device_id: undefined
    };

    isSubmitting = false;

    private aiService = inject(AiService);
    private devicesService = inject(DevicesService);

    constructor(
        private ticketsService: SupabaseTicketsService,
        private supabase: SimpleSupabaseService
    ) { }

    selectType(type: TicketType) {
        this.selectedType = type;
        this.nextStep();
    }

    nextStep() {
        if (this.currentStep === 'type') this.currentStep = 'details';
        else if (this.currentStep === 'details') this.currentStep = 'review';
    }

    prevStep() {
        if (this.currentStep === 'details') this.currentStep = 'type';
        else if (this.currentStep === 'review') this.currentStep = 'details';
    }

    get typeLabel(): string {
        switch (this.selectedType) {
            case 'incidence': return 'Reportar Incidencia';
            case 'request': return 'Nueva Solicitud';
            case 'question': return 'Duda o Consulta';
            default: return '';
        }
    }

    get typeIcon(): string {
        switch (this.selectedType) {
            case 'incidence': return 'fa-bug';
            case 'request': return 'fa-rocket';
            case 'question': return 'fa-question-circle';
            default: return '';
        }
    }

    // --- Audio Assistant Logic ---
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                await this.processAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop()); // Stop mic
            };

            this.mediaRecorder.start();
            this.isRecording = true;
        } catch (err) {
            console.error('Error recording audio', err);
            alert('No se pudo acceder al micrófono. Por favor verifica los permisos.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isProcessingAudio = true;
        }
    }

    async processAudio(blob: Blob) {
        try {
            const result = await this.aiService.processAudioTicket(blob);

            // Auto-fill and navigate
            this.selectedType = result.type as TicketType;
            this.ticketData.title = result.title;
            this.ticketData.description = result.description;

            this.nextStep();
        } catch (error) {
            console.error('Error processing audio', error);
            alert('No pudimos entender el audio. Por favor intenta de nuevo o escribe tu problema.');
        } finally {
            this.isProcessingAudio = false;
        }
    }

    // --- Camera / Device Logic ---
    async onDeviceCaptured(file: File) {
        this.showCamera = false;
        this.isScanningDevice = true;

        try {
            // 1. Scan with AI
            const scanResult = await this.aiService.scanDevice(file);
            console.log('AI Scan Result:', scanResult);

            // 2. Create Device in DB
            const { data: { user } } = await this.supabase.getClient().auth.getUser();
            if (!user) throw new Error('Usuario no autenticado');

            // Find client profile again to be safe
            const { data: clientProfile } = await this.supabase.getClient()
                .from('clients')
                .select('id, company_id')
                .eq('auth_user_id', user.id)
                .single();

            if (!clientProfile) throw new Error('Perfil de cliente no encontrado');

            // Prepare device payload
            const newDevice = {
                company_id: clientProfile.company_id,
                client_id: clientProfile.id,
                brand: scanResult.brand || 'Desconocido',
                model: scanResult.model || 'Desconocido',
                device_type: scanResult.device_type || 'other',
                status: 'received', // Initial status
                received_at: new Date().toISOString(),
                color: scanResult.color,
                serial_number: scanResult.serial_number,
                imei: scanResult.imei,
                condition_on_arrival: scanResult.condition,
                reported_issue: scanResult.reported_issue_inference || 'Reportado vía App',
                priority: 'normal',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Call createDevice
            const created = await this.devicesService.createDevice(newDevice as any);

            this.createdDeviceId = created.id;
            this.createdDeviceName = `${created.brand} ${created.model}`;

            // Optional: Upload the image to the device
            await this.devicesService.uploadDeviceImage(created.id, file, 'arrival', 'Foto inicial (Scan)');

            // Auto-fill if empty
            if (!this.ticketData.title) this.ticketData.title = `Problema con ${created.brand} ${created.model}`;
            if (!this.ticketData.description && scanResult.reported_issue_inference) {
                this.ticketData.description = `(Autodetectado): ${scanResult.reported_issue_inference}`;
            }

        } catch (error) {
            console.error('Error scanning/creating device:', error);
            alert('Hubo un error al procesar el dispositivo. Por favor ingresa los datos manualmente.');
        } finally {
            this.isScanningDevice = false;
        }
    }

    // --- Attachment Logic ---
    async onAttachmentSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.attachmentFile = input.files[0];
            // Upload immediately to get URL? Or wait for submit?
            // Let's upload immediately so we have a URL to show/link
            await this.uploadAttachment();
        }
    }

    async uploadAttachment() {
        if (!this.attachmentFile) return;
        this.isUploadingAttachment = true;
        try {
            // Use a temp ID or null if wizard
            const url = await this.ticketsService.uploadTicketAttachment(this.attachmentFile);
            this.attachmentUrl = url;
        } catch (error) {
            console.error('Upload failed', error);
            alert('Error subiendo imagen.');
        } finally {
            this.isUploadingAttachment = false;
        }
    }

    removeAttachment() {
        this.attachmentFile = null;
        this.attachmentUrl = null;
        this.isUploadingAttachment = false;
    }

    async submitTicket() {
        if (this.isSubmitting) return;
        this.isSubmitting = true;

        try {
            const { data: { user } } = await this.supabase.getClient().auth.getUser();
            if (!user) throw new Error('No user found');

            // Fetch client profile to get correct client_id and company_id
            const { data: clientProfile, error: clientError } = await this.supabase.getClient()
                .from('clients')
                .select('id, company_id')
                .eq('auth_user_id', user.id)
                .single();

            if (clientError || !clientProfile) {
                console.error('Error fetching client profile:', clientError);
                throw new Error('Could not find client profile');
            }

            // Prefix title with type for context
            const titlePrefix = this.selectedType === 'incidence' ? '[INCIDENCIA] ' :
                this.selectedType === 'request' ? '[SOLICITUD] ' : '[CONSULTA] ';

            const newTicket: any = {
                title: titlePrefix + this.ticketData.title,
                description: this.ticketData.description,
                client_id: clientProfile.id,
                company_id: clientProfile.company_id,
                priority: 'normal',
                device_id: this.createdDeviceId || undefined,
                initial_comment: this.selectedType === 'question' ? this.ticketData.description : undefined,
                initial_attachment_url: this.attachmentUrl || undefined
            };

            console.log('🚀 Submitting Ticket Payload:', newTicket);
            console.log('📎 Attachment URL state:', this.attachmentUrl);

            const createdTicket = await this.ticketsService.createTicket(newTicket, 'client-create-ticket');

            this.ticketCreated.emit();
            this.close.emit();
        } catch (error) {
            console.error('Error creating ticket', error);
            alert('Error al crear el ticket. Por favor inténtalo de nuevo.');
        } finally {
            this.isSubmitting = false;
        }
    }
}
