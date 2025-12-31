import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { AppModalComponent } from '../../../shared/ui/app-modal/app-modal.component';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-tags-management',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, AppModalComponent],
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

    // Autocomplete
    showCategorySuggestions = false;
    categorySuggestions: string[] = [];

    // Tag Form
    showModal = false;
    isEditing = false;
    tagForm: FormGroup;
    editingTagId: string | null = null;
    saving = false;
    availableScopes: { id: string, label: string, color?: string }[] = [];

    // Predefined colors for UI picker
    presetColors = [
        '#EF4444', // Red
        '#F97316', // Orange
        '#F59E0B', // Amber
        '#10B981', // Emerald
        '#06B6D4', // Cyan
        '#3B82F6', // Blue
        '#6366F1', // Indigo
        '#8B5CF6', // Violet
        '#EC4899', // Pink
        '#6B7280', // Gray
    ];

    constructor(
        @Inject(GlobalTagsService) private tagsService: GlobalTagsService,
        private fb: FormBuilder,
        private toast: ToastService,
        private authService: AuthService
    ) {
        this.tagForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            color: ['#3B82F6', Validators.required],
            category: [''],
            category_color: ['#6B7280'], // Default Gray
            description: [''],
            scopes: [[]] // Array of selected scope IDs
        });
    }

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

        this.filteredTags = filtered;
    }

    get uniqueCategories(): string[] {
        const cats = new Set<string>();
        this.tags.forEach(t => {
            if (t.category) cats.add(t.category);
        });
        return Array.from(cats).sort();
    }

    openCreateModal() {
        this.isEditing = false;
        this.editingTagId = null;
        this.tagForm.reset({
            name: '',
            color: this.presetColors[Math.floor(Math.random() * this.presetColors.length)],
            category: '',
            category_color: '#6B7280',
            description: '',
            scopes: ['clients', 'tickets'] // Default to common scopes
        });
        this.showModal = true;
    }

    openEditModal(tag: GlobalTag) {
        this.isEditing = true;
        this.editingTagId = tag.id;

        this.tagForm.patchValue({
            name: tag.name,
            color: tag.color,
            category: tag.category,
            category_color: tag.category_color || '#6B7280',
            description: tag.description,
            scopes: tag.scope || []
        });
        this.showModal = true;
    }

    toggleScope(scopeId: string) {
        const currentScopes: string[] = this.tagForm.get('scopes')?.value || [];
        const index = currentScopes.indexOf(scopeId);

        let newScopes;
        if (index > -1) {
            newScopes = currentScopes.filter(s => s !== scopeId);
        } else {
            newScopes = [...currentScopes, scopeId];
        }

        this.tagForm.patchValue({ scopes: newScopes });
        this.tagForm.markAsDirty();
    }

    closeModal() {
        this.showModal = false;
        this.showCategorySuggestions = false;
    }

    // Autocomplete Logic
    updateCategorySuggestions() {
        const inputVal = (this.tagForm.get('category')?.value || '').toLowerCase();
        const allCats = this.uniqueCategories;

        if (!inputVal) {
            this.categorySuggestions = allCats;
        } else {
            this.categorySuggestions = allCats.filter(c => c.toLowerCase().includes(inputVal));
        }
    }

    selectCategorySuggestion(cat: string) {
        this.tagForm.patchValue({ category: cat });
        this.showCategorySuggestions = false;
    }

    hideCategorySuggestions() {
        setTimeout(() => {
            this.showCategorySuggestions = false;
        }, 200);
    }

    onCategoryFocus() {
        this.updateCategorySuggestions();
        this.showCategorySuggestions = true;
    }

    async saveTag() {
        if (this.tagForm.invalid) return;

        this.saving = true;
        const formVal = this.tagForm.value;
        const companyId = this.authService.companyId();

        const tagData: Partial<GlobalTag> = {
            name: formVal.name,
            color: formVal.color,
            category: formVal.category || null,
            category_color: formVal.category_color || null,
            description: formVal.description || null,
            scope: formVal.scopes && formVal.scopes.length > 0 ? formVal.scopes : null,
            company_id: companyId
        };

        if (this.isEditing && this.editingTagId) {
            this.tagsService.updateTag(this.editingTagId, tagData).subscribe({
                next: (updated) => {
                    this.toast.success('Éxito', 'Etiqueta actualizada');
                    this.loadTags();
                    this.closeModal();
                    this.saving = false;
                },
                error: (err) => {
                    console.error('Error updating tag', err);
                    this.toast.error('Error', 'No se pudo actualizar la etiqueta');
                    this.saving = false;
                }
            });
        } else {
            this.tagsService.createTag(tagData).subscribe({
                next: (created) => {
                    this.toast.success('Éxito', 'Etiqueta creada');
                    this.loadTags();
                    this.closeModal();
                    this.saving = false;
                },
                error: (err) => {
                    console.error('Error creating tag', err);
                    this.toast.error('Error', 'No se pudo crear la etiqueta');
                    this.saving = false;
                }
            });
        }
    }

    // Helper to get scope color
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

    // Helpers
    selectColor(color: string) {
        this.tagForm.patchValue({ color });
    }
}
