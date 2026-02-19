import { Component, Input, OnInit, inject, signal, Output, EventEmitter, ViewChild, ElementRef, HostListener, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { TagModalComponent } from '../../components/tag-modal/tag-modal.component';

@Component({
    selector: 'app-tag-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, TagModalComponent],
    templateUrl: './tag-manager.component.html',
    styleUrls: ['./tag-manager.component.scss']
})
export class TagManagerComponent implements OnInit, OnChanges {
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

    // Dropdown Positioning
    @ViewChild('dropdownAnchor') dropdownAnchor!: ElementRef;
    dropdownTop = signal(0);
    dropdownLeft = signal(0);
    dropdownWidth = signal(256); // Default w-64

    @HostListener('window:resize')
    onResize() {
        if (this.isAdding()) {
            this.calculateDropdownPosition();
        }
    }

    @HostListener('window:scroll')
    onWindowScroll() {
        if (this.isAdding()) {
            this.calculateDropdownPosition();
        }
    }

    // Modal
    showCreateModal = false;
    tagToEdit: GlobalTag | null = null;
    prefilledName = '';

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

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['entityId'] && !changes['entityId'].firstChange) {
            this.loadData();
        }
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
        this.refreshAvailableTags();

        // Load top tags for recommendations
        this.tagsService.getTopTags(this.entityType, 5).subscribe(tags => {
            this.topTags.set(tags);
        });
    }

    refreshAvailableTags() {
        this.tagsService.getTags(this.entityType).subscribe(tags => {
            this.availableTags.set(tags);
        });
    }

    toggleAddMode() {
        if (!this.isAdding()) {
            this.isAdding.set(true);
            // Calculate position after render
            setTimeout(() => this.calculateDropdownPosition(), 0);
        } else {
            this.isAdding.set(false);
        }
        this.searchTerm.set('');
    }

    calculateDropdownPosition() {
        if (!this.dropdownAnchor) return;
        const rect = this.dropdownAnchor.nativeElement.getBoundingClientRect();

        // Position below the anchor
        this.dropdownTop.set(rect.top); // Align top with the anchor's top initially, or handle based on design
        // Actually, if we want it to "replace" the button or appear below:
        // Let's make it appear slightly below or covering
        this.dropdownTop.set(rect.bottom + 8);
        this.dropdownLeft.set(rect.left);

        // Ensure it doesn't go off screen
        const windowWidth = window.innerWidth;
        if (rect.left + 256 > windowWidth) {
            this.dropdownLeft.set(windowWidth - 264); // 256 width + 8 margin
        }
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

        // If exact match exists, add it instead of creating
        if (name) {
            const existing = this.availableTags().find(t => t.name.toLowerCase() === name.toLowerCase());
            if (existing) {
                this.addTag(existing);
                return;
            }
        }

        this.prefilledName = name;
        this.showCreateModal = true;
        this.isAdding.set(false); // Close dropdown
    }

    onModalClose() {
        this.showCreateModal = false;
        this.prefilledName = '';
        this.tagToEdit = null;
    }

    onTagSaved(tag: GlobalTag) {
        // Tag was created/edited. Reload available tags.
        this.refreshAvailableTags();

        // If it was a creation initiated by us, auto-add it
        this.addTag(tag);

        this.onModalClose();
    }

    onSearchInput(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchTerm.set(target.value);
    }
}

