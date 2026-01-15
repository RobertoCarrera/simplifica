import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingService, MarketingMetric, SocialMetric } from '../../../core/services/marketing.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseMarketingService, Campaign } from '../../../services/supabase-marketing.service';

@Component({
    selector: 'app-marketing-dashboard',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe],
    templateUrl: './marketing-dashboard.component.html',
    styleUrls: ['./marketing-dashboard.component.scss']
})
export class MarketingDashboardComponent implements OnInit {
    private marketingService = inject(MarketingService);
    private campaignService = inject(SupabaseMarketingService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    // Data Signals
    marketingMetrics = signal<MarketingMetric[]>([]);
    socialMetrics = signal<SocialMetric[]>([]);
    campaigns = signal<Campaign[]>([]);

    loading = signal(true);

    // UI State
    activeTab = signal<'performance' | 'social' | 'campaigns'>('performance');
    showAddMetricModal = signal(false);

    // Campaign UI State
    showCampaignModal = signal(false);
    newCampaign: Campaign = this.getEmptyCampaign();
    audienceSize = signal(0);
    loadingAudience = signal(false);
    isSendingCampaign = signal(false);

    // Forms
    metricForm = this.fb.group({
        date: [new Date().toISOString().split('T')[0], Validators.required],
        channel: ['google_ads', Validators.required],
        spend: [0, [Validators.min(0)]],
        clicks: [0, [Validators.min(0)]],
        impressions: [0, [Validators.min(0)]]
    });

    // KPIs Computed
    totalSpend = computed(() => this.marketingMetrics().reduce((acc, m) => acc + (m.spend || 0), 0));
    totalClicks = computed(() => this.marketingMetrics().reduce((acc, m) => acc + (m.clicks || 0), 0));
    avgCpc = computed(() => {
        const clicks = this.totalClicks();
        return clicks > 0 ? this.totalSpend() / clicks : 0;
    });

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        const cid = this.authService.companyId();
        if (!cid) return;

        this.loading.set(true);
        // Load last 30 days by default
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Parallel loading
        this.marketingService.getMarketingMetrics(cid, startDate, endDate).subscribe(data => {
            this.marketingMetrics.set(data);
            this.loading.set(false);
        });

        this.marketingService.getSocialMetrics(cid, startDate, endDate).subscribe(data => {
            this.socialMetrics.set(data);
        });

        // Load Campaigns
        this.loadCampaigns(cid);
    }

    async loadCampaigns(cid: string) {
        try {
            const data = await this.campaignService.getCampaigns(cid);
            this.campaigns.set(data);
        } catch (e) {
            console.error("Error loading campaigns", e);
        }
    }

    // --- Marketing Metrics Logic ---

    openAddModal() {
        this.showAddMetricModal.set(true);
    }

    closeModal() {
        this.showAddMetricModal.set(false);
        this.metricForm.reset({
            date: new Date().toISOString().split('T')[0],
            channel: 'google_ads',
            spend: 0,
            clicks: 0,
            impressions: 0
        });
    }

    async saveMetric() {
        if (this.metricForm.invalid) return;

        const cid = this.authService.companyId();
        if (!cid) return;

        try {
            const val = this.metricForm.value;
            await this.marketingService.upsertMarketingMetric({
                company_id: cid,
                date: val.date!,
                channel: val.channel as 'google_ads' | 'instagram_ads' | 'tiktok_ads' | 'organic' | 'email' | 'other',
                spend: Number(val.spend),
                clicks: Number(val.clicks),
                impressions: Number(val.impressions),
                leads_attributed: 0 // Manual entry for now
            });
            this.toast.success('Guardado', 'Métrica registrada correctamente');
            this.loadData();
            this.closeModal();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la métrica');
        }
    }

    getChannelLabel(key: string): string {
        const map: any = {
            'google_ads': 'Google Ads',
            'instagram_ads': 'Instagram Ads',
            'tiktok_ads': 'TikTok Ads',
            'organic': 'Orgánico',
            'email': 'Email Marketing'
        };
        return map[key] || key;
    }

    // --- Campaign Logic ---

    getEmptyCampaign(): Campaign {
        return {
            name: '',
            type: 'email',
            content: '',
            target_audience: { inactive_days: 30 }
        };
    }

    openCampaignModal() {
        this.newCampaign = this.getEmptyCampaign();
        this.checkAudience();
        this.showCampaignModal.set(true);
    }

    closeCampaignModal() {
        this.showCampaignModal.set(false);
    }

    async checkAudience() {
        const companyId = this.authService.companyId();
        if (!companyId) return;

        this.loadingAudience.set(true);
        try {
            const criteria: any = {};
            if (this.newCampaign.target_audience.inactive_days) criteria.inactive_days = this.newCampaign.target_audience.inactive_days;
            if (this.newCampaign.target_audience.birthday_month) criteria.birthday_month = this.newCampaign.target_audience.birthday_month;

            const result = await this.campaignService.getEstimatedAudience(companyId, criteria);
            this.audienceSize.set(result.length);
        } catch (e) {
            console.error(e);
        } finally {
            this.loadingAudience.set(false);
        }
    }

    async saveCampaign() {
        const companyId = this.authService.companyId();
        if (!companyId) return;

        try {
            this.newCampaign.company_id = companyId;
            await this.campaignService.createCampaign(this.newCampaign);
            this.toast.success('Campaña creada', 'La campaña se ha guardado correctamente');
            this.closeCampaignModal();
            this.loadCampaigns(companyId);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la campaña');
        }
    }

    async sendCampaign(campaign: Campaign) {
        if (!confirm('¿Estás seguro de enviar esta campaña ahora? Esta acción no se puede deshacer.')) return;

        this.isSendingCampaign.set(true);
        try {
            const result = await this.campaignService.sendCampaign(campaign.id!);

            const cid = this.authService.companyId();
            if (cid) this.loadCampaigns(cid);

            if (result.success) {
                this.toast.success('Enviada', `Campaña enviada: ${result.sent} ok, ${result.failed} fallidos`);
            } else {
                this.toast.info('Procesada', 'La campaña se procesó pero revisa las advertencias.');
            }
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'Falló el envío de la campaña');
        } finally {
            this.isSendingCampaign.set(false);
        }
    }

    getStatusClass(status: string) {
        switch (status) {
            case 'sent': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'scheduled': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
        }
    }

    getMonthName(month: number) {
        const date = new Date();
        date.setMonth(month - 1);
        return date.toLocaleDateString('es-ES', { month: 'long' });
    }

}
