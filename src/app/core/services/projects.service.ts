import { Injectable, inject } from '@angular/core';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Observable, from, map, switchMap, of } from 'rxjs';
import { Project, ProjectStage, ProjectTask, ProjectSubtask, ProjectSubtaskJustification, ProjectTaskDocument, ProjectPermissions } from '../../models/project';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { validateUploadFile } from '../utils/upload-validator';

import { AuthService } from '../../services/auth.service';

@Injectable({
    providedIn: 'root'
})
export class ProjectsService {
    private supabase: SupabaseClient;
    private sbService = inject(SupabaseClientService);
    private authService = inject(AuthService);
    private modulesService = inject(SupabaseModulesService);

    constructor() {
        this.supabase = this.sbService.instance;
    }

    getSupabaseClient(): SupabaseClient {
        return this.supabase;
    }

    private getCompanyId(): string {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) {
            console.error('[ProjectsService] No active company found');
            throw new Error('No active company found');
        }
        return companyId;
    }

    /**
     * Returns true if the current user is a client AND the Proyectos module is active
     * for their company. When true, project queries should be filtered to only show
     * projects assigned to this client.
     */
    private shouldApplyClientFilter(): boolean {
        const role = this.authService.userRole();
        if (role !== 'client') return false;
        const moduleEnabled = this.modulesService.isModuleEnabled('moduloProyectos');
        return moduleEnabled === true;
    }

    /**
     * Returns the client_id for the current client user, or null if not a client.
     */
    private getClientId(): string | null {
        return this.authService.userProfileSignal()?.client_id || null;
    }

    // --- Stages ---

    getStages(): Observable<ProjectStage[]> {
        return from(
            this.supabase
                .from('project_stages')
                .select('*')
                .order('position', { ascending: true })
                .limit(200)
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

    /**
     * Single-statement reorder for projects. Replaces the previous N+1
     * pattern that fired one update per project on every kanban drop.
     * Backed by migration 20260622130002_reorder_projects_rpc.sql.
     */
    reorderProjects(orderedIds: string[]): Observable<number> {
        if (!orderedIds.length) return from(Promise.resolve(0));
        return from(
            this.supabase.rpc('reorder_projects', {
                p_company_id: this.getCompanyId(),
                p_ordered_ids: orderedIds,
            })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return (data as number) || 0;
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

    setFinalStage(stageId: string, companyId: string): Observable<void> {
        return from(
            // 1. Unset any existing final stage
            this.supabase
                .from('project_stages')
                .update({ is_final: false })
                .eq('company_id', companyId)
                .is('is_final', true)
        ).pipe(
            switchMap(() => {
                // 2. Set new final stage
                return from(
                    this.supabase
                        .from('project_stages')
                        .update({ is_final: true })
                        .eq('id', stageId)
                );
            }),
            map(({ error }) => {
                if (error) throw error;
            })
        );
    }

    async getFinalStageId(companyId: string): Promise<string | null> {
        const { data, error } = await this.supabase
            .from('project_stages')
            .select('id')
            .eq('company_id', companyId)
            .eq('is_final', true)
            .maybeSingle();

        if (error) {
            console.error('Error getting final stage:', error);
            return null;
        }
        return data?.id || null;
    }

    // --- Projects ---

    getProjects(archived: boolean = false, includeHidden: boolean = false): Observable<Project[]> {
        const companyId = this.getCompanyId();

        // If user is a client with active Proyectos module, restrict to assigned projects only
        if (this.shouldApplyClientFilter()) {
            const clientId = this.getClientId();
            if (!clientId) {
                // Client user with no client_id — no projects to show
                return of([]);
            }
            return from(
                this.supabase
                    .from('projects')
                    .select(`
          *,
          permissions:project_permissions(*),
          client:client_id (id, name, surname, business_name, auth_user_id),
          tasks:project_tasks (id, is_completed, title, position)
        `)
                    .eq('is_archived', archived)
                    .eq('company_id', companyId)
                    .eq('client_id', clientId)
                    .order('position', { ascending: true })
                    .limit(500)
            ).pipe(map(({ data, error }) => {
                if (error) throw error;
                return this.mapProjects(data || []);
            }));
        }

        return from(
            this.supabase
                .from('projects')
                .select(`
          *,
          permissions:project_permissions(*),
          client:client_id (id, name, surname, business_name, auth_user_id),
          tasks:project_tasks (id, is_completed, title, position)
        `)
                .eq('is_archived', archived)
                .eq('company_id', companyId)
                .order('position', { ascending: true })
                .limit(500)
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return this.mapProjects((data || []) as any[], archived, includeHidden);
        }));
    }

    /**
     * Maps raw Supabase project data to Project[] with computed fields
     * and applies is_internal_archived filtering for non-clients.
     */
    private mapProjects(data: any[], archived: boolean = false, includeHidden: boolean = false): Project[] {
        let projects = data.map(p => {
            const tasks = (p.tasks || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
            let perms = p.permissions;
            if (Array.isArray(perms)) perms = perms[0];

            return {
                ...p,
                permissions: perms || {},
                tasks,
                tasks_count: tasks.length,
                completed_tasks_count: tasks.filter((t: any) => t.is_completed).length
            };
        }) as Project[];

        // Filter out internally archived projects for non-clients (unless viewing archived)
        const userRole = this.authService.userRole();
        if (userRole !== 'client' && !archived) {
            if (!includeHidden) {
                projects = projects.filter(p => !p.is_internal_archived);
            }
        }

        return projects;
    }

    async getProjectById(id: string): Promise<Project | null> {
        const { data, error } = await this.supabase
            .from('projects')
            .select(`
                *,
                permissions:project_permissions(*),
                client:client_id (id, name, surname, business_name, auth_user_id),
                tasks:project_tasks (id, is_completed, title, position)
            `)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Error fetching project by id:', error);
            return null;
        }

        if (!data) return null;

        // Client access control: verify the project belongs to this client
        if (this.shouldApplyClientFilter()) {
            const clientId = this.getClientId();
            if (!clientId || (data as any).client_id !== clientId) {
                console.warn('[ProjectsService] Client attempted to access unassigned project:', id);
                return null;
            }
        }

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
        const companyId = this.getCompanyId();
        return from(
            (async (): Promise<Project> => {
                // 1. Create the project
                const { data, error } = await this.supabase
                    .from('projects')
                    .insert({ ...project, company_id: companyId })
                    .select()
                    .single();

                if (error) throw error;
                const newProject = data as Project;

                // 2. Clone global permissions template into project_permissions
                const template = await this.getProjectPermissionTemplate();
                if (template) {
                    const { error: permError } = await this.supabase
                        .from('project_permissions')
                        .upsert({
                            project_id: newProject.id,
                            client_can_create_tasks: template.client_can_create_tasks,
                            client_can_edit_tasks: template.client_can_edit_tasks,
                            client_can_delete_tasks: template.client_can_delete_tasks,
                            client_can_assign_tasks: template.client_can_assign_tasks,
                            client_can_complete_tasks: template.client_can_complete_tasks,
                            client_can_comment: template.client_can_comment,
                            client_can_view_all_comments: template.client_can_view_all_comments,
                            client_can_edit_project: template.client_can_edit_project,
                            client_can_move_stage: template.client_can_move_stage,
                        }, { onConflict: 'project_id' });

                    if (permError) {
                        console.error('Error cloning permissions template:', permError);
                        // Non-blocking: project is created, permissions will use defaults
                    } else {
                        // Attach permissions to returned project
                        newProject.permissions = template;
                    }
                }

                this.logActivity(newProject.id, 'project_created');
                return newProject;
            })()
        );
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
                    const meaningfulFields = ['name', 'description', 'start_date', 'end_date', 'priority', 'client_id', 'assigned_to'];
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

    archiveProjectInternal(id: string): Observable<void> {
        return from(
            this.supabase
                .from('projects')
                .update({ is_internal_archived: true })
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
            this.logActivity(id, 'project_admin_archived');
        }));
    }

    restoreProjectInternal(id: string): Observable<void> {
        return from(
            this.supabase
                .from('projects')
                .update({ is_internal_archived: false })
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
            this.logActivity(id, 'project_admin_restored');
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

    // --- Company Members for project assignment ---
    getCompanyMembers(): Observable<{ user_id: string; full_name: string; email: string; role: string }[]> {
        return from(
            this.supabase
                .rpc('list_company_members', { p_company_id: this.getCompanyId() })
                .then(({ data, error }) => {
                    if (error) throw error;
                    // RPC returns { success: boolean, users: [...] }
                    const obj = data as any;
                    if (!obj || !obj.success) {
                        console.warn('list_company_members returned unsuccessfully:', obj);
                        return [];
                    }
                    const users = obj.users || [];
                    return users.map((u: any) => ({
                        user_id: u.id,
                        full_name: u.name || u.email,
                        email: u.email,
                        role: u.role,
                    }));
                })
        );
    }

    // --- Project associable_to setting ---
    async getProjectAssociableTo(): Promise<string> {
        const { data, error } = await this.supabase
            .from('company_settings')
            .select('project_associable_to')
            .eq('company_id', this.getCompanyId())
            .maybeSingle();

        if (error) {
            console.warn('Error fetching project_associable_to, defaulting to clients:', error);
            return 'clients';
        }
        return data?.project_associable_to || 'clients';
    }

    // --- Tasks ---

    getTasks(projectId: string): Observable<ProjectTask[]> {
        return from(
            this.supabase
                .from('project_tasks')
                .select('id, project_id, title, description, is_completed, due_date, assigned_to, position, created_at, updated_at')
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

    // --- Subtasks ---

    getSubtasks(taskId: string): Observable<ProjectSubtask[]> {
        return from(
            this.supabase
                .from('project_subtasks')
                .select('id, task_id, title, description, start_date, due_date, is_completed, assigned_to, position, created_at, updated_at')
                .eq('task_id', taskId)
                .order('position', { ascending: true })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectSubtask[];
        }));
    }

    createSubtask(subtask: Partial<ProjectSubtask>): Observable<ProjectSubtask> {
        return from(
            this.supabase
                .from('project_subtasks')
                .insert(subtask)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectSubtask;
        }));
    }

    updateSubtask(id: string, updates: Partial<ProjectSubtask>): Observable<ProjectSubtask> {
        return from(
            this.supabase
                .from('project_subtasks')
                .update(updates)
                .eq('id', id)
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectSubtask;
        }));
    }

    deleteSubtask(id: string): Observable<void> {
        return from(
            this.supabase
                .from('project_subtasks')
                .delete()
                .eq('id', id)
        ).pipe(map(({ error }) => {
            if (error) throw error;
        }));
    }

    manageSubtasks(taskId: string, subtasksToUpsert: Partial<ProjectSubtask>[], subtaskIdsToDelete: string[]): Observable<any> {
        const operations = [];

        // Deletions
        if (subtaskIdsToDelete.length > 0) {
            operations.push(
                this.supabase
                    .from('project_subtasks')
                    .delete()
                    .in('id', subtaskIdsToDelete)
            );
        }

        // Insertions
        const toInsert = subtasksToUpsert.filter(s => !s.id).map(s => ({ ...s, task_id: taskId }));
        const toUpdate = subtasksToUpsert.filter(s => s.id);

        if (toInsert.length > 0) {
            operations.push(
                this.supabase.from('project_subtasks').insert(toInsert)
            );
        }

        // Updates
        toUpdate.forEach(s => {
            operations.push(
                this.supabase.from('project_subtasks').update(s).eq('id', s.id!)
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

    getSubtaskJustifications(subtaskId: string): Observable<ProjectSubtaskJustification[]> {
        return from(
            this.supabase
                .from('project_subtask_overdue_justifications')
                .select('id, subtask_id, justification, new_due_date, created_by, created_at')
                .eq('subtask_id', subtaskId)
                .order('created_at', { ascending: false })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectSubtaskJustification[];
        }));
    }

    addSubtaskJustification(subtaskId: string, justification: string, newDueDate: string): Observable<ProjectSubtaskJustification> {
        return from(
            this.supabase
                .from('project_subtask_overdue_justifications')
                .insert({
                    subtask_id: subtaskId,
                    justification,
                    new_due_date: newDueDate
                })
                .select()
                .single()
        ).pipe(map(({ data, error }) => {
            if (error) throw error;
            return data as ProjectSubtaskJustification;
        }));
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
            .order('created_at', { ascending: true })
            .limit(500);

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

        const payload: any = {
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
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .gt('created_at', lastReadAt);

        if (error) {
            // count=exact can fail under RLS for HEAD requests; fall back to
            // a non-counting select and count in JS. This path is rare
            // (now backed by idx_project_comments_project_created).
            const { data } = await this.supabase
                .from('project_comments')
                .select('id')
                .eq('project_id', projectId)
                .gt('created_at', lastReadAt)
                .limit(1000);
            return data?.length || 0;
        }
        return count || 0;
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

    /**
     * Get the global project permission template for the current company.
     * Returns default values if no template has been saved yet.
     */
    async getProjectPermissionTemplate(): Promise<ProjectPermissions> {
        const companyId = this.getCompanyId();

        const { data, error } = await this.supabase
            .from('project_permission_templates')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching project permission template:', error);
            throw error;
        }

        // Return stored template or sensible defaults
        return data ? {
            client_can_create_tasks: data.client_can_create_tasks ?? false,
            client_can_edit_tasks: data.client_can_edit_tasks ?? false,
            client_can_delete_tasks: data.client_can_delete_tasks ?? false,
            client_can_assign_tasks: data.client_can_assign_tasks ?? false,
            client_can_complete_tasks: data.client_can_complete_tasks ?? false,
            client_can_comment: data.client_can_comment ?? true,
            client_can_view_all_comments: data.client_can_view_all_comments ?? true,
            client_can_edit_project: data.client_can_edit_project ?? false,
            client_can_move_stage: data.client_can_move_stage ?? false,
        } : {
            client_can_create_tasks: false,
            client_can_edit_tasks: false,
            client_can_delete_tasks: false,
            client_can_assign_tasks: false,
            client_can_complete_tasks: false,
            client_can_comment: true,
            client_can_view_all_comments: true,
            client_can_edit_project: false,
            client_can_move_stage: false,
        };
    }

    /**
     * Save the global project permission template for the current company.
     */
    async saveProjectPermissionTemplate(permissions: ProjectPermissions): Promise<void> {
        const companyId = this.getCompanyId();

        const { error } = await this.supabase
            .from('project_permission_templates')
            .upsert({
                company_id: companyId,
                ...permissions,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'company_id',
            });

        if (error) {
            console.error('Error saving project permission template:', error);
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

    // --- Project Files ---

    async getProjectFiles(projectId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('project_files')
            .select('id, project_id, name, file_path, file_type, size, is_folder, parent_id, created_at, created_by')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Error fetching project files:', error);
            throw error;
        }
        return data || [];
    }

    async uploadProjectFile(projectId: string, file: File, parentId: string | null = null): Promise<any> {
        const check = validateUploadFile(file);
        if (!check.valid) throw new Error(check.error);

        const companyId = this.getCompanyId();
        const fileExt = file.name.split('.').pop();
        // Path: {company_id}/{project_id}/{timestamp}_{uuid}.{ext}
        const fileName = `${companyId}/${projectId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${fileExt}`;
        const filePath = fileName;

        // 1. Upload to Storage
        const { error: uploadError } = await this.supabase.storage
            .from('project-files')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading file to storage:', uploadError);
            throw uploadError;
        }

        // 2. Insert into DB
        const { data, error: dbError } = await this.supabase
            .from('project_files')
            .insert({
                project_id: projectId,
                name: file.name,
                file_path: filePath,
                file_type: file.type,
                size: file.size,
                created_by: this.authService.currentUser?.id, // Optional, dependent on RLS/Auth setup
                parent_id: parentId
            })
            .select()
            .single();

        if (dbError) {
            console.error('Error saving file metadata:', dbError);
            // Optional: Cleanup storage if DB insert fails
            await this.supabase.storage.from('project-files').remove([filePath]);
            throw dbError;
        }

        return data;
    }

    async deleteProjectFile(fileId: string, filePath: string): Promise<void> {
        // 1. Delete from Storage (if path exists)
        if (filePath) {
            const { error: storageError } = await this.supabase.storage
                .from('project-files')
                .remove([filePath]);

            if (storageError) {
                console.error('Error deleting file from storage:', storageError);
                // Proceed to delete from DB anyway to keep consistent state? Or throw?
                // Usually better to throw or warn.
            }
        }

        // 2. Delete from DB
        const { error: dbError } = await this.supabase
            .from('project_files')
            .delete()
            .eq('id', fileId);

        if (dbError) {
            console.error('Error deleting file metadata:', dbError);
            throw dbError;
        }
    }

    async renameProjectFile(fileId: string, newName: string): Promise<void> {
        const { error } = await this.supabase
            .from('project_files')
            .update({ name: newName })
            .eq('id', fileId);

        if (error) {
            console.error('Error renaming file:', error);
            throw error;
        }
    }

    async moveProjectFile(fileId: string, newParentId: string | null): Promise<void> {
        const { error } = await this.supabase
            .from('project_files')
            .update({ parent_id: newParentId })
            .eq('id', fileId);

        if (error) {
            console.error('Error moving file:', error);
            throw error;
        }
    }

    async getFileUrl(filePath: string): Promise<string | null> {
        const { data } = await this.supabase.storage
            .from('project-files')
            .createSignedUrl(filePath, 3600); // 1 hour expiry

        return data?.signedUrl || null;
    }
    async createProjectFolder(projectId: string, name: string, parentId: string | null = null): Promise<any> {
        const { data, error } = await this.supabase
            .from('project_files')
            .insert({
                project_id: projectId,
                name: name,
                file_path: '', // No physical path for folders
                is_folder: true,
                parent_id: parentId,
                created_by: this.authService.currentUser?.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
        return data;
    }

    // --- Task Documents (Budget/Invoice associations) ---

    /**
     * Get all documents associated with a task
     */
    async getTaskDocuments(taskId: string): Promise<ProjectTaskDocument[]> {
        // 1. Get associations
        const { data: links, error } = await this.supabase
            .from('project_task_documents')
            .select('id, task_id, document_id, document_type, created_at, created_by')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching task documents:', error);
            throw error;
        }
        if (!links || links.length === 0) return [];

        // 2. Split by type
        const budgetIds = links.filter(l => l.document_type === 'budget').map(l => l.document_id);
        const invoiceIds = links.filter(l => l.document_type === 'invoice').map(l => l.document_id);

        // 3. Fetch document details in parallel
        const [budgetsRes, invoicesRes] = await Promise.all([
            budgetIds.length > 0
                ? this.supabase.from('quotes').select('id, full_quote_number, title, total_amount, status').in('id', budgetIds)
                : Promise.resolve({ data: [] as any[], error: null }),
            invoiceIds.length > 0
                ? this.supabase.from('invoices').select('id, full_invoice_number, invoice_series, invoice_number, total, status, invoice_date').in('id', invoiceIds)
                : Promise.resolve({ data: [] as any[], error: null }),
        ]);

        // 4. Build lookup maps
        const budgetMap = new Map((budgetsRes.data || []).map((b: any) => [b.id, b]));
        const invoiceMap = new Map((invoicesRes.data || []).map((i: any) => [i.id, i]));

        // 5. Merge
        return links.map(link => ({
            ...link,
            document: link.document_type === 'budget'
                ? budgetMap.get(link.document_id) || null
                : invoiceMap.get(link.document_id) || null,
        })) as ProjectTaskDocument[];
    }

    /**
     * Associate a document (budget/invoice) with a task
     */
    async associateTaskDocument(
        taskId: string,
        documentId: string,
        documentType: 'budget' | 'invoice'
    ): Promise<ProjectTaskDocument> {
        const { data, error } = await this.supabase
            .from('project_task_documents')
            .insert({
                task_id: taskId,
                document_id: documentId,
                document_type: documentType
            })
            .select()
            .single();

        if (error) {
            console.error('Error associating document to task:', error);
            throw error;
        }
        return data as ProjectTaskDocument;
    }

    /**
     * Remove a document association from a task
     */
    async removeTaskDocument(documentId: string, documentType: 'budget' | 'invoice', taskId: string): Promise<void> {
        const { error } = await this.supabase
            .from('project_task_documents')
            .delete()
            .eq('task_id', taskId)
            .eq('document_id', documentId)
            .eq('document_type', documentType);

        if (error) {
            console.error('Error removing task document:', error);
            throw error;
        }
    }

    /**
     * Get quotes (presupuestos) that can be associated to a task
     * Filters by the project's company and client (if set)
     */
    async getAvailableQuotesForTask(projectId: string): Promise<any[]> {
        // First get the project to know the company and client
        const { data: project } = await this.supabase
            .from('projects')
            .select('company_id, client_id')
            .eq('id', projectId)
            .single();

        if (!project) return [];

        let query = this.supabase
            .from('quotes')
            .select('id, full_quote_number, title, status, total_amount, client_id, quote_date')
            .eq('company_id', project.company_id)
            .order('created_at', { ascending: false })
            .limit(200);

        if (project.client_id) {
            query = query.eq('client_id', project.client_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    /**
     * Get invoices (facturas) that can be associated to a task
     * Filters by the project's company and client (if set)
     */
    async getAvailableInvoicesForTask(projectId: string): Promise<any[]> {
        const { data: project } = await this.supabase
            .from('projects')
            .select('company_id, client_id')
            .eq('id', projectId)
            .single();

        if (!project) return [];

        let query = this.supabase
            .from('invoices')
            .select('id, full_invoice_number, invoice_series, invoice_number, status, total, client_id, invoice_date')
            .eq('company_id', project.company_id)
            .order('created_at', { ascending: false })
            .limit(200);

        if (project.client_id) {
            query = query.eq('client_id', project.client_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    /**
     * Get tasks associated with a document (reverse lookup)
     * Returns tasks with their project info for display in quote/invoice detail
     */
    async getTasksForDocument(documentId: string, documentType: 'budget' | 'invoice'): Promise<any[]> {
        const { data, error } = await this.supabase
            .from('project_task_documents')
            .select(`
                task_id,
                project_tasks!inner (
                    id,
                    title,
                    project_id,
                    projects!inner (
                        id,
                        name
                    )
                )
            `)
            .eq('document_id', documentId)
            .eq('document_type', documentType);

        if (error) {
            console.error('Error fetching tasks for document:', error);
            throw error;
        }
        return (data || []).map((row: any) => ({
            task_id: row.task_id,
            task_title: row.project_tasks?.title || 'Sin título',
            project_id: row.project_tasks?.project_id,
            project_name: row.project_tasks?.projects?.name || 'Sin proyecto',
        }));
    }

    /**
     * Get document IDs associated with tasks in a project
     * Used for filtering quote/invoice lists by project
     */
    async getDocumentIdsForProject(projectId: string, documentType: 'budget' | 'invoice'): Promise<string[]> {
        // First get task IDs for the project
        const { data: tasks } = await this.supabase
            .from('project_tasks')
            .select('id')
            .eq('project_id', projectId);

        const taskIds = (tasks || []).map((t: any) => t.id);
        if (taskIds.length === 0) return [];

        const { data, error } = await this.supabase
            .from('project_task_documents')
            .select('document_id')
            .eq('document_type', documentType)
            .in('task_id', taskIds);

        if (error) {
            console.error('Error fetching document IDs for project:', error);
            throw error;
        }
        return (data || []).map((d: any) => d.document_id);
    }

}
