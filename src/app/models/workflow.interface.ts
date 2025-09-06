// Workflow System Interfaces
export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay';
  position: { x: number; y: number };
  data: WorkflowNodeData;
  connections: string[]; // IDs of connected nodes
}

export interface WorkflowNodeData {
  title: string;
  description?: string;
  config: Record<string, any>;
  icon: string;
  color: string;
}

export interface WorkflowTrigger extends WorkflowNode {
  type: 'trigger';
  data: WorkflowNodeData & {
    triggerType: 'ticket_created' | 'ticket_updated' | 'customer_created' | 'time_based' | 'manual';
    conditions?: WorkflowCondition[];
  };
}

export interface WorkflowCondition extends WorkflowNode {
  type: 'condition';
  data: WorkflowNodeData & {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;
    trueConnection: string;
    falseConnection: string;
  };
}

export interface WorkflowAction extends WorkflowNode {
  type: 'action';
  data: WorkflowNodeData & {
    actionType: 'assign_user' | 'send_email' | 'create_notification' | 'update_field' | 'webhook' | 'escalate';
    parameters: Record<string, any>;
  };
}

export interface WorkflowDelay extends WorkflowNode {
  type: 'delay';
  data: WorkflowNodeData & {
    delayType: 'minutes' | 'hours' | 'days';
    duration: number;
  };
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  category: 'ticket_management' | 'customer_service' | 'maintenance' | 'escalation' | 'custom';
  nodes: WorkflowNode[];
  statistics: WorkflowStatistics;
}

export interface WorkflowStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecuted?: Date;
  executionHistory: WorkflowExecution[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  triggeredBy: string;
  context: Record<string, any>;
  steps: WorkflowExecutionStep[];
  error?: string;
}

export interface WorkflowExecutionStep {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: Workflow['category'];
  nodes: WorkflowNode[];
  preview: string; // Base64 image or SVG
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedSetupTime: number; // minutes
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object';
  defaultValue?: any;
  description: string;
  required: boolean;
}

// Node Library for Drag & Drop
export interface NodeLibraryItem {
  type: WorkflowNode['type'];
  category: 'triggers' | 'conditions' | 'actions' | 'utilities';
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, any>;
  configSchema: NodeConfigField[];
}

export interface NodeConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'textarea' | 'date';
  required: boolean;
  defaultValue?: any;
  options?: { value: any; label: string }[];
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}
