import { Injectable, inject } from '@angular/core';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
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

    reorderStages(stages: { id: string; position: number }[]): Observable<void> {
        const updates = stages.map(s =>
            this.supabase
                .from('project_stages')
                .update({ position: s.position })
                .eq('id', s.id)
        );
        return from(Promise.all(updates)).pipe(map(results => {
            const err = results.find(r => r.error);
            if (err?.error) throw err.error;
        }));
    }

    setReviewStage(stageId: string, companyId: string): Observable<void> {
        // First clear any existing review stage for this company, then set the new one
        return from(
            this.supabase
                .from('project_stages')
                .update({ is_review: false })
                .eq('company_id', companyId)
                .then(() =>
                    this.supabase
                        .from('project_stages')
                        .update({ is_review: true })
                        .eq('id', stageId)
                )
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    setDefaultStage(stageId: string, companyId: string): Observable<void> {
        return from(
            this.supabase
                .from('project_stages')
                .update({ is_default: false })
                .eq('company_id', companyId)
                .then(() =>
                    this.supabase
                        .from('project_stages')
                        .update({ is_default: true })
                        .eq('id', stageId)
                )
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    setLandingStage(stageId: string, companyId: string): Observable<void> {
        return from(
            this.supabase
                .from('project_stages')
                .update({ is_landing: false })
                .eq('company_id', companyId)
                .then(() =>
                    this.supabase
                        .from('project_stages')
                        .update({ is_landing: true })
                        .eq('id', stageId)
                )
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
            const newProject = data as Project;
            this.logActivity(newProject.id, 'project_created');
            return newProject;
        }));
    }

    updateProject(id: string, updates: Partial<Project>): Observable<Project> {
        return from(
            (async (): Promise<Project> => {
                // 1. If stage_id is present, check if it actually changed
                let stageChangeDetails = null;
                if (updates.stage_id) {
                    const { data: currentProject } = await this.supabase
                        .from('projects')
                        .select('stage_id')
                        .eq('id', id)
                        .single();

                    if (currentProject && currentProject.stage_id !== updates.stage_id) {
                        // Fetch stage names for better logging
                        const { data: stages } = await this.supabase
                            .from('project_stages')
                            .select('id, name')
                            .in('id', [currentProject.stage_id, updates.stage_id]);

                        const fromStage = stages?.find(s => s.id === currentProject.stage_id)?.name;
                        const toStage = stages?.find(s => s.id === updates.stage_id)?.name;

                        stageChangeDetails = {
                            from_stage_id: currentProject.stage_id,
                            to_stage_id: updates.stage_id,
                            from_stage_name: fromStage || 'anterior',
                            to_stage_name: toStage || 'nueva'
                        };
                    }
                }

                // 2. Perform the update
                const { data, error } = await this.supabase
                    .from('projects')
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                const updatedProject = data as Project;

                // 3. Log activity
                if (stageChangeDetails) {
                    this.logActivity(id, 'project_stage_changed', stageChangeDetails);
                } else {
                    // Check if other meaningful fields changed (avoid logging if only position/updated_at changed)
                    const meaningfulFields = ['name', 'description', 'start_date', 'end_date', 'priority', 'client_id'];
                    const hasMeaningfulChanges = Object.keys(updates).some(key => meaningfulFields.includes(key));

                    if (hasMeaningfulChanges) {
                        this.logActivity(id, 'project_updated');
                    }
                }

                return updatedProject;
            })()
        );
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
            this.logActivity(id, 'project_archived');
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
            this.logActivity(id, 'project_restored');
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
            const newTask = data as ProjectTask;
            if (newTask.project_id) {
                this.logActivity(newTask.project_id, 'task_created', { task_id: newTask.id, task_title: newTask.title });
            }
            return newTask;
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
            const updatedTask = data as ProjectTask;

            if (updatedTask.project_id) {
                if (updates.is_completed === true) {
                    this.logActivity(updatedTask.project_id, 'task_completed', { task_id: updatedTask.id, task_title: updatedTask.title });
                } else if (updates.is_completed === false) {
                    this.logActivity(updatedTask.project_id, 'task_reopened', { task_id: updatedTask.id, task_title: updatedTask.title });
                } else if (updates.assigned_to) {
                    this.logActivity(updatedTask.project_id, 'task_assigned', { task_id: updatedTask.id, task_title: updatedTask.title, assigned_to: updates.assigned_to });
                }
            }

            return updatedTask;
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
        const toInsert = tasksToUpsert.filter(t => !t.id).map(t => ({ ...t, project_id: projectId }));
        const toUpdate = tasksToUpsert.filter(t => t.id);

        if (toInsert.length > 0) {
            operations.push(
                this.supabase.from('project_tasks').insert(toInsert)
            );
            // Log insertions
            toInsert.forEach(t => {
                this.logActivity(projectId, 'task_created', { task_title: t.title });
            });
        }

        // Updates
        toUpdate.forEach(t => {
            operations.push(
                this.supabase.from('project_tasks').update(t).eq('id', t.id!)
            );
            // Log completion or reopening if toggled
            if (t.is_completed === true) {
                this.logActivity(projectId, 'task_completed', { task_id: t.id, task_title: t.title });
            } else if (t.is_completed === false) {
                this.logActivity(projectId, 'task_reopened', { task_id: t.id, task_title: t.title });
            }
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

        // Log activity
        this.logActivity(projectId, 'comment_added', { comment_id: data.id, excerpt: content.substring(0, 50) });

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

    // ---- Project Activity / History ----

    async getProjectActivity(projectId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('project_activity')
            .select(`
                *,
                user:users!project_activity_user_id_fkey(id, name, surname, email),
                client:clients!project_activity_client_id_fkey(id, name, email, business_name)
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching project activity:', error);
            throw error;
        }
        return data || [];
    }

    async logActivity(projectId: string, activityType: string, details: any = {}): Promise<void> {
        const companyId = this.getCompanyId();
        const profile = this.authService.userProfile;

        const activityData: any = {
            project_id: projectId,
            company_id: companyId,
            activity_type: activityType,
            details
        };

        // Determine if user is a client or team member
        if (profile?.role === 'client') {
            // Find client_id from clients table
            const { data: clientData } = await this.supabase
                .from('clients')
                .select('id')
                .eq('auth_user_id', profile.auth_user_id)
                .single();
            if (clientData) {
                activityData.client_id = clientData.id;
            }
        } else if (profile) {
            // Team member - get user_id from users table
            const { data: userData } = await this.supabase
                .from('users')
                .select('id')
                .eq('auth_user_id', profile.auth_user_id)
                .single();
            if (userData) {
                activityData.user_id = userData.id;
            }
        }

        const { error } = await this.supabase
            .from('project_activity')
            .insert(activityData);

        if (error) {
            console.error('Error logging activity:', error);
            // Don't throw - activity logging is not critical
        }
    }

    subscribeToProjectActivity(projectId: string, callback: (payload: any) => void): RealtimeChannel {
        return this.supabase
            .channel(`project-activity-${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'project_activity',
                    filter: `project_id=eq.${projectId}`
                },
                async (payload) => {
                    // Enrich the payload with user/client info before sending to callback
                    const { data, error } = await this.supabase
                        .from('project_activity')
                        .select(`
                            *,
                            user:users!project_activity_user_id_fkey(id, name, surname, email),
                            client:clients!project_activity_client_id_fkey(id, name, email, business_name)
                        `)
                        .eq('id', payload.new['id'])
                        .single();

                    if (!error && data) {
                        callback(data);
                    }
                }
            )
            .subscribe();
    }
}
