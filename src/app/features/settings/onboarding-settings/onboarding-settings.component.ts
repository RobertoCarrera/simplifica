import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import {
    getDefaultOnboardingPolicy,
    mergeOnboardingPolicies,
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
import { AuthService, AppUser } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

type OnboardingFieldKey = UserOnboardingFieldKey | ClientOnboardingFieldKey | CompanyOnboardingFieldKey;

@Component({
    selector: 'app-onboarding-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './onboarding-settings.component.html',
    styleUrls: ['./onboarding-settings.component.scss']
})
export class OnboardingSettingsComponent implements OnInit, OnDestroy {
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
    companyOnboardingPolicy: OnboardingPolicy = getDefaultOnboardingPolicy();
    savingAppOnboardingPolicy = false;
    savingCompanyOnboardingPolicy = false;

    userProfile: AppUser | null = null;
    private subs = new Subscription();

    constructor(
        private settingsService: SupabaseSettingsService,
        private authService: AuthService,
        private toast: ToastService
    ) {}

    get isSuperAdmin(): boolean {
        return !!this.userProfile?.is_super_admin
            || this.authService.userRole() === 'super_admin';
    }

    get isOwnerOrSuperAdmin(): boolean {
        if (!!this.userProfile?.is_super_admin) return true;
        return this.authService.userRole() === 'owner' || this.authService.userRole() === 'super_admin';
    }

    get hasCompanyContext(): boolean {
        return !!(this.authService.companyId() || this.userProfile?.company_id);
    }

    get canConfigureCompanyOnboarding(): boolean {
        return this.isOwnerOrSuperAdmin && this.hasCompanyContext;
    }

    ngOnInit() {
        this.subs.add(
            this.authService.userProfile$.subscribe({
                next: (profile) => {
                    this.userProfile = profile;
                    this.loadAllPolicies();
                }
            })
        );
    }

    ngOnDestroy() {
        this.subs.unsubscribe();
    }

    private async loadAllPolicies() {
        await Promise.all([
            this.loadAppOnboardingPolicy(),
            this.loadCompanyOnboardingPolicy()
        ]);
    }

    private async loadAppOnboardingPolicy() {
        try {
            const app = await this.settingsService.getAppSettings().toPromise();
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

    private async loadCompanyOnboardingPolicy() {
        if (!this.canConfigureCompanyOnboarding) return;
        try {
            const company = await this.settingsService.getCompanySettings().toPromise();
            if (company?.onboarding_policy) {
                this.companyOnboardingPolicy = mergeOnboardingPolicies(
                    this.appOnboardingPolicy,
                    company.onboarding_policy,
                );
            } else {
                this.companyOnboardingPolicy = normalizeOnboardingPolicy(this.appOnboardingPolicy);
            }
        } catch (e) {
            console.warn('Could not load company onboarding policy:', e);
            this.companyOnboardingPolicy = getDefaultOnboardingPolicy();
        }
    }

    getOnboardingFields(scope: OnboardingScope): OnboardingFieldDefinition[] {
        return onboardingFieldDefinitions.filter((field) => field.scope === scope);
    }

    getOnboardingFieldMode(target: 'app' | 'company', scope: OnboardingScope, fieldKey: OnboardingFieldKey): OnboardingFieldMode {
        const policy = target === 'app' ? this.appOnboardingPolicy : this.companyOnboardingPolicy;
        return policy[scope][fieldKey as keyof typeof policy[typeof scope]] as OnboardingFieldMode;
    }

    setOnboardingFieldMode(target: 'app' | 'company', scope: OnboardingScope, fieldKey: OnboardingFieldKey, mode: OnboardingFieldMode) {
        const currentPolicy = target === 'app' ? this.appOnboardingPolicy : this.companyOnboardingPolicy;
        const nextPolicy = {
            ...currentPolicy,
            [scope]: {
                ...currentPolicy[scope],
                [fieldKey]: mode,
            },
        } as OnboardingPolicy;
        if (target === 'app') {
            this.appOnboardingPolicy = nextPolicy;
        } else {
            this.companyOnboardingPolicy = nextPolicy;
        }
    }

    async saveAppOnboardingPolicy() {
        this.savingAppOnboardingPolicy = true;
        try {
            await this.settingsService.upsertAppSettings({
                onboarding_policy: this.appOnboardingPolicy,
            }).toPromise();
            this.toast.success('Política guardada', 'La política global de onboarding se ha actualizado.');
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo guardar la política global de onboarding.');
            console.error('Error saving app onboarding policy:', e);
        } finally {
            this.savingAppOnboardingPolicy = false;
        }
    }

    async saveCompanyOnboardingPolicy() {
        if (!this.hasCompanyContext) {
            this.toast.error('Sin empresa', 'No hay una empresa activa para guardar esta política.');
            return;
        }
        this.savingCompanyOnboardingPolicy = true;
        try {
            await this.settingsService.upsertCompanySettings({
                onboarding_policy: this.companyOnboardingPolicy,
            }).toPromise();
            this.toast.success('Política guardada', 'La política de onboarding de empresa se ha actualizado.');
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo guardar la política de empresa.');
            console.error('Error saving company onboarding policy:', e);
        } finally {
            this.savingCompanyOnboardingPolicy = false;
        }
    }
}