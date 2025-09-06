import { Injectable, signal, computed } from '@angular/core';
import {
  Workflow,
  WorkflowNode,
  WorkflowExecution,
  WorkflowTemplate,
  NodeLibraryItem,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowCondition
} from '../models/workflow.interface';

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  // Reactive state
  private workflows = signal<Workflow[]>([]);
  private executions = signal<WorkflowExecution[]>([]);
  private templates = signal<WorkflowTemplate[]>([]);
  private nodeLibrary = signal<NodeLibraryItem[]>([]);

  // Public readonly signals
  readonly workflows$ = this.workflows.asReadonly();
  readonly executions$ = this.executions.asReadonly();
  readonly templates$ = this.templates.asReadonly();
  readonly nodeLibrary$ = this.nodeLibrary.asReadonly();

  // Computed statistics
  readonly workflowStats = computed(() => {
    const allWorkflows = this.workflows();
    const allExecutions = this.executions();
    
    return {
      totalWorkflows: allWorkflows.length,
      activeWorkflows: allWorkflows.filter(w => w.enabled).length,
      totalExecutions: allExecutions.length,
      successRate: allExecutions.length > 0 
        ? (allExecutions.filter(e => e.status === 'completed').length / allExecutions.length) * 100 
        : 0,
      averageExecutionTime: allExecutions.length > 0
        ? allExecutions.reduce((acc, e) => {
            if (e.completedAt && e.startedAt) {
              return acc + (e.completedAt.getTime() - e.startedAt.getTime());
            }
            return acc;
          }, 0) / allExecutions.length
        : 0
    };
  });

  constructor() {
    this.initializeNodeLibrary();
    this.initializeTemplates();
    this.generateMockWorkflows();
    this.loadFromStorage();
  }

  // Workflow Management
  createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'statistics'>): string {
    const newWorkflow: Workflow = {
      ...workflow,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      statistics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        executionHistory: []
      }
    };

    this.workflows.update(current => [...current, newWorkflow]);
    this.saveToStorage();
    return newWorkflow.id;
  }

  updateWorkflow(id: string, updates: Partial<Workflow>): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === id
          ? { ...workflow, ...updates, updatedAt: new Date() }
          : workflow
      )
    );
    this.saveToStorage();
  }

  deleteWorkflow(id: string): void {
    this.workflows.update(current => current.filter(w => w.id !== id));
    this.saveToStorage();
  }

  toggleWorkflow(id: string): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === id
          ? { ...workflow, enabled: !workflow.enabled, updatedAt: new Date() }
          : workflow
      )
    );
    this.saveToStorage();
  }

  // Node Management
  addNodeToWorkflow(workflowId: string, node: WorkflowNode): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === workflowId
          ? { 
              ...workflow, 
              nodes: [...workflow.nodes, node],
              updatedAt: new Date()
            }
          : workflow
      )
    );
    this.saveToStorage();
  }

  updateNode(workflowId: string, nodeId: string, updates: Partial<WorkflowNode>): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === workflowId
          ? {
              ...workflow,
              nodes: workflow.nodes.map(node =>
                node.id === nodeId ? { ...node, ...updates } : node
              ),
              updatedAt: new Date()
            }
          : workflow
      )
    );
    this.saveToStorage();
  }

  removeNodeFromWorkflow(workflowId: string, nodeId: string): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === workflowId
          ? {
              ...workflow,
              nodes: workflow.nodes.filter(node => node.id !== nodeId),
              updatedAt: new Date()
            }
          : workflow
      )
    );
    this.saveToStorage();
  }

  connectNodes(workflowId: string, fromNodeId: string, toNodeId: string): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === workflowId
          ? {
              ...workflow,
              nodes: workflow.nodes.map(node =>
                node.id === fromNodeId
                  ? { ...node, connections: [...node.connections, toNodeId] }
                  : node
              ),
              updatedAt: new Date()
            }
          : workflow
      )
    );
    this.saveToStorage();
  }

  // Workflow Execution
  async executeWorkflow(workflowId: string, context: Record<string, any> = {}): Promise<string> {
    const workflow = this.workflows().find(w => w.id === workflowId);
    if (!workflow || !workflow.enabled) {
      throw new Error('Workflow not found or disabled');
    }

    const execution: WorkflowExecution = {
      id: this.generateId(),
      workflowId,
      status: 'running',
      startedAt: new Date(),
      triggeredBy: 'manual', // TODO: Get from context
      context,
      steps: []
    };

    this.executions.update(current => [...current, execution]);

    try {
      await this.runWorkflowNodes(workflow, execution);
      
      this.executions.update(current =>
        current.map(e =>
          e.id === execution.id
            ? { ...e, status: 'completed', completedAt: new Date() }
            : e
        )
      );

      // Update workflow statistics
      this.updateWorkflowStats(workflowId, true);

    } catch (error) {
      this.executions.update(current =>
        current.map(e =>
          e.id === execution.id
            ? { 
                ...e, 
                status: 'failed', 
                completedAt: new Date(),
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            : e
        )
      );

      this.updateWorkflowStats(workflowId, false);
      throw error;
    }

    return execution.id;
  }

  // Template Management
  createWorkflowFromTemplate(templateId: string, name: string): string {
    const template = this.templates().find(t => t.id === templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    return this.createWorkflow({
      name,
      description: `Created from template: ${template.name}`,
      enabled: false,
      createdBy: 'current_user',
      category: template.category,
      nodes: template.nodes.map(node => ({
        ...node,
        id: this.generateId() // Generate new IDs
      }))
    });
  }

  // Private methods
  private async runWorkflowNodes(workflow: Workflow, execution: WorkflowExecution): Promise<void> {
    // Find trigger nodes
    const triggerNodes = workflow.nodes.filter(node => node.type === 'trigger');
    
    for (const triggerNode of triggerNodes) {
      await this.executeNodeChain(workflow, triggerNode, execution, execution.context);
    }
  }

  private async executeNodeChain(
    workflow: Workflow, 
    currentNode: WorkflowNode, 
    execution: WorkflowExecution,
    context: Record<string, any>
  ): Promise<void> {
    // Execute current node
    const result = await this.executeNode(currentNode, context, execution);
    
    // If it's a condition node, follow the appropriate path
    if (currentNode.type === 'condition') {
      const config = currentNode.data.config as any;
      const nextNodeId = result.success ? config.trueConnection : config.falseConnection;
      
      if (nextNodeId) {
        const nextNode = workflow.nodes.find(n => n.id === nextNodeId);
        if (nextNode) {
          await this.executeNodeChain(workflow, nextNode, execution, { ...context, ...result.output });
        }
      }
    } else {
      // Execute all connected nodes
      for (const connectionId of currentNode.connections) {
        const nextNode = workflow.nodes.find(n => n.id === connectionId);
        if (nextNode) {
          await this.executeNodeChain(workflow, nextNode, execution, { ...context, ...result.output });
        }
      }
    }
  }

  private async executeNode(
    node: WorkflowNode, 
    context: Record<string, any>,
    execution: WorkflowExecution
  ): Promise<{ success: boolean; output: Record<string, any> }> {
    const step = {
      nodeId: node.id,
      status: 'running' as const,
      startedAt: new Date(),
      input: context
    };

    this.executions.update(current =>
      current.map(e =>
        e.id === execution.id
          ? { ...e, steps: [...e.steps, step] }
          : e
      )
    );

    try {
      let result: { success: boolean; output: Record<string, any> };

      switch (node.type) {
        case 'trigger':
          result = await this.executeTrigger(node as WorkflowTrigger, context);
          break;
        case 'condition':
          result = await this.executeCondition(node as WorkflowCondition, context);
          break;
        case 'action':
          result = await this.executeAction(node as WorkflowAction, context);
          break;
        case 'delay':
          result = await this.executeDelay(node, context);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Update step as completed
      this.executions.update(current =>
        current.map(e =>
          e.id === execution.id
            ? {
                ...e,
                steps: e.steps.map(s =>
                  s.nodeId === node.id
                    ? { ...s, status: 'completed', completedAt: new Date(), output: result.output }
                    : s
                )
              }
            : e
        )
      );

      return result;
    } catch (error) {
      // Update step as failed
      this.executions.update(current =>
        current.map(e =>
          e.id === execution.id
            ? {
                ...e,
                steps: e.steps.map(s =>
                  s.nodeId === node.id
                    ? { 
                        ...s, 
                        status: 'failed', 
                        completedAt: new Date(), 
                        error: error instanceof Error ? error.message : 'Unknown error'
                      }
                    : s
                )
              }
            : e
        )
      );

      throw error;
    }
  }

  private async executeTrigger(node: WorkflowTrigger, context: Record<string, any>): Promise<{ success: boolean; output: Record<string, any> }> {
    // Trigger execution logic
    return { success: true, output: { ...context, triggeredBy: node.data.triggerType } };
  }

  private async executeCondition(node: WorkflowCondition, context: Record<string, any>): Promise<{ success: boolean; output: Record<string, any> }> {
    const config = node.data.config as any;
    const { field, operator, value } = config;
    const fieldValue = context[field];
    
    let conditionMet = false;
    
    switch (operator) {
      case 'equals':
        conditionMet = fieldValue === value;
        break;
      case 'contains':
        conditionMet = String(fieldValue).includes(String(value));
        break;
      case 'greater_than':
        conditionMet = Number(fieldValue) > Number(value);
        break;
      case 'less_than':
        conditionMet = Number(fieldValue) < Number(value);
        break;
      case 'in':
        conditionMet = Array.isArray(value) && value.includes(fieldValue);
        break;
      case 'not_in':
        conditionMet = Array.isArray(value) && !value.includes(fieldValue);
        break;
    }
    
    return { success: conditionMet, output: { ...context, conditionResult: conditionMet } };
  }

  private async executeAction(node: WorkflowAction, context: Record<string, any>): Promise<{ success: boolean; output: Record<string, any> }> {
    const { actionType, parameters } = node.data;
    
    // Simulate action execution with delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = { success: true, output: { ...context } };
    
    switch (actionType) {
      case 'assign_user':
        result.output['assignedTo'] = parameters['userId'];
        console.log(`🎯 Action: Assigned to user ${parameters['userId']}`);
        break;
      case 'send_email':
        result.output['emailSent'] = true;
        console.log(`📧 Action: Email sent to ${parameters['to']}`);
        break;
      case 'create_notification':
        result.output['notificationCreated'] = true;
        console.log(`🔔 Action: Notification created: ${parameters['message']}`);
        break;
      case 'update_field':
        result.output[parameters['field']] = parameters['value'];
        console.log(`📝 Action: Updated ${parameters['field']} to ${parameters['value']}`);
        break;
      case 'escalate':
        result.output['escalated'] = true;
        result.output['escalationLevel'] = parameters['level'];
        console.log(`⚠️ Action: Escalated to level ${parameters['level']}`);
        break;
      case 'webhook':
        result.output['webhookCalled'] = true;
        console.log(`🌐 Action: Webhook called: ${parameters['url']}`);
        break;
    }
    
    return result;
  }

  private async executeDelay(node: WorkflowNode, context: Record<string, any>): Promise<{ success: boolean; output: Record<string, any> }> {
    const delayType = node.data.config?.['delayType'] || 'minutes';
    const duration = node.data.config?.['duration'] || 1;
    
    let delayMs = 0;
    switch (delayType) {
      case 'minutes':
        delayMs = duration * 60 * 1000;
        break;
      case 'hours':
        delayMs = duration * 60 * 60 * 1000;
        break;
      case 'days':
        delayMs = duration * 24 * 60 * 60 * 1000;
        break;
    }
    
    // For demo purposes, we'll use a shorter delay
    const actualDelay = Math.min(delayMs, 2000); // Max 2 seconds for demo
    await new Promise(resolve => setTimeout(resolve, actualDelay));
    
    return { success: true, output: { ...context, delayCompleted: true } };
  }

  private updateWorkflowStats(workflowId: string, success: boolean): void {
    this.workflows.update(current =>
      current.map(workflow =>
        workflow.id === workflowId
          ? {
              ...workflow,
              statistics: {
                ...workflow.statistics,
                totalExecutions: workflow.statistics.totalExecutions + 1,
                successfulExecutions: workflow.statistics.successfulExecutions + (success ? 1 : 0),
                failedExecutions: workflow.statistics.failedExecutions + (success ? 0 : 1),
                lastExecuted: new Date()
              }
            }
          : workflow
      )
    );
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('simplifica_workflows', JSON.stringify(this.workflows()));
      localStorage.setItem('simplifica_workflow_executions', JSON.stringify(this.executions()));
    } catch (error) {
      console.error('Error saving workflows to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const workflowsData = localStorage.getItem('simplifica_workflows');
      const executionsData = localStorage.getItem('simplifica_workflow_executions');
      
      if (workflowsData) {
        const workflows = JSON.parse(workflowsData).map((w: any) => ({
          ...w,
          createdAt: new Date(w.createdAt),
          updatedAt: new Date(w.updatedAt)
        }));
        this.workflows.set(workflows);
      }
      
      if (executionsData) {
        const executions = JSON.parse(executionsData).map((e: any) => ({
          ...e,
          startedAt: new Date(e.startedAt),
          completedAt: e.completedAt ? new Date(e.completedAt) : undefined
        }));
        this.executions.set(executions);
      }
    } catch (error) {
      console.error('Error loading workflows from storage:', error);
    }
  }

  private initializeNodeLibrary(): void {
    const library: NodeLibraryItem[] = [
      // Triggers
      {
        type: 'trigger',
        category: 'triggers',
        name: 'Nuevo Ticket',
        description: 'Se activa cuando se crea un ticket',
        icon: 'bi-plus-circle',
        color: 'bg-green-500',
        defaultConfig: { triggerType: 'ticket_created' },
        configSchema: []
      },
      {
        type: 'trigger',
        category: 'triggers',
        name: 'Ticket Actualizado',
        description: 'Se activa cuando se actualiza un ticket',
        icon: 'bi-arrow-repeat',
        color: 'bg-blue-500',
        defaultConfig: { triggerType: 'ticket_updated' },
        configSchema: []
      },
      {
        type: 'trigger',
        category: 'triggers',
        name: 'Programado',
        description: 'Se activa en horarios específicos',
        icon: 'bi-clock',
        color: 'bg-purple-500',
        defaultConfig: { triggerType: 'time_based' },
        configSchema: []
      },

      // Conditions
      {
        type: 'condition',
        category: 'conditions',
        name: 'Prioridad',
        description: 'Evalúa la prioridad del ticket',
        icon: 'bi-exclamation-triangle',
        color: 'bg-yellow-500',
        defaultConfig: { field: 'priority', operator: 'equals', value: 'high' },
        configSchema: [
          {
            key: 'field',
            label: 'Campo',
            type: 'select',
            required: true,
            options: [
              { value: 'priority', label: 'Prioridad' },
              { value: 'status', label: 'Estado' },
              { value: 'category', label: 'Categoría' }
            ]
          },
          {
            key: 'operator',
            label: 'Operador',
            type: 'select',
            required: true,
            options: [
              { value: 'equals', label: 'Igual a' },
              { value: 'contains', label: 'Contiene' },
              { value: 'greater_than', label: 'Mayor que' }
            ]
          },
          {
            key: 'value',
            label: 'Valor',
            type: 'text',
            required: true
          }
        ]
      },

      // Actions
      {
        type: 'action',
        category: 'actions',
        name: 'Asignar Técnico',
        description: 'Asigna el ticket a un técnico',
        icon: 'bi-person-check',
        color: 'bg-indigo-500',
        defaultConfig: { actionType: 'assign_user' },
        configSchema: [
          {
            key: 'userId',
            label: 'Técnico',
            type: 'select',
            required: true,
            options: [
              { value: 'tech1', label: 'Juan Pérez' },
              { value: 'tech2', label: 'María García' },
              { value: 'tech3', label: 'Carlos López' }
            ]
          }
        ]
      },
      {
        type: 'action',
        category: 'actions',
        name: 'Enviar Email',
        description: 'Envía un email automático',
        icon: 'bi-envelope',
        color: 'bg-red-500',
        defaultConfig: { actionType: 'send_email' },
        configSchema: [
          {
            key: 'to',
            label: 'Destinatario',
            type: 'text',
            required: true,
            placeholder: 'email@ejemplo.com'
          },
          {
            key: 'subject',
            label: 'Asunto',
            type: 'text',
            required: true
          },
          {
            key: 'template',
            label: 'Plantilla',
            type: 'select',
            required: true,
            options: [
              { value: 'ticket_assigned', label: 'Ticket Asignado' },
              { value: 'ticket_resolved', label: 'Ticket Resuelto' }
            ]
          }
        ]
      },
      {
        type: 'action',
        category: 'actions',
        name: 'Crear Notificación',
        description: 'Crea una notificación en el sistema',
        icon: 'bi-bell',
        color: 'bg-orange-500',
        defaultConfig: { actionType: 'create_notification' },
        configSchema: [
          {
            key: 'title',
            label: 'Título',
            type: 'text',
            required: true
          },
          {
            key: 'message',
            label: 'Mensaje',
            type: 'textarea',
            required: true
          },
          {
            key: 'priority',
            label: 'Prioridad',
            type: 'select',
            required: true,
            options: [
              { value: 'low', label: 'Baja' },
              { value: 'medium', label: 'Media' },
              { value: 'high', label: 'Alta' },
              { value: 'urgent', label: 'Urgente' }
            ]
          }
        ]
      },

      // Utilities
      {
        type: 'delay',
        category: 'utilities',
        name: 'Esperar',
        description: 'Pausa el workflow por un tiempo',
        icon: 'bi-hourglass',
        color: 'bg-gray-500',
        defaultConfig: { delayType: 'minutes', duration: 30 },
        configSchema: [
          {
            key: 'duration',
            label: 'Duración',
            type: 'number',
            required: true,
            validation: { min: 1, max: 999 }
          },
          {
            key: 'delayType',
            label: 'Unidad',
            type: 'select',
            required: true,
            options: [
              { value: 'minutes', label: 'Minutos' },
              { value: 'hours', label: 'Horas' },
              { value: 'days', label: 'Días' }
            ]
          }
        ]
      }
    ];

    this.nodeLibrary.set(library);
  }

  private initializeTemplates(): void {
    const templates: WorkflowTemplate[] = [
      {
        id: 'escalation-template',
        name: 'Escalación de Tickets Urgentes',
        description: 'Escala automáticamente tickets urgentes si no se resuelven en 2 horas',
        category: 'escalation',
        difficulty: 'beginner',
        estimatedSetupTime: 15,
        tags: ['escalación', 'urgente', 'automatización'],
        preview: '',
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            position: { x: 100, y: 100 },
            connections: ['condition-1'],
            data: {
              title: 'Nuevo Ticket',
              icon: 'bi-plus-circle',
              color: 'bg-green-500',
              config: { triggerType: 'ticket_created' }
            }
          },
          {
            id: 'condition-1',
            type: 'condition',
            position: { x: 300, y: 100 },
            connections: [],
            data: {
              title: 'Es Urgente?',
              icon: 'bi-exclamation-triangle',
              color: 'bg-yellow-500',
              config: { 
                field: 'priority', 
                operator: 'equals', 
                value: 'urgent',
                trueConnection: 'delay-1',
                falseConnection: ''
              }
            }
          },
          {
            id: 'delay-1',
            type: 'delay',
            position: { x: 500, y: 50 },
            connections: ['action-1'],
            data: {
              title: 'Esperar 2 horas',
              icon: 'bi-hourglass',
              color: 'bg-gray-500',
              config: { delayType: 'hours', duration: 2 }
            }
          },
          {
            id: 'action-1',
            type: 'action',
            position: { x: 700, y: 50 },
            connections: [],
            data: {
              title: 'Escalar a Supervisor',
              icon: 'bi-arrow-up-circle',
              color: 'bg-red-500',
              config: { 
                actionType: 'escalate',
                parameters: { level: 'supervisor', message: 'Ticket urgente sin resolver' }
              }
            }
          }
        ]
      },
      {
        id: 'assignment-template',
        name: 'Asignación Automática por Categoría',
        description: 'Asigna tickets automáticamente según su categoría',
        category: 'ticket_management',
        difficulty: 'beginner',
        estimatedSetupTime: 10,
        tags: ['asignación', 'categoría', 'automatización'],
        preview: '',
        nodes: [
          {
            id: 'trigger-2',
            type: 'trigger',
            position: { x: 100, y: 100 },
            connections: ['condition-2'],
            data: {
              title: 'Nuevo Ticket',
              icon: 'bi-plus-circle',
              color: 'bg-green-500',
              config: { triggerType: 'ticket_created' }
            }
          },
          {
            id: 'condition-2',
            type: 'condition',
            position: { x: 300, y: 100 },
            connections: [],
            data: {
              title: 'Categoría Hardware?',
              icon: 'bi-cpu',
              color: 'bg-blue-500',
              config: { 
                field: 'category', 
                operator: 'equals', 
                value: 'hardware',
                trueConnection: 'action-2',
                falseConnection: 'action-3'
              }
            }
          },
          {
            id: 'action-2',
            type: 'action',
            position: { x: 500, y: 50 },
            connections: [],
            data: {
              title: 'Asignar a Técnico Hardware',
              icon: 'bi-person-check',
              color: 'bg-indigo-500',
              config: { 
                actionType: 'assign_user',
                parameters: { userId: 'tech1' }
              }
            }
          },
          {
            id: 'action-3',
            type: 'action',
            position: { x: 500, y: 150 },
            connections: [],
            data: {
              title: 'Asignar a Técnico Software',
              icon: 'bi-person-check',
              color: 'bg-indigo-500',
              config: { 
                actionType: 'assign_user',
                parameters: { userId: 'tech2' }
              }
            }
          }
        ]
      }
    ];

    this.templates.set(templates);
  }

  private generateMockWorkflows(): void {
    if (this.workflows().length === 0) {
      // Create a sample workflow
      this.createWorkflow({
        name: 'Workflow de Ejemplo',
        description: 'Workflow de demostración con trigger, condición y acción',
        enabled: true,
        createdBy: 'admin',
        category: 'ticket_management',
        nodes: [
          {
            id: 'trigger-sample',
            type: 'trigger',
            position: { x: 100, y: 100 },
            connections: ['condition-sample'],
            data: {
              title: 'Nuevo Ticket',
              description: 'Se activa cuando se crea un nuevo ticket',
              icon: 'bi-plus-circle',
              color: 'bg-green-500',
              config: { triggerType: 'ticket_created' }
            }
          },
          {
            id: 'condition-sample',
            type: 'condition',
            position: { x: 350, y: 100 },
            connections: [],
            data: {
              title: 'Prioridad Alta?',
              description: 'Verifica si el ticket tiene prioridad alta',
              icon: 'bi-exclamation-triangle',
              color: 'bg-yellow-500',
              config: { 
                field: 'priority', 
                operator: 'equals', 
                value: 'high',
                trueConnection: 'action-sample',
                falseConnection: ''
              }
            }
          },
          {
            id: 'action-sample',
            type: 'action',
            position: { x: 600, y: 100 },
            connections: [],
            data: {
              title: 'Notificar Supervisor',
              description: 'Envía notificación al supervisor',
              icon: 'bi-bell',
              color: 'bg-orange-500',
              config: { 
                actionType: 'create_notification',
                parameters: {
                  title: 'Ticket de Alta Prioridad',
                  message: 'Se ha creado un ticket con prioridad alta',
                  priority: 'high'
                }
              }
            }
          }
        ]
      });
    }
  }
}
