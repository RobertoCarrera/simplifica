import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseTicketsService, Ticket } from '../../services/supabase-tickets.service';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

type WizardStep = 'type' | 'details' | 'review';
type TicketType = 'incidence' | 'request' | 'question';

@Component({
    selector: 'app-portal-ticket-wizard',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './portal-ticket-wizard.component.html',
    styleUrls: ['./portal-ticket-wizard.component.scss']
})
export class PortalTicketWizardComponent {
    @Output() close = new EventEmitter<void>();
    @Output() ticketCreated = new EventEmitter<void>();

    currentStep: WizardStep = 'type';
    selectedType: TicketType | null = null;

    ticketData = {
        title: '',
        description: '',
        priority: 'normal'
    };

    isSubmitting = false;

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

            const newTicket: Partial<Ticket> = {
                title: titlePrefix + this.ticketData.title,
                description: this.ticketData.description,
                client_id: clientProfile.id, // Use actual client profile ID
                company_id: clientProfile.company_id, // Pass company_id
                priority: 'normal'
                // stage_id left undefined to let backend assign default
            };

            await this.ticketsService.createTicket(newTicket, 'client-create-ticket');
            this.ticketCreated.emit();
            this.close.emit();
        } catch (error) {
            console.error('Error creating ticket', error);
            // Handle error (toast?)
        } finally {
            this.isSubmitting = false;
        }
    }
}
