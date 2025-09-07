import { Injectable, signal, computed } from '@angular/core';
import {
  ExportConfig,
  ImportConfig,
  ExportJob,
  ImportJob,
  FileUpload,
  ImportPreview,
  ExportTemplate,
  ImportTemplate,
  ExportStats,
  JobStatus,
  UploadStatus,
  ExportFormat,
  ImportFormat,
  ExportEntityType,
  ImportEntityType,
  FieldMapping,
  ValidationRule,
  ValidationResult,
  FileProcessor,
  CustomerExportData,
  TicketExportData,
  ProductExportData
} from '../models/export-import.interface';

@Injectable({
  providedIn: 'root'
})
export class ExportImportService {
  // Reactive state
  private exportConfigs = signal<ExportConfig[]>([]);
  private importConfigs = signal<ImportConfig[]>([]);
  private exportJobs = signal<ExportJob[]>([]);
  private importJobs = signal<ImportJob[]>([]);
  private fileUploads = signal<FileUpload[]>([]);
  private exportTemplates = signal<ExportTemplate[]>([]);
  private importTemplates = signal<ImportTemplate[]>([]);

  // Public readonly signals
  readonly exportConfigs$ = this.exportConfigs.asReadonly();
  readonly importConfigs$ = this.importConfigs.asReadonly();
  readonly exportJobs$ = this.exportJobs.asReadonly();
  readonly importJobs$ = this.importJobs.asReadonly();
  readonly fileUploads$ = this.fileUploads.asReadonly();
  readonly exportTemplates$ = this.exportTemplates.asReadonly();
  readonly importTemplates$ = this.importTemplates.asReadonly();

