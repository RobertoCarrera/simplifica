import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';

@Component({
    selector: 'app-tag-manager',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './tag-manager.component.html',
    styleUrls: ['./tag-manager.component.scss']
})
export class TagManagerComponent implements OnInit {
    @Input({ required: true }) entityId!: string;
    @Input({ required: true }) entityType!: 'clients' | 'tickets';

    private tagsService = inject(GlobalTagsService);

    // State
    assignedTags = signal<GlobalTag[]>([]);
    availableTags = signal<GlobalTag[]>([]);

    // UI State
    isAdding = signal(false);
    searchTerm = signal('');

    // Computed
    get filteredTags() {
        const term = this.searchTerm().toLowerCase();
        const assignedIds = new Set(this.assignedTags().map(t => t.id));

        return this.availableTags().filter(tag =>
            !assignedIds.has(tag.id) &&
            tag.name.toLowerCase().includes(term)
        );
    }

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        // Load assigned tags
        this.tagsService.getEntityTags(this.entityType, this.entityId).subscribe(tags => {
            this.assignedTags.set(tags);
        });

        // Load all available tags for this scope
        this.tagsService.getTags(this.entityType).subscribe(tags => {
            this.availableTags.set(tags);
        });
    }

    toggleAddMode() {
        this.isAdding.update(v => !v);
        this.searchTerm.set('');
    }

    addTag(tag: GlobalTag) {
        this.tagsService.assignTag(this.entityType, this.entityId, tag.id).subscribe({
            next: () => {
                this.assignedTags.update(tags => [...tags, tag]);
                this.isAdding.set(false);
                this.searchTerm.set('');
            },
            error: (err) => console.error('Error adding tag:', err)
        });
    }

    removeTag(tagId: string) {
        this.tagsService.removeTag(this.entityType, this.entityId, tagId).subscribe({
            next: () => {
                this.assignedTags.update(tags => tags.filter(t => t.id !== tagId));
            },
            error: (err) => console.error('Error removing tag:', err)
        });
    }

    createAndAddTag() {
        const name = this.searchTerm().trim();
        if (!name) return;

        // Check if it already exists in available tags but filtered out
        const existing = this.availableTags().find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            this.addTag(existing);
            return;
        }

        // Create new tag
        const newTag: Partial<GlobalTag> = {
            name: name,
            scope: [this.entityType], // Default to current scope
            color: this.generateRandomColor()
        };

        this.tagsService.createTag(newTag).subscribe({
            next: (createdTag) => {
                this.availableTags.update(tags => [...tags, createdTag]);
                this.addTag(createdTag);
            },
            error: (err) => console.error('Error creating tag:', err)
        });
    }

    private generateRandomColor(): string {
        const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    onSearchInput(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchTerm.set(target.value);
    }
}
