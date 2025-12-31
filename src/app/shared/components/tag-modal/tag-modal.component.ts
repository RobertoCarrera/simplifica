import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AppModalComponent } from '../../ui/app-modal/app-modal.component';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-tag-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, AppModalComponent],
    templateUrl: './tag-modal.component.html'
})
export class TagModalComponent implements OnChanges {
    @Input() visible = false;
    @Input() tagToEdit: GlobalTag | null = null;
    @Input() defaultScope: string | null = null;
    @Input() fixedScope = false;
    @Input() initialName = '';

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<GlobalTag>();

    tagForm: FormGroup;
    saving = false;
    availableScopes: { id: string, label: string, color?: string }[] = [];

    // Autocomplete
    showCategorySuggestions = false;
    categorySuggestions: string[] = [];
    allCategories: string[] = []; // Cache for simple autocomplete

    presetColors = [
        '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
        '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280',
    ];

    constructor(
        private fb: FormBuilder,
        private tagsService: GlobalTagsService,
        private authService: AuthService,
        private toast: ToastService
    ) {
        this.tagForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            color: ['#3B82F6', Validators.required],
            category: [''],
            category_color: ['#6B7280'],
            description: [''],
            scopes: [[]]
        });

        // Load static scopes once
        this.tagsService.getScopes().subscribe(scopes => {
            this.availableScopes = scopes;
        });

        // Load distinct categories for suggestion
        this.tagsService.getTags().subscribe(tags => {
            const cats = new Set<string>();
            tags.forEach(t => { if (t.category) cats.add(t.category); });
            this.allCategories = Array.from(cats).sort();
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['visible'] && this.visible) {
            this.initForm();
        }
    }

    private initForm() {
        if (this.tagToEdit) {
            // Edit Mode
            this.tagForm.patchValue({
                name: this.tagToEdit.name,
                color: this.tagToEdit.color,
                category: this.tagToEdit.category,
                category_color: this.tagToEdit.category_color || '#6B7280',
                description: this.tagToEdit.description,
                scopes: this.tagToEdit.scope || []
            });
        } else {
            // Create Mode
            this.tagForm.reset({
                name: this.initialName || '',
                color: this.presetColors[Math.floor(Math.random() * this.presetColors.length)],
                category: '',
                category_color: '#6B7280',
                description: '',
                scopes: this.defaultScope ? [this.defaultScope] : ['clients', 'tickets']
            });

            if (this.defaultScope) {
                const current = this.tagForm.get('scopes')?.value || [];
                if (!current.includes(this.defaultScope)) {
                    this.tagForm.patchValue({ scopes: [...current, this.defaultScope] });
                }
            }
        }
    }

    onClose() {
        this.close.emit();
        this.showCategorySuggestions = false;
    }

    toggleScope(scopeId: string) {
        if (this.fixedScope && scopeId === this.defaultScope) return; // Prevent unchecking if fixed

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

    selectColor(color: string) {
        this.tagForm.patchValue({ color });
    }

    // Autocomplete
    updateCategorySuggestions() {
        const inputVal = (this.tagForm.get('category')?.value || '').toLowerCase();

        if (!inputVal) {
            this.categorySuggestions = this.allCategories;
        } else {
            this.categorySuggestions = this.allCategories.filter(c => c.toLowerCase().includes(inputVal));
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

    saveTag() {
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

        const action$ = this.tagToEdit
            ? this.tagsService.updateTag(this.tagToEdit.id, tagData)
            : this.tagsService.createTag(tagData);

        action$.subscribe({
            next: (result) => {
                this.toast.success('Éxito', this.tagToEdit ? 'Etiqueta actualizada' : 'Etiqueta creada');
                this.saved.emit(result);
                this.onClose();
                this.saving = false;
                // Refresh categories list just in case
                if (tagData.category && !this.allCategories.includes(tagData.category)) {
                    this.allCategories.push(tagData.category);
                    this.allCategories.sort();
                }
            },
            error: (err) => {
                console.error('Error saving tag', err);
                this.toast.error('Error', 'No se pudo guardar la etiqueta');
                this.saving = false;
            }
        });
    }
}
