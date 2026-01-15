import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingService, MarketingMetric, SocialMetric } from '../../../core/services/marketing.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-marketing-dashboard',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './marketing-dashboard.component.html',
    styleUrls: ['./marketing-dashboard.component.scss']
})
export class MarketingDashboardComponent implements OnInit {
    private marketingService = inject(MarketingService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    // Data Signals
    marketingMetrics = signal<MarketingMetric[]>([]);
    socialMetrics = signal<SocialMetric[]>([]);
    loading = signal(true);

    // UI State
    activeTab = signal<'performance' | 'social'>('performance');
    showAddMetricModal = signal(false);

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

        this.marketingService.getMarketingMetrics(cid, startDate, endDate).subscribe(data => {
            this.marketingMetrics.set(data);
            this.loading.set(false);
        });

        this.marketingService.getSocialMetrics(cid, startDate, endDate).subscribe(data => {
            this.socialMetrics.set(data);
        });
    }

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
}
