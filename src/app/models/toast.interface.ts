export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number; // milliseconds or Infinity for persistent
  // Optional fields for richer UI and updates
  key?: string; // logical identifier to update the same toast across time
  progress?: number; // 0..1 progress indicator (optional)
}
