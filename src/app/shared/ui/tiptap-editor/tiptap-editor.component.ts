import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  OnChanges,
  SimpleChanges,
  HostListener,
  inject,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TiptapEditorDirective } from 'ngx-tiptap';
import DOMPurify from 'dompurify';
import { SupabaseClientService } from '../../../services/supabase-client.service';

interface VariableOption {
  key: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-tiptap-editor',
  standalone: true,
  imports: [FormsModule, TiptapEditorDirective],
  templateUrl: './tiptap-editor.component.html',
  styleUrl: './tiptap-editor.component.scss',
  encapsulation: ViewEncapsulation.None, // Needed for Tiptap styles
})
export class TiptapEditorComponent implements OnInit, OnDestroy, OnChanges {
  @Input() content = '';
  @Input() placeholder = 'Escribe aquí...';
  @Input() companyId: string | null = null;
  @Input() campaignId: string | null = null;
  @Output() contentChange = new EventEmitter<string>();

  private sb = inject(SupabaseClientService);

  editor: Editor | null = null;
  showLinkPrompt = false;
  linkUrl = '';

  // Image upload modal
  showImageModal = false;
  imageModalTab: 'upload' | 'url' = 'upload';
  imageUrlInput = '';
  imageUploadProgress = false;
  imageUploadError = '';
  fileInput: HTMLInputElement | null = null;

  // Variable insertion
  showVariableDropdown = false;
  variables: VariableOption[] = [
    { key: '{{client_name}}', label: 'Nombre del cliente', description: 'Reemplazado al enviar' },
    { key: '{{client_surname}}', label: 'Apellido', description: 'Reemplazado al enviar' },
    { key: '{{client_email}}', label: 'Email', description: 'Reemplazado al enviar' },
    { key: '{{client_phone}}', label: 'Teléfono', description: 'Reemplazado al enviar' },
    { key: '{{company_name}}', label: 'Nombre de la empresa', description: 'Reemplazado al enviar' },
    { key: '{{unsubscribe_url}}', label: 'Enlace para darse de baja', description: 'Placeholder — URL real inyectada al enviar' },
  ];

  // HTML source toggle
  showHtmlSource = false;
  htmlSourceContent = '';

