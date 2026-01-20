import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SupabaseMyCommissionsService, CommissionLog } from '../../../services/supabase-my-commissions.service';

interface CommissionStats {
    total: number;
    count: number;
    avgTicket: number;
}

@Component({
    selector: 'app-my-commissions',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './my-commissions.component.html',
    styleUrls: ['./my-commissions.component.scss'],
    providers: [DatePipe]
})
export class MyCommissionsComponent implements OnInit {
    private auth = inject(AuthService);
    private commissionsService = inject(SupabaseMyCommissionsService);

    currentDate: Date = new Date();
    commissions: CommissionLog[] = [];
    stats: CommissionStats = { total: 0, count: 0, avgTicket: 0 };
    loading = true;

    companyId: string | null = null;

    ngOnInit() {
        // Assuming currentCompanyId is a Signal or function returning string | null
        const cId = this.auth.currentCompanyId();
        this.companyId = typeof cId === 'function' ? (cId as any)() : cId;

        // If it's just a signal value (Angular 17+), it might be accessed directly.
        // Let's assume standard access. If 'unknown', I'll cast to string.
        if (this.companyId) {
            this.loadData();
        }
    }

    loadData() {
        if (!this.companyId) return;
        this.loading = true;

        const start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

        this.commissionsService.getMyCommissions(this.companyId as string, start, end).subscribe({
            next: (data) => {
                this.commissions = data;
                this.calculateLocalStats();
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    calculateLocalStats() {
        const total = this.commissions.reduce((sum, log) => sum + log.calculated_commission, 0);
        const count = this.commissions.length;
        const totalSales = this.commissions.reduce((sum, log) => sum + log.service_price, 0);
        const avgTicket = count > 0 ? totalSales / count : 0;

        this.stats = { total, count, avgTicket };
    }

    prevMonth() {
        const d = new Date(this.currentDate);
        d.setMonth(d.getMonth() - 1);
        this.currentDate = d;
        this.loadData();
    }

    nextMonth() {
        const d = new Date(this.currentDate);
        d.setMonth(d.getMonth() + 1);
        this.currentDate = d;
        this.loadData();
    }

    get monthLabel(): string {
        return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(this.currentDate);
    }
}
