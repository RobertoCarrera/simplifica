import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingService, MarketingMetric, SocialMetric, ContentPost } from '../../../core/services/marketing.service';
import { AnalyticsService } from '../../../services/analytics.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseMarketingService, Campaign } from '../../../services/supabase-marketing.service';
import { CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
    selector: 'app-marketing-dashboard',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, DatePipe, DragDropModule],
    templateUrl: './marketing-dashboard.component.html',
    styleUrls: ['./marketing-dashboard.component.scss']
})
export class MarketingDashboardComponent implements OnInit {
    private marketingService = inject(MarketingService);
    private analyticsService = inject(AnalyticsService);
    private campaignService = inject(SupabaseMarketingService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    // Data Signals
    marketingMetrics = signal<MarketingMetric[]>([]);
    leadsMetrics = signal<{ source: string; count: number }[]>([]);
    socialMetrics = signal<SocialMetric[]>([]);
    campaigns = signal<Campaign[]>([]);
    contentPosts = signal<ContentPost[]>([]); // New Signal for Kanban

    loading = signal(true);

    // UI State
    activeTab = signal<'performance' | 'social' | 'campaigns' | 'calendar'>('performance');
    showAddMetricModal = signal(false);
    showPostModal = signal(false); // New modal state

    // Campaign UI State
    showCampaignModal = signal(false);
    newCampaign: Campaign = this.getEmptyCampaign();
    audienceSize = signal(0);
    loadingAudience = signal(false);
    isSendingCampaign = signal(false);

    // Forms
    metricType = signal<'advertising' | 'social'>('advertising');

    metricForm = this.fb.group({
        date: [new Date().toISOString().split('T')[0], Validators.required],
        channel: ['google_ads', Validators.required],
        spend: [0, [Validators.min(0)]],
        clicks: [0, [Validators.min(0)]],
        impressions: [0, [Validators.min(0)]]
    });

    socialForm = this.fb.group({
        date: [new Date().toISOString().split('T')[0], Validators.required],
        platform: ['instagram', Validators.required],
        followers: [0, [Validators.min(0)]],
        engagement_rate: [0, [Validators.min(0), Validators.max(100)]],
        posts_count: [0, [Validators.min(0)]]
    });
    // Post Form
    postForm = this.fb.group({
        title: ['', Validators.required],
        platform: ['instagram', Validators.required],
        status: ['idea', Validators.required],
        scheduled_date: [new Date().toISOString().split('T')[0]],
        notes: ['']
    });

    kanbanColumns = ['idea', 'copy', 'design', 'review', 'scheduled', 'published'];

    // KPIs Computed
    totalSpend = computed(() => this.marketingMetrics().reduce((acc, m) => acc + (m.spend || 0), 0));
    totalClicks = computed(() => this.marketingMetrics().reduce((acc, m) => acc + (m.clicks || 0), 0));

    // Performance Table Data (Merged)
    performanceData = computed(() => {
        const metrics = this.marketingMetrics();
        const leads = this.leadsMetrics();

        // 1. Map Leads Count by Channel
        const leadsMap = new Map<string, number>();
        leads.forEach(l => leadsMap.set(l.source, l.count));

        // 2. Aggregate Spend/Clicks by Channel
        const channelStats = new Map<string, { spend: number, clicks: number, impressions: number }>();
        metrics.forEach(m => {
            const current = channelStats.get(m.channel) || { spend: 0, clicks: 0, impressions: 0 };
            channelStats.set(m.channel, {
                spend: current.spend + (m.spend || 0),
                clicks: current.clicks + (m.clicks || 0),
                impressions: current.impressions + (m.impressions || 0)
            });
        });

        // 3. Merge
        const allChannels = new Set([...encodeChannels(leadsMap.keys()), ...channelStats.keys()]);
        const result: any[] = [];

        allChannels.forEach(channel => {
            const stats = channelStats.get(channel) || { spend: 0, clicks: 0, impressions: 0 };
            const decodedSource = decodeChannel(channel);
            const leadCount = leadsMap.get(decodedSource) || 0;

            const cpl = leadCount > 0 ? stats.spend / leadCount : 0;
            const cpc = stats.clicks > 0 ? stats.spend / stats.clicks : 0;

            result.push({
                channel,
                spend: stats.spend,
                clicks: stats.clicks,
                impressions: stats.impressions,
                leads: leadCount,
                cpl,
                cpc
            });
        });

        return result.sort((a, b) => b.spend - a.spend);
    });

    totalLeads = computed(() => this.performanceData().reduce((acc, row) => acc + row.leads, 0));
    avgCpl = computed(() => {
        const spend = this.totalSpend();
        const leads = this.totalLeads();
        return leads > 0 ? spend / leads : 0;
    });

    avgCpc = computed(() => {
        const clicks = this.totalClicks();
        return clicks > 0 ? this.totalSpend() / clicks : 0;
    });

    // Social KPIs Computed
    instagramFollowers = computed(() => {
        // Get latest instagram metric
        const metrics = this.socialMetrics().filter(m => m.platform === 'instagram');
        return metrics.length > 0 ? metrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].followers : 0;
    });