  // Emoji picker
  showEmojiPicker = false;
  emojiCategories = [
    {
      label: 'Caras y emociones',
      emojis: [
        '😊', '😄', '😂', '🤣', '😍', '🥰', '😘', '😏', '😎', '🤩',
        '😢', '😭', '😤', '😠', '🤬', '😱', '😨', '😰', '🥺', '😞',
        '🤔', '🤨', '😐', '😑', '😶', '😴', '🤤', '🙄', '😒', '😬',
        '🤗', '😇', '🥳', '😈', '👿', '🤡', '🤯', '🥵', '🥶', '😵',
        '🤒', '🤕', '🤢', '🤧', '😷', '🤓', '🧐', '😜', '😝', '😛',
      ],
    },
    {
      label: 'Gestos',
      emojis: [
        '👍', '👎', '👌', '✌️', '🤞', '👏', '🙌', '🤝', '🙏', '💪',
        '👋', '🤙', '👊', '✊', '🤜', '🤛', '☝️', '💅', '✍️', '🤳',
        '🫶', '🫵', '🫱', '🤲', '🫰',
      ],
    },
    {
      label: 'Objetos y trabajo',
      emojis: [
        '💼', '📁', '📂', '📄', '📝', '🖊️', '🖋️', '📎', '📌', '📍',
        '🗂️', '🗃️', '💡', '🔦', '🔧', '🔨', '⚙️', '🖥️', '💻', '📱',
        '☎️', '📞', '📧', '📬', '📮', '🗓️', '📅', '🔒', '🔑', '🏷️',
      ],
    },
    {
      label: 'Naturaleza y animales',
      emojis: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
        '🦁', '🐸', '🐵', '🐔', '🐧', '🐦', '🌸', '🌺', '🌻', '🌹',
        '🍀', '🌿', '🌱', '🌲', '🌳', '☀️', '🌤️', '⛅', '🌧️', '⛄',
      ],
    },
    {
      label: 'Comida',
      emojis: [
        '🍕', '🍔', '🌮', '🌯', '🍣', '🍜', '🍝', '🍛', '🥗', '🥪',
        '🍩', '🎂', '🍰', '🍫', '🍬', '🍭', '🥤', '☕', '🍵', '🧃',
        '🍺', '🥂', '🍷', '🥃', '🍸',
      ],
    },
    {
      label: 'Símbolos y señales',
      emojis: [
        '✅', '❌', '⚠️', '🚫', '💯', '🔴', '🟡', '🟢', '🔵', '⭐',
        '💫', '✨', '🎯', '🏆', '🥇', '🎉', '🎊', '🎁', '❤️', '🧡',
        '💛', '💚', '💙', '💜', '🖤', '🔥', '💧', '⚡', '🌈', '♻️',
      ],
    },
  ];
  categoryIcons = ['😊', '👍', '💼', '🌿', '🍕', '✅'];
  activeCategoryIndex = 0;
  emojiSearch = '';

  // Keyword map: emoji → searchable terms (en + es)
  emojiKeywords: Record<string, string> = {
    '😊': 'happy smile feliz sonrisa content',
    '😄': 'happy grin laugh big smile alegre',
    '😂': 'lol laugh cry tears funny gracioso risa',
    '🤣': 'rolling laugh hilarious carcajada',
    '😍': 'love heart eyes enamorado adorar',
    '🥰': 'love hearts cute adorable enamorado',
    '😘': 'kiss love blow beso amor',
    '😏': 'smirk mischievous pícaro guiño',
    '😎': 'cool sunglasses awesome chulo gafas',
    '🤩': 'star struck amazing wow alucinado estrella',
    '😢': 'cry sad tear llorar triste llanto',
    '😭': 'cry sob weep llorar desconsolado triste',
    '😤': 'frustrated angry puffing frustrado enfadado',
    '😠': 'angry mad enfadado enojado ira',
    '🤬': 'rage angry swear furioso rabia',
    '😱': 'scream scared shocked asustado grito susto',
    '😨': 'scared fear anxious miedo ansioso',
    '😰': 'sweat nervous anxious sudor nervioso',
    '🥺': 'pleading puppy eyes sad súplica tierno triste',
    '😞': 'disappointed sad decepcionado triste',
    '🤔': 'thinking hmm pensando reflexión',
    '🤨': 'suspicious skeptical sospechoso escéptico',
    '😐': 'neutral expressionless neutro sin expresión',
    '😑': 'annoyed expressionless molesto',
    '😶': 'silent quiet mute callado silencio',
    '😴': 'sleepy tired sleep dormido cansado',
    '🤤': 'drooling hungry babear hambriento',
    '🙄': 'eye roll bored hartazgo aburrido',
    '😒': 'unamused bored desganado',
    '😬': 'grimace awkward nervioso incómodo mueca',
    '🤗': 'hug happy warm abrazo cálido',
    '😇': 'angel halo innocent ángel inocente',
    '🥳': 'party celebrate fiesta celebrar',
    '😈': 'devil evil mischief diablo malévolo',
    '👿': 'angry devil furioso diablo enfadado',
    '🤡': 'clown funny payaso gracioso',
    '🤯': 'mind blown shocked alucinado impactado',
    '🥵': 'hot sweating calor sudor',
    '🥶': 'cold freezing frío congelado',
    '😵': 'dizzy confused mareado confundido',
    '🤒': 'sick ill fever enfermo fiebre',
    '🤕': 'hurt injured bandage herido lastimado',
    '🤢': 'nausea sick disgusted náuseas asco',
    '🤧': 'sneeze cold estornudo resfriado',
    '😷': 'mask sick covid mascarilla enfermo',
    '🤓': 'nerd glasses empollón gafas',
    '🧐': 'monocle curious monóculo curioso detective',
    '😜': 'playful wink tongue juguetón guiño',
    '😝': 'tongue playful lengua juguetón',
    '😛': 'tongue silly lengua tonto gracioso',
    '👍': 'thumbs up ok good yes bien aprobado de acuerdo',
    '👎': 'thumbs down bad no mal desaprobado',
    '👌': 'ok perfect perfecto vale',
    '✌️': 'peace victory paz victoria',
    '🤞': 'fingers crossed luck suerte cruzados',
    '👏': 'clap applause aplaudir bravo',
    '🙌': 'praise celebrate hands alabar celebrar',
    '🤝': 'handshake deal acuerdo apretón mano',
    '🙏': 'pray thanks please gracias orar por favor ruego',
    '💪': 'strong muscle flex fuerte músculo',
    '👋': 'wave hello bye hola adiós saludo',
    '🤙': 'call shaka llámame',
    '👊': 'fist punch puño golpe',
    '✊': 'raised fist power poder puño',
    '☝️': 'point up one señalar arriba uno',
    '💅': 'nails manicure sassy uñas',
    '✍️': 'write pen escribir pluma',
    '🤳': 'selfie phone foto móvil',
    '💼': 'briefcase work business maletín trabajo negocio',
    '📁': 'folder file carpeta archivo',
    '📄': 'document page documento página',
    '📝': 'memo note write nota apuntar',
    '📎': 'paperclip attach clip adjuntar',
    '📌': 'pin fixer chincheta',
    '💡': 'idea bulb light tip idea bombilla consejo',
    '🔧': 'wrench fix tool llave arreglar herramienta',
    '💻': 'laptop computer portátil ordenador',
    '📱': 'phone mobile teléfono móvil',
    '📧': 'email mail correo',
    '🔒': 'lock secure private seguro privado cerrojo',
    '🔑': 'key password llave contraseña',
    '🐶': 'dog puppy perro cachorro',
    '🐱': 'cat kitten gato gatito',
    '🌸': 'flower cherry blossom flor cerezo primavera',
    '🌹': 'rose flower romantic rosa flor romántico',
    '☀️': 'sun sunny sol soleado verano',
    '🌧️': 'rain cloud lluvia nube',
    '🌈': 'rainbow arcoíris',
    '🍕': 'pizza food comida',
    '🍔': 'burger hamburger hamburguesa',
    '☕': 'coffee hot cafe té caliente',
    '🍵': 'tea hot drink té infusión',
    '🍺': 'beer drink cerveza bebida',
    '🎂': 'cake birthday tarta cumpleaños',
    '🍰': 'cake slice tarta porción postre',
    '✅': 'check done yes ok correcto hecho sí',
    '❌': 'cross no wrong error incorrecto cancelar',
    '⚠️': 'warning alert caution advertencia alerta',
    '🚫': 'no forbidden prohibido',
    '💯': 'hundred perfect cien perfecto doscientos',
    '⭐': 'star favorite estrella favorito',
    '🎯': 'target goal dart objetivo meta',
    '🏆': 'trophy winner award trofeo ganador',
    '🎉': 'party celebrate party fiesta celebrar confeti',
    '❤️': 'heart love red corazón amor rojo',
    '🧡': 'orange heart corazón naranja',
    '💛': 'yellow heart corazón amarillo',
    '💚': 'green heart corazón verde',
    '💙': 'blue heart corazón azul',
    '💜': 'purple heart corazón morado',
    '🖤': 'black heart corazón negro',
    '🔥': 'fire hot flame fuego caliente',
    '⚡': 'lightning bolt fast electric rayo relámpago',
    '💧': 'water drop agua gota',
  };

  get filteredEmojis(): string[] {
    const q = this.emojiSearch.trim().toLowerCase();
    if (!q) return this.emojiCategories[this.activeCategoryIndex]?.emojis ?? [];
    const allEmojis = this.emojiCategories.flatMap((c) => c.emojis);
    return [...new Set(allEmojis)].filter((e) => {
      const keywords = this.emojiKeywords[e] || '';
      return e.includes(q) || keywords.toLowerCase().includes(q);
    });
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showEmojiPicker = false;
    this.showVariableDropdown = false;
  }

  ngOnInit() {
    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          link: false,
        }),
        Placeholder.configure({
          placeholder: this.placeholder,
        }),
        Link.configure({
          openOnClick: false,
        }),
        Image,
      ],
      content: this.content,
      onUpdate: ({ editor }) => {
        const rawHtml = editor.getHTML();
        const html = DOMPurify.sanitize(rawHtml, {
          ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'strong', 'em', 's', 'code', 'blockquote', 'span', 'div'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel'],
          ALLOW_DATA_ATTR: false,
        });
        setTimeout(() => {
          this.contentChange.emit(html);
        }, 0);
      },
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['content'] && this.editor) {
      const newContent = changes['content'].currentValue;
      if (this.editor.getHTML() !== newContent) {
        this.editor.commands.setContent(newContent);
      }
    }
  }

  ngOnDestroy() {
    this.editor?.destroy();
  }

  // Toolbar actions
  toggleBold() {
    this.editor?.chain().focus().toggleBold().run();
  }
  toggleItalic() {
    this.editor?.chain().focus().toggleItalic().run();
  }
  toggleStrike() {
    this.editor?.chain().focus().toggleStrike().run();
  }
  toggleCode() {
    this.editor?.chain().focus().toggleCode().run();
  }

  setParagraph() {
    this.editor?.chain().focus().setParagraph().run();
  }
  setHeading(level: 1 | 2 | 3) {
    this.editor?.chain().focus().toggleHeading({ level }).run();
  }

  toggleBulletList() {
    this.editor?.chain().focus().toggleBulletList().run();
  }
  toggleOrderedList() {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  addLink() {
    const previousUrl = this.editor?.getAttributes('link')['href'];
    this.linkUrl = previousUrl || '';
    this.showLinkPrompt = true;
  }

  confirmLink() {
    this.showLinkPrompt = false;
    if (this.linkUrl === '') {
      this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    this.editor?.chain().focus().extendMarkRange('link').setLink({ href: this.linkUrl }).run();
  }

  cancelLink() {
    this.showLinkPrompt = false;
    this.linkUrl = '';
  }

  // Image modal — opens the modal for either upload or URL
  onShowImageModal() {
    this.showImageModal = true;
    this.imageModalTab = 'upload';
    this.imageUrlInput = '';
    this.imageUploadProgress = false;
    this.imageUploadError = '';
  }

  // Called from template when clicking image toolbar button
  addImageClick() {
    this.onShowImageModal();
  }

  closeImageModal() {
    this.showImageModal = false;
    this.imageUrlInput = '';
    this.imageUploadError = '';
    this.imageUploadProgress = false;
  }

  /**
   * Insert image by URL. If no URL is provided, opens the image modal.
   * Used by external callers (e.g. webmail message-composer) that already
   * have a hosted URL. New code should use the image modal instead.
   * @param url URL of the image to insert — if omitted, opens the image modal
   */
  addImage(url?: string) {
    if (url) {
      this.editor?.chain().focus().setImage({ src: url }).run();
    } else {
      this.onShowImageModal();
    }
  }

  confirmImageUrl() {
    if (this.imageUrlInput.trim()) {
      this.editor?.chain().focus().setImage({ src: this.imageUrlInput.trim() }).run();
    }
    this.closeImageModal();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    // Validate MIME type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      this.imageUploadError = 'Tipo de archivo no permitido. Usa PNG, JPEG, WebP o GIF.';
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      this.imageUploadError = 'La imagen es demasiado grande. Máximo 10MB.';
      return;
    }

    this.imageUploadProgress = true;
    this.imageUploadError = '';

    const folder = this.companyId || 'unknown';
    const subfolder = this.campaignId || 'draft';
    const fileName = `${folder}/${subfolder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    this.sb.instance.storage
      .from('marketing-campaign-images')
      .upload(fileName, file, { contentType: file.type })
      .then(({ data, error }) => {
        if (error) {
          this.imageUploadError = 'Error al subir la imagen. Intenta de nuevo.';
          this.imageUploadProgress = false;
          return;
        }
        const { data: urlData } = this.sb.instance.storage
          .from('marketing-campaign-images')
          .getPublicUrl(fileName);
        this.editor?.chain().focus().setImage({ src: urlData.publicUrl }).run();
        this.imageUploadProgress = false;
        this.closeImageModal();
      })
      .catch(() => {
        this.imageUploadError = 'Error al subir la imagen. Intenta de nuevo.';
        this.imageUploadProgress = false;
      });
  }

  // Variable insertion
  onVariableInsert() {
    this.showVariableDropdown = !this.showVariableDropdown;
  }

  insertVariable(variable: VariableOption) {
    this.editor?.chain().focus().insertContent(variable.key).run();
    this.showVariableDropdown = false;
  }

  /** Visual indicator for the variable-insert button. Returned as a string so the
   *  template can render it via interpolation without Angular parsing `{{` as
   *  an interpolation start. */
  get variableIcon(): string {
    return '{{x}}';
  }

  /** Insert an emoji at the current cursor position in the editor. */
  insertEmoji(emoji: string) {
    this.editor?.chain().focus().insertContent(emoji).run();
    this.showEmojiPicker = false;
  }

// HTML source toggle
  toggleHtmlSource() {
    if (this.showHtmlSource) {
      // Switching back to WYSIWYG — parse HTML back into editor
      this.editor?.commands.setContent(this.htmlSourceContent);
      this.showHtmlSource = false;
    } else {
      // Switching to HTML source — show raw HTML
      this.htmlSourceContent = this.editor?.getHTML() || '';
      this.showHtmlSource = true;
    }
  }

  // Deprecated: textarea now uses ngModel directly
  // Kept for backwards compatibility if needed
  onHtmlSourceChange(_content: string) {
    // No-op: ngModel handles it
  }

  getEditorContent(): string {
    return this.editor?.getHTML() || '';
  }

  setEditorContent(html: string) {
    this.editor?.commands.setContent(html);
  }
}