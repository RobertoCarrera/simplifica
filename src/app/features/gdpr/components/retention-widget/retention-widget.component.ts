import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RetentionService, RetentionSummary, RetentionRecord } from '../../services/retention.service';
import { LucideAngularModule, Shield, Users, FileText, Calendar, FileCheck, 
         ClipboardList, AlertTriangle, CheckCircle, XCircle, Trash2, Eye, X,
         Clock, Loader2, Info, ArrowLeft } from 'lucide-angular';

type FilterType = 'all' | 'protected' | 'expired';

@Component({
  selector: 'app-retention-widget',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './retention-widget.component.html',
  styleUrls: ['./retention-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionWidgetComponent implements OnInit {
  private retentionService = inject(RetentionService);
  private router = inject(Router);
  
  // Icons
  Shield = Shield;
  Users = Users;
  FileText = FileText;
  Calendar = Calendar;
  FileCheck = FileCheck;
  ClipboardList = ClipboardList;
  AlertTriangle = AlertTriangle;
  CheckCircle = CheckCircle;
  XCircle = XCircle;
  Trash2 = Trash2;
  Eye = Eye;
  X = X;
  Clock = Clock;
  Loader2 = Loader2;
  Info = Info;
  ArrowLeft = ArrowLeft;

  isLoading = signal(true);
  summary = signal<RetentionSummary[]>([]);
  
  // Modal state
  showModal = signal(false);
  selectedCategory = signal<string | null>(null);
  selectedCategoryLabel = signal<string>('');
  filter: FilterType = 'all';
  page = 1;
  limit = 50;
  records = signal<RetentionRecord[]>([]);
  totalRecords = signal(0);
  loadingRecords = signal(false);
  
  // Delete confirmation
  deleteConfirmId = signal<string | null>(null);
  isDeleting = signal(false);

  // Category icons map
  categoryIcons: Record<string, any> = {
    customers: Users,
    invoices: FileText,
    quotes: FileText,
    bookings: Calendar,
    clinical_notes: FileCheck,
    client_notes: FileCheck,
    documents: ClipboardList,
    consents: FileCheck,
    audit_logs: Shield,
  };

  // Category labels
  categoryLabels: Record<string, string> = {
    customers: 'Clientes',
    invoices: 'Facturas',
    quotes: 'Presupuestos',
    bookings: 'Reservas',
    clinical_notes: 'Notas Clínicas',
    client_notes: 'Notas de Cliente',
    documents: 'Documentos',
    consents: 'Consentimientos',
    audit_logs: 'Auditoría',
  };

  goBack() {
    this.router.navigate(['/gdpr']);
  }

  async ngOnInit() {
    await this.loadSummary();
  }

  async loadSummary() {
    this.isLoading.set(true);
    try {
      const data = await this.retentionService.getSummary();
      this.summary.set(data);
    } finally {
      this.isLoading.set(false);
    }
  }

  async openCategoryDetail(category: string) {
    this.selectedCategory.set(category);
    this.selectedCategoryLabel.set(this.categoryLabels[category] || category);
    this.filter = 'all';
    this.page = 1;
    this.showModal.set(true);
    await this.loadRecords();
  }

  async loadRecords() {
    this.loadingRecords.set(true);
    try {
      const cat = this.selectedCategory();
      if (!cat) return;
      const result = await this.retentionService.getRecords(cat, this.filter, this.page, this.limit);
      this.records.set(result.records);
      this.totalRecords.set(result.total);
    } finally {
      this.loadingRecords.set(false);
    }
  }

  async setFilter(filter: FilterType) {
    this.filter = filter;
    this.page = 1;
    await this.loadRecords();
  }

  async confirmDelete(record: RetentionRecord) {
    this.deleteConfirmId.set(record.uuid);
  }

  async cancelDelete() {
    this.deleteConfirmId.set(null);
  }

  async executeDelete() {
    const recordId = this.deleteConfirmId();
    const cat = this.selectedCategory();
    if (!recordId || !cat) return;
    
    // Get table_name from summary (category != table_name)
    const summaryItem = this.summary().find(s => s.category === cat);
    const tableName = summaryItem?.table_name || cat;
    
    this.isDeleting.set(true);
    try {
      const success = await this.retentionService.deleteRecord(tableName, recordId);
      if (success) {
        this.deleteConfirmId.set(null);
        await this.loadRecords();
        await this.loadSummary(); // Refresh counts
      }
    } finally {
      this.isDeleting.set(false);
    }
  }

  closeModal() {
    this.showModal.set(false);
    this.selectedCategory.set(null);
    this.records.set([]);
  }

  formatAge(days: number): string {
    if (days < 30) return `${days} días`;
    if (days < 365) return `${Math.floor(days / 30)} meses`;
    return `${Math.floor(days / 365)} años`;
  }

  totalPages = computed(() => Math.ceil(this.totalRecords() / this.limit));
}