    tiktokFollowers = computed(() => {
        const metrics = this.socialMetrics().filter(m => m.platform === 'tiktok');
        return metrics.length > 0 ? metrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].followers : 0;
    });

    avgEngagement = computed(() => {
        const metrics = this.socialMetrics();
        if (metrics.length === 0) return 0;
        const totalEng = metrics.reduce((acc, m) => acc + Number(m.engagement_rate), 0);
        return totalEng / metrics.length;
    });

    monthlyPosts = computed(() => {
        return this.socialMetrics().reduce((acc, m) => acc + (m.posts_count || 0), 0);
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

        // Load Leads for ROI
        this.analyticsService.getLeadsByChannel(startDate, endDate).then(data => {
            this.leadsMetrics.set(data);
        });

        // Load Campaigns
        this.loadCampaigns(cid);

        // Load Content Posts
        this.loadContentPosts(cid);
    }

    // --- Content Calendar Logic ---

    async loadContentPosts(cid: string) {
        this.marketingService.getContentPosts(cid).subscribe(posts => {
            this.contentPosts.set(posts);
        });
    }

    getPostsByStatus(status: string) {
        return this.contentPosts().filter(p => p.status === status);
    }

    async drop(event: CdkDragDrop<ContentPost[]>, newStatus: string) {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const item = event.previousContainer.data[event.previousIndex];
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );

            // Optimistic update
            const updatedPosts = this.contentPosts().map(p => {
                if (p.id === item.id) return { ...p, status: newStatus as any };
                return p;
            });
            this.contentPosts.set(updatedPosts);

            // Backend Update
            try {
                if (item.id) {
                    await this.marketingService.updateContentPost(item.id, { status: newStatus as any });
                }
            } catch (e) {
                console.error(e);
                this.toast.error('Error', 'No se pudo actualizar el estado');
                this.loadData(); // Revert on error
            }
        }
    }

    openPostModal() {
        this.postForm.reset({
            status: 'idea',
            scheduled_date: new Date().toISOString().split('T')[0],
            platform: 'instagram'
        });
        this.showPostModal.set(true);
    }

    async savePost() {
        if (this.postForm.invalid) return;
        const cid = this.authService.companyId();
        if (!cid) return;

        try {
            await this.marketingService.createContentPost({
                company_id: cid,
                ...this.postForm.value as any
            });
            this.toast.success('Creado', 'Post añadido al calendario');
            this.showPostModal.set(false);
            this.loadContentPosts(cid);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo crear el post');
        }
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
            'email': 'Email Marketing',
            'instagram': 'Instagram',
            'tiktok': 'TikTok',
            'facebook': 'Facebook',
            'linkedin': 'LinkedIn',
            'google_business': 'Google Business'
        };
        return map[key] || key;
    }

    async saveSocialMetric() {
        if (this.socialForm.invalid) return;
        const cid = this.authService.companyId();
        if (!cid) return;

        try {
            const val = this.socialForm.value;
            await this.marketingService.upsertSocialMetric({
                company_id: cid,
                date: val.date!,
                platform: val.platform as 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'google_business',
                followers: Number(val.followers),
                engagement_rate: Number(val.engagement_rate),
                posts_count: Number(val.posts_count)
            });
            this.toast.success('Guardado', 'Métrica social registrada');
            this.loadData();
            this.closeModal();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la métrica social');
        }
    }

    // --- Campaign Logic ---

    getEmptyCampaign(): Campaign {
        return {
            name: '',
            type: 'email',
            content: '',
            target_audience: { inactive_days: 30 },
            trigger_type: 'manual',
            is_active: false,
            config: {}
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
        // If automation, we can essentially use the same estimation logic for now
        // Birthday automation -> birthday_month (current month approx) or just 1/12th of total?
        // Inactivity automation -> inactive_days

        const companyId = this.authService.companyId();
        if (!companyId) return;

        this.loadingAudience.set(true);
        try {
            const criteria: any = {};

            // Map automation config to audience criteria for estimation
            if (this.newCampaign.trigger_type === 'inactivity') {
                // Use the config days or default 30
                const days = this.newCampaign.config?.days || 30;
                criteria.inactive_days = days;
            } else if (this.newCampaign.trigger_type === 'birthday') {
                // For estimation, maybe show people having birthday THIS month?
                criteria.birthday_month = new Date().getMonth() + 1;
            } else {
                // Manual
                if (this.newCampaign.target_audience.inactive_days) criteria.inactive_days = this.newCampaign.target_audience.inactive_days;
                if (this.newCampaign.target_audience.birthday_month) criteria.birthday_month = this.newCampaign.target_audience.birthday_month;
            }

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

            // Prepare Automation Config
            if (this.newCampaign.trigger_type === 'inactivity') {
                // Ensure config has days
                if (!this.newCampaign.config?.days) {
                    this.newCampaign.config = { days: 30 };
                }
                // Only auto-activate on creation, or keep as is on edit
                if (!this.newCampaign.id) {
                    this.newCampaign.is_active = true;
                }
            } else if (this.newCampaign.trigger_type === 'birthday') {
                if (!this.newCampaign.id) {
                    this.newCampaign.is_active = true;
                }
                this.newCampaign.config = {};
            } else {
                if (!this.newCampaign.id) {
                    this.newCampaign.is_active = false; // Manual
                }
            }

            if (this.newCampaign.id) {
                // Update
                const { id, ...updates } = this.newCampaign;
                await this.campaignService.updateCampaign(id, updates);
                this.toast.success('Actualizado', 'La campaña se ha actualizado correctamente.');
            } else {
                // Create
                await this.campaignService.createCampaign(this.newCampaign);
                if (this.newCampaign.trigger_type !== 'manual') {
                    this.toast.success('Automatización Activada', 'La campaña se ejecutará diariamente.');
                } else {
                    this.toast.success('Borrador creado', 'La campaña manual se ha guardado.');
                }
            }

            this.closeCampaignModal();
            this.loadCampaigns(companyId);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la campaña');
        }
    }

    editCampaign(campaign: Campaign) {
        // deep copy to avoid mutating the list until saved
        this.newCampaign = JSON.parse(JSON.stringify(campaign));
        // Ensure config is not null
        if (!this.newCampaign.config) this.newCampaign.config = {};

        this.checkAudience();
        this.showCampaignModal.set(true);
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

    async toggleCampaignStatus(campaign: Campaign) {
        // Toggle Active/Inactive for automation
        if (!campaign.id) return;
        const newStatus = !campaign.is_active;
        try {
            // We need an update method in service. For now assuming createCampaign handles upsert or we add update.
            // Wait, service only has createCampaign (insert). We need updateCampaign.
            // I'll add a quick direct call or update service. Service has updateContentPost but not updateCampaign?
            // Checking service... Service has insert. I need to add update.
            // For now, I will add updateCampaign to service in next step or use direct supabase client if I could.
            // Let's assume I will add it.
            await this.campaignService.updateCampaign(campaign.id, { is_active: newStatus });
            campaign.is_active = newStatus;
            this.toast.success('Actualizado', `Campaña ${newStatus ? 'activada' : 'pausada'}`);
        } catch (e) {
            this.toast.error('Error', 'No se pudo actualizar');
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

// Helper functions for mapping
function encodeChannels(iterator: IterableIterator<string>): string[] {
    const list: string[] = [];
    for (const src of iterator) {
        // Map lead source to marketing channel key if possible
        if (src === 'google_ads') list.push('google_ads');
        else if (src === 'instagram_ads') list.push('instagram_ads');
        else if (src === 'tiktok_ads') list.push('tiktok_ads');
        else if (src === 'email_marketing') list.push('email');
        else list.push('other'); // Aggregate others? keeping strictly mapped ones for now or adding 'other'
    }
    return list;
}

function decodeChannel(channel: string): string {
    if (channel === 'email') return 'email_marketing';
    return channel;
}