  // Computed statistics
  readonly exportImportStats = computed(() => {
    const exports = this.exportJobs();
    const imports = this.importJobs();
    const allJobs = [...exports, ...imports];

    const completedExports = exports.filter(j => j.status === 'completed');
    const completedImports = imports.filter(j => j.status === 'completed');
    
    return {
      totalExports: exports.length,
      totalImports: imports.length,
      successRate: allJobs.length > 0 
        ? ((completedExports.length + completedImports.length) / allJobs.length) * 100 
        : 0,
      averageExportTime: completedExports.length > 0
        ? completedExports.reduce((acc, job) => {
            if (job.completedAt && job.startedAt) {
              return acc + (job.completedAt.getTime() - job.startedAt.getTime());
            }
            return acc;
          }, 0) / completedExports.length
        : 0,
      averageImportTime: completedImports.length > 0
        ? completedImports.reduce((acc, job) => {
            if (job.completedAt && job.startedAt) {
              return acc + (job.completedAt.getTime() - job.startedAt.getTime());
            }
            return acc;
          }, 0) / completedImports.length
        : 0,
      popularFormats: this.getPopularFormats(),
      recentJobs: allJobs
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, 10)
    } as ExportStats;
  });

  // File processors for different formats
  private fileProcessors: Map<string, FileProcessor> = new Map();

  constructor() {
    this.initializeTemplates();
    this.initializeFileProcessors();
    this.generateMockData();
    this.loadFromStorage();
  }

  // Export Configuration Management
  createExportConfig(config: Omit<ExportConfig, 'id' | 'createdAt' | 'updatedAt'>): string {
    const newConfig: ExportConfig = {
      ...config,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.exportConfigs.update(current => [...current, newConfig]);
    this.saveToStorage();
    return newConfig.id;
  }

  updateExportConfig(id: string, updates: Partial<ExportConfig>): void {
    this.exportConfigs.update(current =>
      current.map(config =>
        config.id === id
          ? { ...config, ...updates, updatedAt: new Date() }
          : config
      )
    );
    this.saveToStorage();
  }

  deleteExportConfig(id: string): void {
    this.exportConfigs.update(current => current.filter(c => c.id !== id));
    this.saveToStorage();
  }

  // Import Configuration Management
  createImportConfig(config: Omit<ImportConfig, 'id' | 'createdAt' | 'updatedAt'>): string {
    const newConfig: ImportConfig = {
      ...config,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.importConfigs.update(current => [...current, newConfig]);
    this.saveToStorage();
    return newConfig.id;
  }

  updateImportConfig(id: string, updates: Partial<ImportConfig>): void {
    this.importConfigs.update(current =>
      current.map(config =>
        config.id === id
          ? { ...config, ...updates, updatedAt: new Date() }
          : config
      )
    );
    this.saveToStorage();
  }

  deleteImportConfig(id: string): void {
    this.importConfigs.update(current => current.filter(c => c.id !== id));
    this.saveToStorage();
  }

  // Export Operations
  async executeExport(configId: string): Promise<string> {
    const config = this.exportConfigs().find(c => c.id === configId);
    if (!config) {
      throw new Error('Export configuration not found');
    }

    const job: ExportJob = {
      id: this.generateId(),
      configId,
      status: 'running',
      startedAt: new Date(),
      recordsProcessed: 0,
      recordsExported: 0,
      errors: [],
      warnings: [],
      metadata: {}
    };

    this.exportJobs.update(current => [...current, job]);

    try {
      // Simulate export process
      await this.processExport(job, config);
      
      this.exportJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { ...j, status: 'completed', completedAt: new Date() }
            : j
        )
      );

      console.log('✅ Export completed:', job.id);
      return job.id;

    } catch (error) {
      this.exportJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { 
                ...j, 
                status: 'failed', 
                completedAt: new Date(),
                errors: [...j.errors, {
                  id: this.generateId(),
                  message: error instanceof Error ? error.message : 'Unknown error',
                  code: 'EXPORT_FAILED',
                  severity: 'error'
                }]
              }
            : j
        )
      );
      throw error;
    }
  }

  async quickExport(entityType: ExportEntityType, format: ExportFormat): Promise<string> {
    const quickConfig: Omit<ExportConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Quick Export - ${entityType}`,
      description: `Quick export of ${entityType} data`,
      entityType,
      format,
      fields: this.getDefaultFieldsForEntity(entityType),
      createdBy: 'current_user'
    };

    const configId = this.createExportConfig(quickConfig);
    return this.executeExport(configId);
  }

  // Import Operations
  async uploadFile(file: File): Promise<string> {
    const upload: FileUpload = {
      id: this.generateId(),
      file,
      progress: 0,
      status: 'pending'
    };

    this.fileUploads.update(current => [...current, upload]);

    try {
      // Simulate file upload and processing
      await this.processFileUpload(upload);
      
      this.fileUploads.update(current =>
        current.map(u =>
          u.id === upload.id
            ? { ...u, status: 'completed', progress: 100 }
            : u
        )
      );

      return upload.id;

    } catch (error) {
      this.fileUploads.update(current =>
        current.map(u =>
          u.id === upload.id
            ? { 
                ...u, 
                status: 'failed', 
                error: error instanceof Error ? error.message : 'Upload failed'
              }
            : u
        )
      );
      throw error;
    }
  }

  async getFilePreview(fileId: string, rows: number = 10): Promise<ImportPreview> {
    const upload = this.fileUploads().find(u => u.id === fileId);
    if (!upload) {
      throw new Error('File upload not found');
    }

    const processor = this.getFileProcessor(upload.file);
    return processor.getPreview(upload.file, rows);
  }

  async executeImport(fileId: string, config?: ImportConfig): Promise<string> {
    const upload = this.fileUploads().find(u => u.id === fileId);
    if (!upload) {
      throw new Error('File upload not found');
    }

    const job: ImportJob = {
      id: this.generateId(),
      configId: config?.id,
      fileName: upload.file.name,
      fileSize: upload.file.size,
      mimeType: upload.file.type,
      status: 'running',
      startedAt: new Date(),
      recordsProcessed: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      validationResults: [],
      metadata: {}
    };

    this.importJobs.update(current => [...current, job]);

    try {
      // Simulate import process
      await this.processImport(job, upload, config);
      
      this.importJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { ...j, status: 'completed', completedAt: new Date() }
            : j
        )
      );

      console.log('✅ Import completed:', job.id);
      return job.id;

    } catch (error) {
      this.importJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { 
                ...j, 
                status: 'failed', 
                completedAt: new Date(),
                errors: [...j.errors, {
                  id: this.generateId(),
                  message: error instanceof Error ? error.message : 'Unknown error',
                  code: 'IMPORT_FAILED',
                  severity: 'error'
                }]
              }
            : j
        )
      );
      throw error;
    }
  }

  // Template Management
  createExportFromTemplate(templateId: string, name: string): string {
    const template = this.exportTemplates().find(t => t.id === templateId);
    if (!template) {
      throw new Error('Export template not found');
    }

    return this.createExportConfig({
      name,
      description: `Created from template: ${template.name}`,
      entityType: template.entityType,
      format: template.format,
      fields: [...template.fields],
      filters: template.filters ? [...template.filters] : undefined,
      createdBy: 'current_user'
    });
  }

  createImportFromTemplate(templateId: string, name: string): string {
    const template = this.importTemplates().find(t => t.id === templateId);
    if (!template) {
      throw new Error('Import template not found');
    }

    return this.createImportConfig({
      name,
      description: `Created from template: ${template.name}`,
      entityType: template.entityType,
      format: template.format,
      fieldMapping: [...template.fieldMapping],
      validationRules: [...template.validationRules],
      duplicateHandling: 'skip',
      batchSize: 100,
      createdBy: 'current_user'
    });
  }

  // Utility Methods
  downloadExportFile(jobId: string): void {
    const job = this.exportJobs().find(j => j.id === jobId);
    if (!job || job.status !== 'completed' || !job.downloadUrl) {
      throw new Error('Export file not available for download');
    }

    // In a real implementation, this would download the actual file
    const link = document.createElement('a');
    link.href = job.downloadUrl;
    link.download = `export_${job.id}.${this.getFileExtension(job)}`;
    link.click();
  }

  cancelJob(jobId: string): void {
    this.exportJobs.update(current =>
      current.map(job =>
        job.id === jobId && job.status === 'running'
          ? { ...job, status: 'cancelled', completedAt: new Date() }
          : job
      )
    );

    this.importJobs.update(current =>
      current.map(job =>
        job.id === jobId && job.status === 'running'
          ? { ...job, status: 'cancelled', completedAt: new Date() }
          : job
      )
    );
  }

  // Private methods
  private async processExport(job: ExportJob, config: ExportConfig): Promise<void> {
    // Simulate data fetching and processing
    const data = await this.fetchDataForExport(config.entityType);
    
    // Update progress
    this.exportJobs.update(current =>
      current.map(j =>
        j.id === job.id
          ? { ...j, recordsProcessed: data.length }
          : j
      )
    );

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate file
    const processor = this.fileProcessors.get(config.format);
    if (processor) {
      const blob = await processor.generate(data, config);
      const url = URL.createObjectURL(blob);
      
      this.exportJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { 
                ...j, 
                recordsExported: data.length,
                fileSize: blob.size,
                downloadUrl: url
              }
            : j
        )
      );
    }
  }

  private async processFileUpload(upload: FileUpload): Promise<void> {
    // Simulate upload progress
    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      this.fileUploads.update(current =>
        current.map(u =>
          u.id === upload.id
            ? { ...u, progress, status: 'uploading' }
            : u
        )
      );
    }

    // Process file and get preview
    const processor = this.getFileProcessor(upload.file);
    const preview = await processor.getPreview(upload.file, 5);
    
    this.fileUploads.update(current =>
      current.map(u =>
        u.id === upload.id
          ? { 
              ...u, 
              status: 'processing',
              previewData: preview.data,
              detectedFormat: this.detectFormat(upload.file),
              detectedHeaders: preview.headers,
              estimatedRows: preview.totalRows
            }
          : u
      )
    );
  }

  private async processImport(job: ImportJob, upload: FileUpload, config?: ImportConfig): Promise<void> {
    const processor = this.getFileProcessor(upload.file);
    const data = await processor.parse(upload.file);
    
    // Simulate processing
    let processed = 0;
    let imported = 0;
    let failed = 0;
    
    for (const row of data) {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      processed++;
      
      // Simulate validation and import logic
      if (Math.random() > 0.1) { // 90% success rate
        imported++;
      } else {
        failed++;
      }
      
      // Update progress
      this.importJobs.update(current =>
        current.map(j =>
          j.id === job.id
            ? { 
                ...j, 
                recordsProcessed: processed,
                recordsImported: imported,
                recordsFailed: failed
              }
            : j
        )
      );
    }
  }

  private getFileProcessor(file: File): FileProcessor {
    const format = this.detectFormat(file);
    const processor = this.fileProcessors.get(format);
    if (!processor) {
      throw new Error(`Unsupported file format: ${format}`);
    }
    return processor;
  }

  private detectFormat(file: File): ImportFormat {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'csv': return 'csv';
      case 'json': return 'json';
      case 'xlsx': case 'xls': return 'xlsx';
      case 'xml': return 'xml';
      default: return 'csv';
    }
  }

  private async fetchDataForExport(entityType: ExportEntityType): Promise<any[]> {
    // Mock data generation
    switch (entityType) {
      case 'customers':
        return this.generateCustomerData();
      case 'tickets':
        return this.generateTicketData();
      case 'products':
        return this.generateProductData();
      default:
        return [];
    }
  }

  private generateCustomerData(): CustomerExportData[] {
    return Array.from({ length: 50 }, (_, i) => ({
      id: `CUST-${String(i + 1).padStart(3, '0')}`,
      name: `Cliente ${i + 1}`,
      email: `cliente${i + 1}@email.com`,
      phone: `+34 ${600 + i} ${String(Math.floor(Math.random() * 900) + 100)} ${String(Math.floor(Math.random() * 900) + 100)}`,
      company: `Empresa ${String.fromCharCode(65 + (i % 26))}`,
      address: `Calle ${i + 1}, Madrid`,
      createdAt: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      updatedAt: new Date(),
      totalTickets: Math.floor(Math.random() * 20) + 1,
      totalSpent: Math.floor(Math.random() * 5000) + 100,
      status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)]
    }));
  }

  private generateTicketData(): TicketExportData[] {
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const statuses = ['open', 'in_progress', 'resolved', 'closed'];
    const categories = ['hardware', 'software', 'network', 'maintenance'];
    
    return Array.from({ length: 100 }, (_, i) => ({
      id: `TICK-${String(i + 1).padStart(4, '0')}`,
      title: `Ticket de prueba ${i + 1}`,
      description: `Descripción del ticket ${i + 1}`,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      customerId: `CUST-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`,
      customerName: `Cliente ${Math.floor(Math.random() * 50) + 1}`,
      assignedTo: `Técnico ${Math.floor(Math.random() * 5) + 1}`,
      createdAt: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      updatedAt: new Date(),
      resolvedAt: Math.random() > 0.5 ? new Date() : undefined,
      timeToResolve: Math.floor(Math.random() * 72) + 1,
      satisfaction: Math.floor(Math.random() * 5) + 1
    }));
  }

  private generateProductData(): ProductExportData[] {
    const categories = ['Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse'];
    const brands = ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer'];
    
    return Array.from({ length: 30 }, (_, i) => ({
      id: `PROD-${String(i + 1).padStart(3, '0')}`,
      name: `Producto ${i + 1}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      brand: brands[Math.floor(Math.random() * brands.length)],
      model: `Model-${String.fromCharCode(65 + (i % 26))}${i + 1}`,
      price: Math.floor(Math.random() * 2000) + 100,
      stock: Math.floor(Math.random() * 100) + 1,
      description: `Descripción del producto ${i + 1}`,
      specifications: {
        weight: `${Math.floor(Math.random() * 5) + 1}kg`,
        warranty: `${Math.floor(Math.random() * 3) + 1} años`
      },
      createdAt: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      updatedAt: new Date()
    }));
  }

  private getDefaultFieldsForEntity(entityType: ExportEntityType) {
    // Return default fields based on entity type
    const fieldMappings: Record<ExportEntityType, any[]> = {
      customers: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'name', label: 'Nombre', type: 'string' as const, required: true },
        { key: 'email', label: 'Email', type: 'email' as const, required: true },
        { key: 'phone', label: 'Teléfono', type: 'phone' as const, required: false },
        { key: 'company', label: 'Empresa', type: 'string' as const, required: false }
      ],
      tickets: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'title', label: 'Título', type: 'string' as const, required: true },
        { key: 'priority', label: 'Prioridad', type: 'string' as const, required: true },
        { key: 'status', label: 'Estado', type: 'string' as const, required: true },
        { key: 'category', label: 'Categoría', type: 'string' as const, required: true }
      ],
      products: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'name', label: 'Nombre', type: 'string' as const, required: true },
        { key: 'category', label: 'Categoría', type: 'string' as const, required: true },
        { key: 'price', label: 'Precio', type: 'currency' as const, required: true },
        { key: 'stock', label: 'Stock', type: 'number' as const, required: true }
      ],
      works: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'title', label: 'Título', type: 'string' as const, required: true },
        { key: 'description', label: 'Descripción', type: 'string' as const, required: false },
        { key: 'status', label: 'Estado', type: 'string' as const, required: true }
      ],
      companies: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'name', label: 'Nombre', type: 'string' as const, required: true },
        { key: 'email', label: 'Email', type: 'email' as const, required: false },
        { key: 'phone', label: 'Teléfono', type: 'phone' as const, required: false }
      ],
      workflows: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'name', label: 'Nombre', type: 'string' as const, required: true },
        { key: 'enabled', label: 'Activo', type: 'boolean' as const, required: true },
        { key: 'category', label: 'Categoría', type: 'string' as const, required: true }
      ],
      notifications: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'title', label: 'Título', type: 'string' as const, required: true },
        { key: 'priority', label: 'Prioridad', type: 'string' as const, required: true },
        { key: 'createdAt', label: 'Fecha', type: 'datetime' as const, required: true }
      ],
      analytics: [
        { key: 'metric', label: 'Métrica', type: 'string' as const, required: true },
        { key: 'value', label: 'Valor', type: 'number' as const, required: true },
        { key: 'date', label: 'Fecha', type: 'date' as const, required: true }
      ]
    };

    return fieldMappings[entityType] || [];
  }

  private getPopularFormats() {
    const allJobs = [...this.exportJobs(), ...this.importJobs()];
    const formatCounts: Record<string, number> = {};
    
    allJobs.forEach(job => {
      const config = 'configId' in job 
        ? this.exportConfigs().find(c => c.id === job.configId)
        : undefined;
      
      if (config) {
        formatCounts[config.format] = (formatCounts[config.format] || 0) + 1;
      }
    });

    return Object.entries(formatCounts)
      .map(([format, count]) => ({ format: format as ExportFormat, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getFileExtension(job: ExportJob): string {
    const config = this.exportConfigs().find(c => c.id === job.configId);
    return config?.format || 'csv';
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('simplifica_export_configs', JSON.stringify(this.exportConfigs()));
      localStorage.setItem('simplifica_import_configs', JSON.stringify(this.importConfigs()));
      localStorage.setItem('simplifica_export_jobs', JSON.stringify(this.exportJobs()));
      localStorage.setItem('simplifica_import_jobs', JSON.stringify(this.importJobs()));
    } catch (error) {
      console.error('Error saving export/import data to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const exportConfigsData = localStorage.getItem('simplifica_export_configs');
      const importConfigsData = localStorage.getItem('simplifica_import_configs');
      const exportJobsData = localStorage.getItem('simplifica_export_jobs');
      const importJobsData = localStorage.getItem('simplifica_import_jobs');
      
      if (exportConfigsData) {
        const configs = JSON.parse(exportConfigsData).map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt)
        }));
        this.exportConfigs.set(configs);
      }
      
      if (importConfigsData) {
        const configs = JSON.parse(importConfigsData).map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt)
        }));
        this.importConfigs.set(configs);
      }

      if (exportJobsData) {
        const jobs = JSON.parse(exportJobsData).map((j: any) => ({
          ...j,
          startedAt: new Date(j.startedAt),
          completedAt: j.completedAt ? new Date(j.completedAt) : undefined
        }));
        this.exportJobs.set(jobs);
      }

      if (importJobsData) {
        const jobs = JSON.parse(importJobsData).map((j: any) => ({
          ...j,
          startedAt: new Date(j.startedAt),
          completedAt: j.completedAt ? new Date(j.completedAt) : undefined
        }));
        this.importJobs.set(jobs);
      }
    } catch (error) {
      console.error('Error loading export/import data from storage:', error);
    }
  }

  private initializeTemplates(): void {
    // Export templates
    const exportTemplates: ExportTemplate[] = [
      {
        id: 'customers-basic',
        name: 'Clientes - Básico',
        description: 'Exportación básica de datos de clientes',
        category: 'basic',
        entityType: 'customers',
        format: 'csv',
        fields: this.getDefaultFieldsForEntity('customers'),
        icon: 'bi-people',
        color: 'bg-blue-500',
        popularity: 95,
        tags: ['clientes', 'básico', 'csv']
      },
      {
        id: 'tickets-detailed',
        name: 'Tickets - Detallado',
        description: 'Exportación completa de tickets con todas las métricas',
        category: 'advanced',
        entityType: 'tickets',
        format: 'xlsx',
        fields: this.getDefaultFieldsForEntity('tickets'),
        icon: 'bi-ticket',
        color: 'bg-green-500',
        popularity: 88,
        tags: ['tickets', 'detallado', 'excel', 'métricas']
      },
      {
        id: 'products-inventory',
        name: 'Productos - Inventario',
        description: 'Exportación de productos para control de inventario',
        category: 'basic',
        entityType: 'products',
        format: 'csv',
        fields: this.getDefaultFieldsForEntity('products'),
        icon: 'bi-box',
        color: 'bg-purple-500',
        popularity: 72,
        tags: ['productos', 'inventario', 'stock']
      }
    ];

    // Import templates
    const importTemplates: ImportTemplate[] = [
      {
        id: 'customers-import',
        name: 'Importar Clientes',
        description: 'Plantilla para importar clientes desde CSV/Excel',
        category: 'basic',
        entityType: 'customers',
        format: 'csv',
        fieldMapping: [
          { sourceField: 'nombre', targetField: 'name', required: true },
          { sourceField: 'email', targetField: 'email', required: true },
          { sourceField: 'telefono', targetField: 'phone', required: false },
          { sourceField: 'empresa', targetField: 'company', required: false }
        ],
        validationRules: [
          {
            id: 'email-validation',
            field: 'email',
            type: 'email',
            message: 'Email debe tener formato válido',
            severity: 'error'
          },
          {
            id: 'name-required',
            field: 'name',
            type: 'required',
            message: 'Nombre es obligatorio',
            severity: 'error'
          }
        ],
        icon: 'bi-people-fill',
        color: 'bg-blue-500',
        popularity: 92,
        tags: ['clientes', 'importar', 'csv']
      },
      {
        id: 'products-bulk-import',
        name: 'Importación Masiva de Productos',
        description: 'Importar grandes lotes de productos con validaciones',
        category: 'advanced',
        entityType: 'products',
        format: 'xlsx',
        fieldMapping: [
          { sourceField: 'codigo', targetField: 'id', required: true },
          { sourceField: 'nombre', targetField: 'name', required: true },
          { sourceField: 'categoria', targetField: 'category', required: true },
          { sourceField: 'precio', targetField: 'price', required: true },
          { sourceField: 'stock', targetField: 'stock', required: true }
        ],
        validationRules: [
          {
            id: 'price-numeric',
            field: 'price',
            type: 'numeric',
            message: 'Precio debe ser un número',
            severity: 'error'
          },
          {
            id: 'stock-numeric',
            field: 'stock',
            type: 'numeric',
            message: 'Stock debe ser un número',
            severity: 'error'
          }
        ],
        icon: 'bi-box-seam',
        color: 'bg-purple-500',
        popularity: 76,
        tags: ['productos', 'masivo', 'excel', 'validación']
      }
    ];

    this.exportTemplates.set(exportTemplates);
    this.importTemplates.set(importTemplates);
  }

  private initializeFileProcessors(): void {
    // CSV Processor
    this.fileProcessors.set('csv', {
      format: 'csv',
      async parse(file: File): Promise<any[]> {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        return lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });
      },
      
      async generate(data: any[], config: ExportConfig): Promise<Blob> {
        const headers = config.fields.map(f => f.label).join(',');
        const rows = data.map(item => 
          config.fields.map(f => item[f.key] || '').join(',')
        );
        const csv = [headers, ...rows].join('\n');
        return new Blob([csv], { type: 'text/csv' });
      },
      
      async validate(file: File): Promise<ValidationResult[]> {
        // Basic validation
        return [];
      },
      
      async getPreview(file: File, rows: number = 10): Promise<ImportPreview> {
        const data = await this.parse(file);
        const preview = data.slice(0, rows);
        const headers = Object.keys(preview[0] || {});
        
        return {
          headers,
          data: preview.map(row => headers.map(h => row[h])),
          totalRows: data.length,
          detectedTypes: {},
          suggestedMappings: [],
          issues: []
        };
      }
    });

    // JSON Processor
    this.fileProcessors.set('json', {
      format: 'json',
      async parse(file: File): Promise<any[]> {
        const text = await file.text();
        const json = JSON.parse(text);
        return Array.isArray(json) ? json : [json];
      },
      
      async generate(data: any[], config: ExportConfig): Promise<Blob> {
        const json = JSON.stringify(data, null, 2);
        return new Blob([json], { type: 'application/json' });
      },
      
      async validate(file: File): Promise<ValidationResult[]> {
        try {
          await this.parse(file);
          return [];
        } catch (error) {
          return [{
            field: 'file',
            rule: 'valid_json',
            passed: false,
            message: 'Archivo JSON inválido'
          }];
        }
      },
      
      async getPreview(file: File, rows: number = 10): Promise<ImportPreview> {
        const data = await this.parse(file);
        const preview = data.slice(0, rows);
        const headers = Object.keys(preview[0] || {});
        
        return {
          headers,
          data: preview.map(row => headers.map(h => row[h])),
          totalRows: data.length,
          detectedTypes: {},
          suggestedMappings: [],
          issues: []
        };
      }
    });
  }

  private generateMockData(): void {
    // Generate some mock configurations and jobs if none exist
    if (this.exportConfigs().length === 0) {
      this.createExportConfig({
        name: 'Exportación Clientes Mensual',
        description: 'Exportación automática de clientes para reporte mensual',
        entityType: 'customers',
        format: 'xlsx',
        fields: this.getDefaultFieldsForEntity('customers'),
        createdBy: 'admin'
      });
    }
  }
}
