export interface ProjectStage {
    id: string;
    company_id: string;
    name: string;
    position: number;
    is_review?: boolean;
    is_default?: boolean;
    is_landing?: boolean;
    is_final?: boolean;
    created_at?: string;
}

export interface ProjectPermissions {
    client_can_create_tasks: boolean;
    client_can_edit_tasks: boolean;
    client_can_delete_tasks: boolean;
    client_can_assign_tasks: boolean;
    client_can_complete_tasks: boolean;
    client_can_comment: boolean;
    client_can_view_all_comments: boolean;
    client_can_edit_project: boolean;
    client_can_move_stage: boolean;
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

export interface ProjectNotificationPreferences {
    id?: string;
    project_id: string;
    user_id?: string;
    client_id?: string;
    notify_on_new_task: boolean;
    notify_on_task_completed: boolean;
    notify_on_task_assigned: boolean;
    notify_on_new_comment: boolean;
    notify_on_project_update: boolean;
    notify_on_deadline_approaching: boolean;
    created_at?: string;
    updated_at?: string;
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
    is_internal_archived?: boolean; // New flag for admin archiving
    created_at?: string;
    updated_at?: string;
    permissions?: ProjectPermissions; // Joined from project_permissions table

    // Relations (joined)
    client?: {
        id: string;
        name: string;
        surname?: string; // For individuals
        business_name?: string; // For companies
        auth_user_id?: string;
    };
    tasks?: ProjectTask[];

    // UI Helpers
    tasks_count?: number;
    completed_tasks_count?: number;
    unread_comments_count?: number;
}
