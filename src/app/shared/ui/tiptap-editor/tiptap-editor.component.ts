import { Component, Input, Output, EventEmitter, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TiptapEditorDirective } from 'ngx-tiptap';

@Component({
    selector: 'app-tiptap-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, TiptapEditorDirective],
    templateUrl: './tiptap-editor.component.html',
    styleUrl: './tiptap-editor.component.scss',
    encapsulation: ViewEncapsulation.None // Needed for Tiptap styles
})
export class TiptapEditorComponent implements OnInit, OnDestroy {
    @Input() content = '';
    @Input() placeholder = 'Escribe aquí...';
    @Output() contentChange = new EventEmitter<string>();

    editor: Editor | null = null;

    ngOnInit() {
        this.editor = new Editor({
            extensions: [
                StarterKit,
                Placeholder.configure({
                    placeholder: this.placeholder,
                }),
                Link.configure({
                    openOnClick: false,
                }),
                Image
            ],
            content: this.content,
            onUpdate: ({ editor }) => {
                const html = editor.getHTML();
                this.contentChange.emit(html);
            },
        });
    }

    ngOnDestroy() {
        this.editor?.destroy();
    }

    // Toolbar actions
    toggleBold() { this.editor?.chain().focus().toggleBold().run(); }
    toggleItalic() { this.editor?.chain().focus().toggleItalic().run(); }
    toggleStrike() { this.editor?.chain().focus().toggleStrike().run(); }
    toggleCode() { this.editor?.chain().focus().toggleCode().run(); }

    setParagraph() { this.editor?.chain().focus().setParagraph().run(); }
    setHeading(level: 1 | 2 | 3) { this.editor?.chain().focus().toggleHeading({ level }).run(); }

    toggleBulletList() { this.editor?.chain().focus().toggleBulletList().run(); }
    toggleOrderedList() { this.editor?.chain().focus().toggleOrderedList().run(); }

    addLink() {
        const previousUrl = this.editor?.getAttributes('link')['href'];
        const url = window.prompt('URL', previousUrl);
        if (url === null) return;
        if (url === '') {
            this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        this.editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
}
