export interface ProjectStage {
    id: string;
    company_id: string;
    name: string;
    position: number;
    created_at?: string;
}

export interface ProjectTask {
    id: string;
    project_id: string;
    title: string;
    is_completed: boolean;
    due_date?: string;
    assigned_to?: string;
    position?: number;
    created_at?: string;
}

export interface Project {
    id: string;
    company_id: string;
    client_id?: string;
    stage_id?: string;
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    position: number;
    is_archived?: boolean;
    created_at?: string;
    updated_at?: string;

    // Relations (joined)
    client?: {
        id: string;
        name: string;
        apellidos?: string; // For individuals
        business_name?: string; // For companies
    };
    tasks?: ProjectTask[];

    // UI Helpers
    tasks_count?: number;
    completed_tasks_count?: number;
    unread_comments_count?: number;
}
