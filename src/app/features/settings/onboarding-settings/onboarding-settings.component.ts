import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
    getDefaultOnboardingPolicy,
    normalizeOnboardingPolicy,
    onboardingFieldDefinitions,
    type ClientOnboardingFieldKey,
    type CompanyOnboardingFieldKey,
    type OnboardingFieldDefinition,
    type OnboardingFieldMode,
    type OnboardingPolicy,
    type OnboardingScope,
    type UserOnboardingFieldKey,
} from '../../../services/onboarding-policy';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { ToastService } from '../../../services/toast.service';
import { TranslocoPipe } from '@jsverse/transloco';

type OnboardingFieldKey = UserOnboardingFieldKey | ClientOnboardingFieldKey | CompanyOnboardingFieldKey;

@Component({
    selector: 'app-onboarding-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, TranslocoPipe],
    templateUrl: './onboarding-settings.component.html',
    styleUrls: ['./onboarding-settings.component.scss']
})
export class OnboardingSettingsComponent implements OnInit {
    onboardingSections: Array<{ scope: OnboardingScope; title: string; description: string }> = [
        {
            scope: 'user',
            title: 'Datos de usuario',
            description: 'Campos básicos de identidad que se guardan en el perfil interno del usuario.',
        },
        {
            scope: 'client',
            title: 'Datos de cliente',
            description: 'Información comercial y de contacto que se guardará en el perfil cliente cuando exista.',
        },
        {
            scope: 'company',
            title: 'Datos de empresa',
            description: 'Información de la organización que se pide al crear o completar el contexto de empresa.',
        },
    ];
    onboardingModeOptions: Array<{ value: OnboardingFieldMode; label: string }> = [
        { value: 'hidden', label: 'No pedir' },
        { value: 'optional', label: 'Opcional' },
        { value: 'required', label: 'Obligatorio' },
    ];

    appOnboardingPolicy: OnboardingPolicy = getDefaultOnboardingPolicy();
    savingAppOnboardingPolicy = false;

    constructor(
        private settingsService: SupabaseSettingsService,
        private toast: ToastService
    ) {}

    async ngOnInit() {
        await this.loadAppOnboardingPolicy();
    }

    private async loadAppOnboardingPolicy() {
        try {
            const app = await firstValueFrom(this.settingsService.getAppSettings());
            if (app?.onboarding_policy) {
                this.appOnboardingPolicy = normalizeOnboardingPolicy(app.onboarding_policy);
            } else {
                this.appOnboardingPolicy = getDefaultOnboardingPolicy();
            }
        } catch (e) {
            console.warn('Could not load app onboarding policy:', e);
            this.appOnboardingPolicy = getDefaultOnboardingPolicy();
        }
    }

    getOnboardingFields(scope: OnboardingScope): OnboardingFieldDefinition[] {
        return onboardingFieldDefinitions.filter((field) => field.scope === scope);
    }

    getOnboardingFieldMode(scope: OnboardingScope, fieldKey: OnboardingFieldKey): OnboardingFieldMode {
        return this.appOnboardingPolicy[scope][fieldKey as keyof typeof this.appOnboardingPolicy[typeof scope]] as OnboardingFieldMode;
    }

    setOnboardingFieldMode(scope: OnboardingScope, fieldKey: OnboardingFieldKey, mode: OnboardingFieldMode) {
        // Mutating the object directly is OK because the policy was returned by reference
        // from the service (or built via getDefaultOnboardingPolicy) and is not shared.
        (this.appOnboardingPolicy[scope] as any)[fieldKey] = mode;
    }

    async saveAppOnboardingPolicy() {
        this.savingAppOnboardingPolicy = true;
        try {
            await firstValueFrom(this.settingsService.upsertAppSettings({
                onboarding_policy: this.appOnboardingPolicy
            }));
            this.toast.success('Política guardada', 'La política global de onboarding se ha actualizado.');
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo guardar la política global de onboarding.');
            console.error('Error saving app onboarding policy:', e);
        } finally {
            this.savingAppOnboardingPolicy = false;
        }
    }
}