import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { TagModalComponent } from '../../../shared/components/tag-modal/tag-modal.component';

@Component({
    selector: 'app-tags-management',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, TagModalComponent],
    templateUrl: './tags-management.component.html',
    styleUrls: ['./tags-management.component.scss']
})
export class TagsManagementComponent implements OnInit {
    tags: GlobalTag[] = [];
    filteredTags: GlobalTag[] = [];
    loading = false;

    // Search & Filter
    searchTerm = '';
    selectedCategory: string | 'ALL' = 'ALL';
    selectedScope: string | 'ALL' = 'ALL';

    // Modal State
    showModal = false;
    tagToEdit: GlobalTag | null = null;

    availableScopes: { id: string, label: string, color?: string }[] = [];

    constructor(
        @Inject(GlobalTagsService) private tagsService: GlobalTagsService,
        private toast: ToastService,
        private authService: AuthService
    ) { }

    ngOnInit() {
        this.loadTags();
        this.loadScopes();
    }

    loadScopes() {
        this.tagsService.getScopes().subscribe({
            next: (scopes) => {
                this.availableScopes = scopes;
            },
            error: (err) => console.error('Error loading scopes', err)
        });
    }

    loadTags() {
        this.loading = true;
        this.tagsService.getTags().subscribe({
            next: (data) => {
                this.tags = data;
                this.filterTags();
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading tags', err);
                this.toast.error('Error', 'No se pudieron cargar las etiquetas');
                this.loading = false;
            }
        });
    }

    filterTags() {
        let filtered = this.tags;

        // Filter by search
        if (this.searchTerm.trim()) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(term) ||
                (t.category && t.category.toLowerCase().includes(term))
            );
        }

        // Filter by category
        if (this.selectedCategory !== 'ALL') {
            filtered = filtered.filter(t => t.category === this.selectedCategory);
        }

        // Filter by scope
        if (this.selectedScope !== 'ALL') {
            filtered = filtered.filter(t => {
                // If tag has no specific scope, it's global (available everywhere)
                // BUT user wants to filter by "where used". 
                // Usually global tags show up everywhere.
                // Logic: If I select "Tickets", show tags that HAVE 'tickets' in scope OR are global (null/empty).
                // Wait, typically "Global" means "All Scopes".
                // If t.scope is null/empty, it usually means "Global".

                if (!t.scope || t.scope.length === 0) return true;
                return t.scope.includes(this.selectedScope);
            });
        }

        this.filteredTags = filtered;
    }

    setScope(scope: string | 'ALL') {
        this.selectedScope = scope;
        this.filterTags();
    }

    get uniqueCategories(): string[] {
        const cats = new Set<string>();
        this.tags.forEach(t => {
            if (t.category) cats.add(t.category);
        });
        return Array.from(cats).sort();
    }

    openCreateModal() {
        this.tagToEdit = null;
        this.showModal = true;
    }

    openEditModal(tag: GlobalTag) {
        this.tagToEdit = tag;
        this.showModal = true;
    }

    closeModal() {
        this.showModal = false;
        this.tagToEdit = null;
    }

    onTagSaved(tag: GlobalTag) {
        this.loadTags();
        this.closeModal();
    }

    getScopeColor(scopeId: string): string {
        const scope = this.availableScopes.find(s => s.id === scopeId);
        return scope?.color || '#6B7280'; // Default gray if not found
    }

    getScopeLabel(scopeId: string): string {
        const scope = this.availableScopes.find(s => s.id === scopeId);
        return scope?.label || scopeId;
    }

    deleteTag(tag: GlobalTag) {
        if (confirm(`¿Estás seguro de eliminar la etiqueta "${tag.name}"?`)) {
            this.tagsService.deleteTag(tag.id).subscribe({
                next: () => {
                    this.toast.success('Éxito', 'Etiqueta eliminada');
                    this.loadTags();
                },
                error: (err) => {
                    console.error('Error deleting tag', err);
                    this.toast.error('Error', 'No se pudo eliminar la etiqueta');
                }
            });
        }
    }
}
