import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { from, Observable, map } from 'rxjs';

export interface GlobalTag {
    id: string;
    name: string;
    color: string;
    category: string | null;
    scope: string[] | null;
    description: string | null;
    created_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class GlobalTagsService {
    private supabaseClient = inject(SupabaseClientService);

    /**
     * Fetch all global tags, optionally filtered by scope (e.g. 'clients', 'tickets').
     * If scope is null, returns all tags.
     */
    getTags(scope?: 'clients' | 'tickets'): Observable<GlobalTag[]> {
        return from(
            (async () => {
                let query = this.supabaseClient.instance
                    .from('global_tags')
                    .select('*')
                    .order('name');

                if (scope) {
                    // Verify if the tag has the scope in the array OR if scope is null (universal)
                    query = query.or(`scope.cs.{${scope}},scope.is.null`);
                }

                const { data, error } = await query;
                if (error) throw error;
                return data as GlobalTag[];
            })()
        );
    }

    /**
     * Create a new global tag.
     */
    createTag(tag: Partial<GlobalTag>): Observable<GlobalTag> {
        return from(
            (async () => {
                const { data, error } = await this.supabaseClient.instance
                    .from('global_tags')
                    .insert(tag)
                    .select()
                    .single();

                if (error) throw error;
                return data as GlobalTag;
            })()
        );
    }

    /**
     * Update an existing tag.
     */
    updateTag(id: string, updates: Partial<GlobalTag>): Observable<GlobalTag> {
        return from(
            (async () => {
                const { data, error } = await this.supabaseClient.instance
                    .from('global_tags')
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                return data as GlobalTag;
            })()
        );
    }

    /**
     * Delete a tag.
     */
    deleteTag(id: string): Observable<void> {
        return from(
            (async () => {
                const { error } = await this.supabaseClient.instance
                    .from('global_tags')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
            })()
        );
    }

    /**
     * Get tags assigned to a specific entity (client or ticket).
     */
    getEntityTags(entityType: 'clients' | 'tickets', entityId: string): Observable<GlobalTag[]> {
        return from(
            (async () => {
                const tableName = entityType === 'clients' ? 'clients_tags' : 'ticket_tag_relations';
                const foreignKey = entityType === 'clients' ? 'client_id' : 'ticket_id';

                const { data, error } = await this.supabaseClient.instance
                    .from(tableName)
                    .select(`
            tag_id,
            global_tags (*)
          `)
                    .eq(foreignKey, entityId);

                if (error) throw error;

                // Map the result to return just the GlobalTag objects
                // The query returns { tag_id: ..., global_tags: { ... } }
                return data?.map((item: any) => item.global_tags) as GlobalTag[] || [];
            })()
        );
    }

    /**
     * Assign a tag to an entity.
     */
    assignTag(entityType: 'clients' | 'tickets', entityId: string, tagId: string): Observable<void> {
        return from(
            (async () => {
                const tableName = entityType === 'clients' ? 'clients_tags' : 'ticket_tag_relations';
                const foreignKey = entityType === 'clients' ? 'client_id' : 'ticket_id';

                const { error } = await this.supabaseClient.instance
                    .from(tableName)
                    .insert({ [foreignKey]: entityId, tag_id: tagId });

                if (error) throw error;
            })()
        );
    }

    /**
     * Remove a tag from an entity.
     */
    removeTag(entityType: 'clients' | 'tickets', entityId: string, tagId: string): Observable<void> {
        return from(
            (async () => {
                const tableName = entityType === 'clients' ? 'clients_tags' : 'ticket_tag_relations';
                const foreignKey = entityType === 'clients' ? 'client_id' : 'ticket_id';

                const { error } = await this.supabaseClient.instance
                    .from(tableName)
                    .delete()
                    .eq(foreignKey, entityId)
                    .eq('tag_id', tagId);

                if (error) throw error;
            })()
        );
    }
    assignMultipleTags(entityType: 'clients' | 'tickets', entityId: string, tagIds: string[]): Observable<void> {
        if (!tagIds.length) return new Observable(observer => { observer.next(); observer.complete(); });

        return from(
            (async () => {
                const tableName = entityType === 'clients' ? 'clients_tags' : 'ticket_tag_relations';
                const foreignKey = entityType === 'clients' ? 'client_id' : 'ticket_id';

                const rows = tagIds.map(tagId => ({ [foreignKey]: entityId, tag_id: tagId }));

                const { error } = await this.supabaseClient.instance
                    .from(tableName)
                    .insert(rows);

                if (error) throw error;
            })()
        );
    }

    getTopTags(scope: 'clients' | 'tickets', limit = 5): Observable<GlobalTag[]> {
        return from(
            (async () => {
                const { data, error } = await this.supabaseClient.instance
                    .rpc('get_top_tags', { search_scope: scope, limit_count: limit });

                if (error) throw error;
                return data as GlobalTag[];
            })()
        );
    }
}
