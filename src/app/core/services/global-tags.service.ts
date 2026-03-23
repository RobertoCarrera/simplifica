import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { from, Observable, map } from 'rxjs';

export interface GlobalTag {
  id: string;
  name: string;
  color: string;
  category: string | null;
  category_color?: string | null;
  scope: string[] | null;
  description: string | null;
  company_id?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalTagsService {
  private supabaseClient = inject(SupabaseClientService);

  /**
   * Fetch all global tags, optionally filtered by scope (e.g. 'clients', 'tickets').
   * If scope is null, returns all tags.
   */
  getTags(scope?: 'clients' | 'tickets' | 'services'): Observable<GlobalTag[]> {
    return from(
      (async () => {
        let query = this.supabaseClient.instance
          .from('global_tags')
          .select('*')
          .order('name')
          .limit(500);

        if (scope) {
          // Verify if the tag has the scope in the array OR if scope is null (universal)
          query = query.or(`scope.cs.{${scope}},scope.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as GlobalTag[];
      })(),
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
      })(),
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
      })(),
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
      })(),
    );
  }

  /**
   * Get tags assigned to a specific entity (client, ticket, or service).
   */
  getEntityTags(
    entityType: 'clients' | 'tickets' | 'services',
    entityId: string,
  ): Observable<GlobalTag[]> {
    return from(
      (async () => {
        let tableName = '';
        let foreignKey = '';

        let recordType = '';
        switch (entityType) {
          case 'clients':
            tableName = 'clients_tags';
            foreignKey = 'client_id';
            recordType = 'client';
            break;
          case 'tickets':
            tableName = 'tickets_tags';
            foreignKey = 'ticket_id';
            recordType = 'ticket';
            break;
          case 'services':
            tableName = 'item_tags';
            foreignKey = 'record_id';
            recordType = 'service';
            break;
        }

        // For services, use unified item_tags table
        let query = this.supabaseClient.instance.from(tableName).select(`
            tag_id,
            global_tags (*)
          `);

        if (entityType === 'services') {
          query = query.eq('record_type', 'service').eq('record_id', entityId);
        } else {
          query = query.eq(foreignKey, entityId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Map the result to return just the GlobalTag objects
        return (data?.map((item: any) => item.global_tags) as GlobalTag[]) || [];
      })(),
    );
  }

  /**
   * Assign a tag to an entity.
   */
  assignTag(
    entityType: 'clients' | 'tickets' | 'services',
    entityId: string,
    tagId: string,
  ): Observable<void> {
    return from(
      (async () => {
        let tableName = '';
        let foreignKey = '';

        let recordType = '';
        switch (entityType) {
          case 'clients':
            tableName = 'clients_tags';
            foreignKey = 'client_id';
            recordType = 'client';
            break;
          case 'tickets':
            tableName = 'tickets_tags';
            foreignKey = 'ticket_id';
            recordType = 'ticket';
            break;
          case 'services':
            tableName = 'item_tags';
            foreignKey = 'record_id';
            recordType = 'service';
            break;
        }

        let insertData: any = { [foreignKey]: entityId, tag_id: tagId };
        if (entityType === 'services') {
          insertData = { record_id: entityId, tag_id: tagId, record_type: 'service' };
        }

        const { error } = await this.supabaseClient.instance.from(tableName).insert(insertData);

        if (error) throw error;
      })(),
    );
  }

  /**
   * Remove a tag from an entity.
   */
  removeTag(
    entityType: 'clients' | 'tickets' | 'services',
    entityId: string,
    tagId: string,
  ): Observable<void> {
    return from(
      (async () => {
        let tableName = '';
        let foreignKey = '';

        let recordType = '';
        switch (entityType) {
          case 'clients':
            tableName = 'clients_tags';
            foreignKey = 'client_id';
            recordType = 'client';
            break;
          case 'tickets':
            tableName = 'tickets_tags';
            foreignKey = 'ticket_id';
            recordType = 'ticket';
            break;
          case 'services':
            tableName = 'item_tags';
            foreignKey = 'record_id';
            recordType = 'service';
            break;
        }

        let query = this.supabaseClient.instance.from(tableName).delete().eq('tag_id', tagId);
        if (entityType === 'services') {
          query = query.eq('record_type', 'service').eq('record_id', entityId);
        } else {
          query = query.eq(foreignKey, entityId);
        }

        const { error } = await query;

        if (error) throw error;
      })(),
    );
  }

  assignMultipleTags(
    entityType: 'clients' | 'tickets' | 'services',
    entityId: string,
    tagIds: string[],
  ): Observable<void> {
    if (!tagIds.length)
      return new Observable((observer) => {
        observer.next();
        observer.complete();
      });

    return from(
      (async () => {
        let tableName = '';
        let foreignKey = '';

        let recordType = '';
        switch (entityType) {
          case 'clients':
            tableName = 'clients_tags';
            foreignKey = 'client_id';
            recordType = 'client';
            break;
          case 'tickets':
            tableName = 'tickets_tags';
            foreignKey = 'ticket_id';
            recordType = 'ticket';
            break;
          case 'services':
            tableName = 'item_tags';
            foreignKey = 'record_id';
            recordType = 'service';
            break;
        }

        let rows: any[];
        if (entityType === 'services') {
          rows = tagIds.map((tagId) => ({
            record_id: entityId,
            tag_id: tagId,
            record_type: 'service',
          }));
        } else {
          rows = tagIds.map((tagId) => ({ [foreignKey]: entityId, tag_id: tagId }));
        }

        const { error } = await this.supabaseClient.instance.from(tableName).insert(rows);

        if (error) throw error;
      })(),
    );
  }

  getTopTags(scope: 'clients' | 'tickets' | 'services', limit = 5): Observable<GlobalTag[]> {
    return from(
      (async () => {
        const { data, error } = await this.supabaseClient.instance.rpc('get_top_tags', {
          search_scope: scope,
          limit_count: limit,
        });

        if (error) throw error;
        return data as GlobalTag[];
      })(),
    );
  }

  getScopes(): Observable<{ id: string; label: string; color?: string }[]> {
    return from(
      (async () => {
        const { data, error } = await this.supabaseClient.instance
          .from('tag_scopes')
          .select('id, label, color')
          .order('label');

        if (error || !data || data.length === 0) {
          // Fallback if table doesn't exist or is empty
          return [
            { id: 'clients', label: 'Clientes', color: '#10B981' },
            { id: 'tickets', label: 'Tickets', color: '#EF4444' },
            { id: 'services', label: 'Servicios', color: '#3B82F6' },
          ];
        }
        return data;
      })(),
    );
  }
}
