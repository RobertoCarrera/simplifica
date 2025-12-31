import { Component, Input, OnInit, inject, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { AppModalComponent } from '../../ui/app-modal/app-modal.component';

@Component({
    selector: 'app-tag-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, AppModalComponent],
    templateUrl: './tag-manager.component.html',
    styleUrls: ['./tag-manager.component.scss']
})
export class TagManagerComponent implements OnInit {
    @Input() entityId?: string | null;
    @Input({ required: true }) entityType!: 'clients' | 'tickets' | 'services';
    @Output() pendingTagsChange = new EventEmitter<GlobalTag[]>();

    private tagsService = inject(GlobalTagsService);

    // State
    assignedTags = signal<GlobalTag[]>([]);
    availableTags = signal<GlobalTag[]>([]);
    topTags = signal<GlobalTag[]>([]);

    // UI State
    isAdding = signal(false);
    searchTerm = signal('');

    // Create Modal State
    showCreateModal = signal(false);
    newTag = signal<Partial<GlobalTag>>({ name: '', color: '#3B82F6', scope: [] });
    savingNewTag = signal(false);

    // Computed
    get showRecommendations() {
        // Show recommendations only if search is empty AND we have enough total tags
        return !this.searchTerm() && this.topTags().length > 0 && this.availableTags().length >= 5;
    }

    get filteredTags() {
        const term = this.searchTerm().toLowerCase();
        const assignedIds = new Set(this.assignedTags().map(t => t.id));

        let tags = this.availableTags().filter(tag => !assignedIds.has(tag.id));

        if (term) {
            return tags.filter(tag => tag.name.toLowerCase().includes(term));
        }

        // If showing recommendations, exclude them from the main list to avoid duplication
        if (this.showRecommendations) {
            const recommendedIds = new Set(this.recommendedTags.map(t => t.id));
            tags = tags.filter(tag => !recommendedIds.has(tag.id));
        }

        return tags;
    }

    get recommendedTags() {
        const assignedIds = new Set(this.assignedTags().map(t => t.id));
        return this.topTags().filter(t => !assignedIds.has(t.id));
    }

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        // Load assigned tags if entityId exists
        if (this.entityId) {
            this.tagsService.getEntityTags(this.entityType, this.entityId).subscribe(tags => {
                this.assignedTags.set(tags);
            });
        }

        // Load all available tags for this scope
        this.tagsService.getTags(this.entityType).subscribe(tags => {
            this.availableTags.set(tags);
        });

        // Load top tags for recommendations
        this.tagsService.getTopTags(this.entityType, 5).subscribe(tags => {
            this.topTags.set(tags);
        });
    }

    toggleAddMode() {
        this.isAdding.update(v => !v);
        this.searchTerm.set('');
    }

    addTag(tag: GlobalTag) {
        if (this.entityId) {
            // Immediate update mode
            this.tagsService.assignTag(this.entityType, this.entityId, tag.id).subscribe({
                next: () => {
                    this.assignedTags.update(tags => [...tags, tag]);
                    this.isAdding.set(false);
                    this.searchTerm.set('');
                },
                error: (err) => console.error('Error adding tag:', err)
            });
        } else {
            // Pending mode
            this.assignedTags.update(tags => [...tags, tag]);
            this.pendingTagsChange.emit(this.assignedTags());
            this.isAdding.set(false);
            this.searchTerm.set('');
        }
    }

    removeTag(tagId: string) {
        if (this.entityId) {
            this.tagsService.removeTag(this.entityType, this.entityId, tagId).subscribe({
                next: () => {
                    this.assignedTags.update(tags => tags.filter(t => t.id !== tagId));
                },
                error: (err) => console.error('Error removing tag:', err)
            });
        } else {
            this.assignedTags.update(tags => tags.filter(t => t.id !== tagId));
            this.pendingTagsChange.emit(this.assignedTags());
        }
    }

    openCreateModal() {
        const name = this.searchTerm().trim();
        if (!name) return;

        // Check if exists
        const existing = this.availableTags().find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            this.addTag(existing);
            return;
        }

        // Prepare new tag
        this.newTag.set({
            name: name,
            color: this.generateRandomColor(),
            scope: [this.entityType]
        });

        // Open modal
        this.showCreateModal.set(true);
        // We do NOT close the dropdown properly here because if we do, the modal might look weird appearing while dropdown closes?
        // Actually, better close the dropdown.
        this.isAdding.set(false);
    }

    closeCreateModal() {
        this.showCreateModal.set(false);
        this.searchTerm.set('');
        this.savingNewTag.set(false);
    }

    saveNewTag() {
        const tagData = this.newTag();
        if (!tagData.name || !tagData.color) return;

        this.savingNewTag.set(true);

        this.tagsService.createTag(tagData).subscribe({
            next: (createdTag) => {
                this.availableTags.update(tags => [...tags, createdTag]);
                this.addTag(createdTag); // This assigns it too
                this.closeCreateModal();
            },
            error: (err) => {
                console.error('Error creating tag:', err);
                this.savingNewTag.set(false);
            }
        });
    }

    private generateRandomColor(): string {
        const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    updateTagName(name: string) {
        this.newTag.update(t => ({ ...t, name }));
    }

    updateTagColor(color: string) {
        this.newTag.update(t => ({ ...t, color }));
    }

    onSearchInput(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchTerm.set(target.value);
    }
}
