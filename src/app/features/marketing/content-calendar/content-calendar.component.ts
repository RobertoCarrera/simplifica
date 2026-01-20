import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ThemeService } from '../../../services/theme.service';
import { MarketingService, ContentPost } from '../../../core/services/marketing.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-content-calendar',
    standalone: true,
    imports: [CommonModule, DragDropModule, ReactiveFormsModule],
    templateUrl: './content-calendar.component.html',
    styleUrls: ['./content-calendar.component.scss']
})
export class ContentCalendarComponent implements OnInit {

    themeService = inject(ThemeService);
    marketingService = inject(MarketingService);
    authService = inject(AuthService);
    fb = inject(FormBuilder);
    toast = inject(ToastService);

    contentPosts = signal<ContentPost[]>([]);
    showPostModal = signal(false);

    postForm: FormGroup;

    kanbanColumns = [
        { id: 'idea', label: 'Idea' },
        { id: 'copy', label: 'Copywriting' },
        { id: 'design', label: 'Diseño' },
        { id: 'review', label: 'Revisión' },
        { id: 'scheduled', label: 'Programado' },
        { id: 'published', label: 'Publicado' }
    ];

    constructor() {
        this.postForm = this.fb.group({
            title: ['', Validators.required],
            platform: ['instagram', Validators.required],
            scheduled_date: [new Date().toISOString().split('T')[0], Validators.required],
            notes: [''],
            status: ['idea']
        });
    }

    ngOnInit() {
        this.loadPosts();
    }

    getColColor(id: string) {
        switch (id) {
            case 'idea': return 'bg-slate-400 ring-slate-200';
            case 'copy': return 'bg-orange-400 ring-orange-200';
            case 'design': return 'bg-pink-400 ring-pink-200';
            case 'review': return 'bg-purple-400 ring-purple-200';
            case 'scheduled': return 'bg-blue-500 ring-blue-200';
            case 'published': return 'bg-emerald-500 ring-emerald-200';
            default: return 'bg-slate-400';
        }
    }

    async loadPosts() {
        const cid = this.authService.companyId();
        if (!cid) return;
        this.marketingService.getContentPosts(cid).subscribe(posts => {
            this.contentPosts.set(posts);
        });
    }

    getPostsByStatus(status: string) {
        return this.contentPosts().filter(p => p.status === status);
    }

    async drop(event: CdkDragDrop<ContentPost[]>, newStatus: string) {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const item = event.previousContainer.data[event.previousIndex];
            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex,
            );

            // Optimistic update
            const updatedPosts = this.contentPosts().map(p => {
                if (p.id === item.id) return { ...p, status: newStatus as any };
                return p;
            });
            this.contentPosts.set(updatedPosts);

            // Backend Update
            try {
                if (item.id) {
                    await this.marketingService.updateContentPost(item.id, { status: newStatus as any });
                }
            } catch (e) {
                console.error(e);
                this.toast.error('Error', 'No se pudo actualizar el estado');
                this.loadPosts(); // Revert
            }
        }
    }

    openPostModal() {
        this.postForm.reset({
            status: 'idea',
            scheduled_date: new Date().toISOString().split('T')[0],
            platform: 'instagram'
        });
        this.showPostModal.set(true);
    }

    async savePost() {
        if (this.postForm.invalid) return;
        const cid = this.authService.companyId();
        if (!cid) return;

        try {
            await this.marketingService.createContentPost({
                company_id: cid,
                ...this.postForm.value as any
            });
            this.toast.success('Creado', 'Post añadido al calendario');
            this.showPostModal.set(false);
            this.loadPosts();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo crear el post');
        }
    }

    getPlatformIcon(platform: string): string {
        const map: any = {
            'instagram': 'fab fa-instagram',
            'tiktok': 'fab fa-tiktok',
            'facebook': 'fab fa-facebook',
            'linkedin': 'fab fa-linkedin',
            'blog': 'fas fa-pen-nib',
            'newsletter': 'fas fa-envelope-open-text'
        };
        return map[platform] || 'fas fa-hashtag';
    }

    getPlatformBadgeClass(platform: string): string {
        const map: any = {
            'instagram': 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent',
            'tiktok': 'bg-black text-white border-black dark:bg-slate-900',
            'facebook': 'bg-blue-600 text-white border-blue-600',
            'linkedin': 'bg-blue-700 text-white border-blue-700',
            'blog': 'bg-orange-500 text-white border-orange-500',
            'newsletter': 'bg-emerald-500 text-white border-emerald-500'
        };
        // Default fallback
        return map[platform] || 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
}
