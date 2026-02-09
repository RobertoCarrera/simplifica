import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, map, switchMap } from 'rxjs';
import { Project, ProjectStage, ProjectTask } from '../../models/project';
import { SupabaseClientService } from '../../services/supabase-client.service';

import { AuthService } from '../../services/auth.service';

@Injectable({
    providedIn: 'root'
})
export class ProjectsService {
    private supabase: SupabaseClient;
    private sbService = inject(SupabaseClientService);
    private authService = inject(AuthService);

    constructor() {
        this.supabase = this.sbService.instance;
    }

    private getCompanyId(): string {
        const companyId = this.authService.currentCompanyId();
        console.log('[ProjectsService] Current Company ID:', companyId);
        if (!companyId) {
            console.error('[ProjectsService] No active company found');
            throw new Error('No active company found');
        }
        return companyId;
    }

    // --- Stages ---

    getStages(): Observable<ProjectStage[]> {
        return from(
            this.supabase
                .from('project_stages')
                .select('*')
                .order('position', { ascending: true })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectStage[];
        }));
    }

    createStage(stage: Partial<ProjectStage>): Observable<ProjectStage> {
        return from(
            this.supabase
                .from('project_stages')
                .insert({ ...stage, company_id: this.getCompanyId() })
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectStage;
        }));
    }

    updateStage(id: string, updates: Partial<ProjectStage>): Observable<ProjectStage> {
        return from(
            this.supabase
                .from('project_stages')
                .update(updates)
                .eq('id', id)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectStage;
        }));
    }

    deleteStage(id: string): Observable<void> {
        return from(
            this.supabase
                .from('project_stages')
                .delete()
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    // --- Projects ---

    getProjects(archived: boolean = false): Observable<Project[]> {
        return from(
            this.supabase
                .from('projects')
                .select(`
          *,
          permissions:project_permissions(*),
                client:client_id (id, name, apellidos, business_name, auth_user_id),
          tasks:project_tasks (id, is_completed, title, position)
        `)
                .eq('is_archived', archived)
                .eq('company_id', this.getCompanyId())
                .order('position', { ascending: true })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;

            return (data as any[]).map(p => {
                const tasks = (p.tasks || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
                // Map permissions: if array (unlikely with 1:1) take first, else take object, else default
                let perms = p.permissions;
                // If it came as array due to relationship definition (it is 1:1 but supabase might return array or object depending on relationship)
                if (Array.isArray(perms)) perms = perms[0];

                return {
                    ...p,
                    permissions: perms || {}, // Use empty object if null permissions (defaults handled in component or DB)
                    tasks,
                    tasks_count: tasks.length,
                    completed_tasks_count: tasks.filter((t: any) => t.is_completed).length
                };
            }) as Project[];
        }));
    }

    async getProjectById(id: string): Promise<Project | null> {
        const { data, error } = await this.supabase
            .from('projects')
            .select(`
                *,
                permissions:project_permissions(*),
                client:client_id (id, name, apellidos, business_name, auth_user_id),
                tasks:project_tasks (id, is_completed, title, position)
            `)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Error fetching project by id:', error);
            return null;
        }

        if (!data) return null;

        const p = data as any;
        const tasks = (p.tasks || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

        let perms = p.permissions;
        if (Array.isArray(perms)) perms = perms[0];

        return {
            ...p,
            permissions: perms || {},
            tasks,
            tasks_count: tasks.length,
            completed_tasks_count: tasks.filter((t: any) => t.is_completed).length
        } as Project;
    }

    createProject(project: Partial<Project>): Observable<Project> {
        return from(
            this.supabase
                .from('projects')
                .insert({ ...project, company_id: this.getCompanyId() })
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as Project;
        }));
    }

    updateProject(id: string, updates: Partial<Project>): Observable<Project> {
        return from(
            this.supabase
                .from('projects')
                .update(updates)
                .eq('id', id)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as Project;
        }));
    }

    deleteProject(id: string): Observable<void> {
        return from(
            this.supabase
                .from('projects')
                .delete()
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    archiveProject(id: string): Observable<void> {
        return from(
            this.supabase
                .from('projects')
                .update({ is_archived: true })
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    restoreProject(id: string): Observable<void> {
        return from(
            this.supabase
                .from('projects')
                .update({ is_archived: false })
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    // --- Tasks ---

    getTasks(projectId: string): Observable<ProjectTask[]> {
        return from(
            this.supabase
                .from('project_tasks')
                .select('*')
                .eq('project_id', projectId)
                .order('position', { ascending: true })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectTask[];
        }));
    }

    createTask(task: Partial<ProjectTask>): Observable<ProjectTask> {
        return from(
            this.supabase
                .from('project_tasks')
                .insert(task)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectTask;
        }));
    }

    updateTask(taskId: string, updates: Partial<ProjectTask>): Observable<ProjectTask> {
        return from(
            this.supabase
                .from('project_tasks')
                .update(updates)
                .eq('id', taskId)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectTask;
        }));
    }

    deleteTask(id: string): Observable<void> {
        return from(
            this.supabase
                .from('project_tasks')
                .delete()
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    manageTasks(projectId: string, tasksToUpsert: Partial<ProjectTask>[], taskIdsToDelete: string[]): Observable<any> {
        const operations = [];

        // Deletions
        if (taskIdsToDelete.length > 0) {
            operations.push(
                this.supabase
                    .from('project_tasks')
                    .delete()
                    .in('id', taskIdsToDelete)
            );
        }

        // Upserts (Insert or Update)
        // Note: Supabase 'upsert' works if we provide the ID. For new tasks without ID, we must 'insert'.
        // We can limit this to just inserts/updates loop or try to do bulk.
        // Mixed new/existing is tricky with bulk upsert if IDs are missing.
        // Safer to separate them or just iterate. for simplicity in this context, iteration is fine for small numbers.
        // Actually, let's group them.

        const toInsert = tasksToUpsert.filter(t => !t.id).map(t => ({ ...t, project_id: projectId }));
        const toUpdate = tasksToUpsert.filter(t => t.id);

        if (toInsert.length > 0) {
            operations.push(
                this.supabase.from('project_tasks').insert(toInsert)
            );
        }

        // Updates must be done one by one usually unless we use upsert with all fields.
        // Let's use loop for updates to be safe
        toUpdate.forEach(t => {
            operations.push(
                this.supabase.from('project_tasks').update(t).eq('id', t.id!)
            );
        });

        return from(Promise.all(operations)).pipe(
            map((results) => {
                const errors = results.filter(r => r.error);
                if (errors.length > 0) throw errors[0].error;
                return true;
            })
        );
    }

    // --- Comments ---

    async getComments(projectId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('project_comments')
            .select(`
                id,
                content,
                created_at,
                user_id,
                client_id,
                user:user_id (
                    email,
                    name,
                    surname
                ),
                client:client_id (
                    email,
                    name
                )
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async addComment(projectId: string, content: string): Promise<any> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Determine if user is internal or client
        // We'll try to find an internal user first
        const { data: internalUser } = await this.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        let payload: any = {
            project_id: projectId,
            content: content
        };

        if (internalUser) {
            payload.user_id = internalUser.id;
        } else {
            // Try to find a client
            const { data: clientUser } = await this.supabase
                .from('clients')
                .select('id')
                .eq('auth_user_id', user.id)
                .maybeSingle();

            if (clientUser) {
                payload.client_id = clientUser.id;
            } else {
                throw new Error('User profile not found');
            }
        }

        const { data, error } = await this.supabase
            .from('project_comments')
            .insert(payload)
            .select(`
                id,
                content,
                created_at,
                user_id,
                client_id,
                user:user_id (
                    email,
                    name,
                    surname
                ),
                client:client_id (
                    email,
                    name
                )
            `)
            .single();

        if (error) throw error;
        return data;
    }

    async markProjectAsRead(projectId: string): Promise<void> {
        const { error } = await this.supabase
            .rpc('mark_project_as_read', { p_project_id: projectId });

        if (error) console.error('Error marking project as read:', error);
    }

    async getUnreadCount(projectId: string): Promise<number> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return 0;

        // Determine identity
        const { data: internalUser } = await this.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        let lastReadAt = new Date(0).toISOString();
        let query = this.supabase.from('project_reads').select('last_read_at').eq('project_id', projectId);

        if (internalUser) {
            query = query.eq('user_id', internalUser.id);
        } else {
            const { data: clientUser } = await this.supabase
                .from('clients')
                .select('id')
                .eq('auth_user_id', user.id)
                .maybeSingle();
            if (clientUser) {
                query = query.eq('client_id', clientUser.id);
            } else {
                return 0;
            }
        }

        const { data: readData } = await query.maybeSingle();
        if (readData) {
            lastReadAt = readData.last_read_at;
        }

        const { count, error } = await this.supabase
            .from('project_comments')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .gt('created_at', lastReadAt);

        return count || 0;
    }

    async getCompanyMembers(): Promise<any[]> {
        const companyId = this.getCompanyId();
        const { data, error } = await this.supabase
            .from('users')
            .select('id, name, surname, email, auth_user_id')
            .eq('company_id', companyId);

        if (error) {
            console.error('Error fetching company members:', error);
            return [];
        }

        return (data || []).map((u: any) => ({
            ...u,
            displayName: u.name ? `${u.name} ${u.surnames || ''}`.trim() : u.email
        }));
    }

    async updateProjectPermissions(projectId: string, permissions: any): Promise<void> {
        // Upsert into project_permissions table
        const payload = {
            project_id: projectId,
            ...permissions
        };

        const { error } = await this.supabase
            .from('project_permissions')
            .upsert(payload, { onConflict: 'project_id' });

        if (error) {
            console.error('Error updating permissions:', error);
            throw error;
        }
    }

    async getNotificationPreferences(projectId: string): Promise<any> {
        try {
            const { data, error } = await this.supabase
                .from('project_notification_preferences')
                .select('*')
                .eq('project_id', projectId)
                .maybeSingle();

            if (error) {
                throw error;
            }
            return data;
        } catch (err) {
            console.error('Error fetching notification preferences:', err);
            return null;
        }
    }

    async updateNotificationPreferences(projectId: string, preferences: any): Promise<void> {
        try {
            // Get current user to determine if they are client or team member
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Check if user is a client
            const { data: clientData } = await this.supabase
                .from('clients')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            const isClient = !!clientData;

            const payload = {
                project_id: projectId,
                ...(isClient ? { client_id: clientData.id } : { user_id: user.id }),
                ...preferences
            };

            const { error } = await this.supabase
                .from('project_notification_preferences')
                .upsert(payload, {
                    onConflict: isClient ? 'project_id,client_id' : 'project_id,user_id'
                });

            if (error) throw error;
        } catch (err) {
            console.error('Error updating notification preferences:', err);
            throw err;
        }
    }
}
