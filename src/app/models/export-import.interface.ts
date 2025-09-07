// Export/Import System Interfaces

export interface ExportConfig {
  id: string;
  name: string;
  description: string;
  entityType: ExportEntityType;
  format: ExportFormat;
  fields: ExportField[];
  filters?: ExportFilter[];
  transformations?: DataTransformation[];
  schedule?: ExportSchedule;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ImportConfig {
  id: string;
  name: string;
  description: string;
  entityType: ImportEntityType;
  format: ImportFormat;
  fieldMapping: FieldMapping[];
  validationRules: ValidationRule[];
  duplicateHandling: DuplicateHandling;
  batchSize: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ExportField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: any;
  transformation?: string;
  format?: string;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: DataTransformation;
  validation?: ValidationRule;
  required: boolean;
}

export interface ValidationRule {
  id: string;
  field: string;
  type: ValidationType;
  value?: any;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface DataTransformation {
  id: string;
  name: string;
  type: TransformationType;
  parameters: Record<string, any>;
  description: string;
}

export interface ExportFilter {
  field: string;
  operator: FilterOperator;
  value: any;
  type: FieldType;
}

export interface ExportSchedule {
  enabled: boolean;
  frequency: ScheduleFrequency;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone: string;
  nextRun?: Date;
  lastRun?: Date;
}

export interface ExportJob {
  id: string;
  configId: string;
  status: JobStatus;
  startedAt: Date;
  completedAt?: Date;
  recordsProcessed: number;
  recordsExported: number;
  fileSize?: number;
  filePath?: string;
  downloadUrl?: string;
  errors: JobError[];
  warnings: JobWarning[];
  metadata: Record<string, any>;
}

export interface ImportJob {
  id: string;
  configId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: JobStatus;
  startedAt: Date;
  completedAt?: Date;
  recordsProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: JobError[];
  warnings: JobWarning[];
  validationResults: ValidationResult[];
  previewData?: any[];
  metadata: Record<string, any>;
}

export interface JobError {
  id: string;
  row?: number;
  field?: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
  data?: any;
}

export interface JobWarning {
  id: string;
  row?: number;
  field?: string;
  message: string;
  code: string;
  data?: any;
}

export interface ValidationResult {
  field: string;
  rule: string;
  passed: boolean;
  message?: string;
  affectedRows?: number[];
}

export interface FileUpload {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  previewData?: any[];
  detectedFormat?: ImportFormat;
  detectedHeaders?: string[];
  estimatedRows?: number;
}

export interface DragDropZone {
  id: string;
  name: string;
  acceptedTypes: string[];
  maxFileSize: number;
  multiple: boolean;
  autoProcess: boolean;
  validationRules: FileValidationRule[];
}

export interface FileValidationRule {
  type: FileValidationType;
  value?: any;
  message: string;
}

export interface ImportPreview {
  headers: string[];
  data: any[][];
  totalRows: number;
  detectedTypes: Record<string, FieldType>;
  suggestedMappings: FieldMapping[];
  issues: PreviewIssue[];
}

export interface PreviewIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  row?: number;
  column?: string;
  suggestion?: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  entityType: ExportEntityType;
  format: ExportFormat;
  fields: ExportField[];
  filters?: ExportFilter[];
  icon: string;
  color: string;
  popularity: number;
  tags: string[];
}

export interface ImportTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  entityType: ImportEntityType;
  format: ImportFormat;
  fieldMapping: FieldMapping[];
  validationRules: ValidationRule[];
  icon: string;
  color: string;
  popularity: number;
  tags: string[];
  sampleFile?: string;
}

// Enums
export type ExportEntityType = 
  | 'customers' 
  | 'tickets' 
  | 'products' 
  | 'works' 
  | 'companies' 
  | 'workflows' 
  | 'notifications' 
  | 'analytics';

export type ImportEntityType = ExportEntityType;

export type ExportFormat = 'csv' | 'json' | 'xlsx' | 'xml' | 'pdf';

export type ImportFormat = 'csv' | 'json' | 'xlsx' | 'xml';

export type FieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'datetime' 
  | 'email' 
  | 'phone' 
  | 'url' 
  | 'currency' 
  | 'percentage'
  | 'array'
  | 'object';

export type ValidationType = 
  | 'required' 
  | 'email' 
  | 'phone' 
  | 'url' 
  | 'min_length' 
  | 'max_length' 
  | 'pattern' 
  | 'numeric' 
  | 'date' 
  | 'unique' 
  | 'exists'
  | 'custom';

export type TransformationType = 
  | 'uppercase' 
  | 'lowercase' 
  | 'trim' 
  | 'format_date' 
  | 'format_number' 
  | 'replace' 
  | 'substring' 
  | 'concatenate'
  | 'split'
  | 'custom';

export type FilterOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'starts_with' 
  | 'ends_with' 
  | 'greater_than' 
  | 'less_than' 
  | 'between' 
  | 'in' 
  | 'not_in'
  | 'is_null'
  | 'is_not_null';

export type ScheduleFrequency = 
  | 'daily' 
  | 'weekly' 
  | 'monthly' 
  | 'custom';

export type JobStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'paused';

export type UploadStatus = 
  | 'pending' 
  | 'uploading' 
  | 'processing' 
  | 'completed' 
  | 'failed';

export type DuplicateHandling = 
  | 'skip' 
  | 'overwrite' 
  | 'merge' 
  | 'create_new' 
  | 'ask_user';

export type FileValidationType = 
  | 'file_size' 
  | 'file_type' 
  | 'file_name' 
  | 'content_validation';

export type TemplateCategory = 
  | 'basic' 
  | 'advanced' 
  | 'custom' 
  | 'system' 
  | 'migration' 
  | 'backup';

// Data Structures for different entities
export interface CustomerExportData {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
  totalTickets: number;
  totalSpent: number;
  status: string;
}

export interface TicketExportData {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  customerId: string;
  customerName: string;
  assignedTo: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  timeToResolve?: number;
  satisfaction?: number;
}

export interface ProductExportData {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  price: number;
  stock: number;
  description: string;
  specifications: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Utility Types
export interface ExportStats {
  totalExports: number;
  totalImports: number;
  successRate: number;
  averageExportTime: number;
  averageImportTime: number;
  popularFormats: Array<{ format: ExportFormat; count: number }>;
  recentJobs: Array<ExportJob | ImportJob>;
}

export interface FileProcessor {
  format: ImportFormat | ExportFormat;
  parse(file: File): Promise<any[]>;
  generate(data: any[], config: ExportConfig): Promise<Blob>;
  validate(file: File): Promise<ValidationResult[]>;
  getPreview(file: File, rows?: number): Promise<ImportPreview>;
}
