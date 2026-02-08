import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, map } from 'rxjs';
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
          client:client_id (id, name, apellidos, business_name),
          tasks:project_tasks (id, is_completed, title, position)
        `)
                .eq('is_archived', archived)
                .order('position', { ascending: true })
        ).pipe(map(({ data, error }) => {
            if (error) throw error;

            return (data as any[]).map(p => {
                const tasks = (p.tasks || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
                return {
                    ...p,
                    tasks,
                    tasks_count: tasks.length,
                    completed_tasks_count: tasks.filter((t: any) => t.is_completed).length
                };
            }) as Project[];
        }));
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
}
