export interface TableColumn<T = any> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  type?: 'text' | 'number' | 'date' | 'currency' | 'status' | 'actions';
  format?: (value: any) => string;
  render?: (value: any, row: T) => string;
}

export interface TableAction<T = any> {
  label: string;
  icon?: string;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  onClick: (row: T) => void;
  visible?: (row: T) => boolean;
}

export interface SortEvent {
  column: string;
  direction: 'asc' | 'desc' | null;
}

export interface FilterEvent {
  column: string;
  value: any;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'between';
}

export interface PaginationEvent {
  page: number;
  pageSize: number;
  total: number;
}
