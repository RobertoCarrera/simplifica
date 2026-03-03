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
} from '@angular/core';

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
  imports: [FormsModule, TiptapEditorDirective],
  templateUrl: './tiptap-editor.component.html',
  styleUrl: './tiptap-editor.component.scss',
  encapsulation: ViewEncapsulation.None, // Needed for Tiptap styles
})
export class TiptapEditorComponent implements OnInit, OnDestroy, OnChanges {
  @Input() content = '';
  @Input() placeholder = 'Escribe aquí...';
  @Output() contentChange = new EventEmitter<string>();

  editor: Editor | null = null;
  showLinkPrompt = false;
  linkUrl = '';
  showEmojiPicker = false;
  emojiCategories = [
    {
      label: 'Caras y emociones',
      emojis: [
        '😊',
        '😄',
        '😂',
        '🤣',
        '😍',
        '🥰',
        '😘',
        '😏',
        '😎',
        '🤩',
        '😢',
        '😭',
        '😤',
        '😠',
        '🤬',
        '😱',
        '😨',
        '😰',
        '🥺',
        '😞',
        '🤔',
        '🤨',
        '😐',
        '😑',
        '😶',
        '😴',
        '🤤',
        '🙄',
        '😒',
        '😬',
        '🤗',
        '😇',
        '🥳',
        '😈',
        '👿',
        '🤡',
        '🤯',
        '🥵',
        '🥶',
        '😵',
        '🤒',
        '🤕',
        '🤢',
        '🤧',
        '😷',
        '🤓',
        '🧐',
        '😜',
        '😝',
        '😛',
      ],
    },
    {
      label: 'Gestos',
      emojis: [
        '👍',
        '👎',
        '👌',
        '✌️',
        '🤞',
        '👏',
        '🙌',
        '🤝',
        '🙏',
        '💪',
        '👋',
        '🤙',
        '👊',
        '✊',
        '🤜',
        '🤛',
        '☝️',
        '💅',
        '✍️',
        '🤳',
        '🫶',
        '🫵',
        '🫱',
        '🤲',
        '🫰',
      ],
    },
    {
      label: 'Objetos y trabajo',
      emojis: [
        '💼',
        '📁',
        '📂',
        '📄',
        '📝',
        '🖊️',
        '🖋️',
        '📎',
        '📌',
        '📍',
        '🗂️',
        '🗃️',
        '💡',
        '🔦',
        '🔧',
        '🔨',
        '⚙️',
        '🖥️',
        '💻',
        '📱',
        '☎️',
        '📞',
        '📧',
        '📬',
        '📮',
        '🗓️',
        '📅',
        '🔒',
        '🔑',
        '🏷️',
      ],
    },
    {
      label: 'Naturaleza y animales',
      emojis: [
        '🐶',
        '🐱',
        '🐭',
        '🐹',
        '🐰',
        '🦊',
        '🐻',
        '🐼',
        '🐨',
        '🐯',
        '🦁',
        '🐸',
        '🐵',
        '🐔',
        '🐧',
        '🐦',
        '🌸',
        '🌺',
        '🌻',
        '🌹',
        '🍀',
        '🌿',
        '🌱',
        '🌲',
        '🌳',
        '☀️',
        '🌤️',
        '⛅',
        '🌧️',
        '⛄',
      ],
    },
    {
      label: 'Comida',
      emojis: [
        '🍕',
        '🍔',
        '🌮',
        '🌯',
        '🍣',
        '🍜',
        '🍝',
        '🍛',
        '🥗',
        '🥪',
        '🍩',
        '🎂',
        '🍰',
        '🍫',
        '🍬',
        '🍭',
        '🥤',
        '☕',
        '🍵',
        '🧃',
        '🍺',
        '🥂',
        '🍷',
        '🥃',
        '🍸',
      ],
    },
    {
      label: 'Símbolos y señales',
      emojis: [
        '✅',
        '❌',
        '⚠️',
        '🚫',
        '💯',
        '🔴',
        '🟡',
        '🟢',
        '🔵',
        '⭐',
        '💫',
        '✨',
        '🎯',
        '🏆',
        '🥇',
        '🎉',
        '🎊',
        '🎁',
        '❤️',
        '🧡',
        '💛',
        '💚',
        '💙',
        '💜',
        '🖤',
        '🔥',
        '💧',
        '⚡',
        '🌈',
        '♻️',
      ],
    },
  ];
  categoryIcons = ['😊', '👍', '💼', '🌿', '🍕', '✅'];
  activeCategoryIndex = 0;
  emojiSearch = '';

  // Keyword map: emoji → searchable terms (en + es)
  emojiKeywords: Record<string, string> = {
    // Caras y emociones
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
    // Gestos
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
    // Objetos
    '💼': 'briefcase work business maletín trabajo negocio',
    '📁': 'folder file carpeta archivo',
    '📄': 'document page documento página',
    '📝': 'memo note write nota apuntar',
    '📎': 'paperclip attach clip adjuntar',
    '📌': 'pin fijar chincheta',
    '💡': 'idea bulb light tip idea bombilla consejo',
    '🔧': 'wrench fix tool llave arreglar herramienta',
    '💻': 'laptop computer portátil ordenador',
    '📱': 'phone mobile teléfono móvil',
    '📧': 'email mail correo',
    '🔒': 'lock secure private seguro privado cerrojo',
    '🔑': 'key password llave contraseña',
    // Naturaleza
    '🐶': 'dog puppy perro cachorro',
    '🐱': 'cat kitten gato gatito',
    '🌸': 'flower cherry blossom flor cerezo primavera',
    '🌹': 'rose flower romantic rosa flor romántico',
    '☀️': 'sun sunny sol soleado verano',
    '🌧️': 'rain cloud lluvia nube',
    '🌈': 'rainbow arcoíris',
    // Comida
    '🍕': 'pizza food comida',
    '🍔': 'burger hamburger hamburguesa',
    '☕': 'coffee hot cafe té caliente',
    '🍵': 'tea hot drink té infusión',
    '🍺': 'beer drink cerveza bebida',
    '🎂': 'cake birthday tarta cumpleaños',
    '🍰': 'cake slice tarta porción postre',
    // Símbolos
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
    // Deduplicate, preserve order
    return [...new Set(allEmojis)].filter((e) => {
      const keywords = this.emojiKeywords[e] || '';
      return e.includes(q) || keywords.toLowerCase().includes(q);
    });
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showEmojiPicker = false;
  }

  ngOnInit() {
    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          link: false, // Disable default to prevent [tiptap warn]: Duplicate extension names found: ['link']
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
        const html = editor.getHTML();
        setTimeout(() => {
          this.contentChange.emit(html);
        }, 0);
      },
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['content'] && this.editor) {
      const newContent = changes['content'].currentValue;
      // Only update if content is different to avoid cursor jumps / infinite loops
      if (this.editor.getHTML() !== newContent) {
        // If newContent is empty, or just different, update it.
        // Note: getHTML() might add tags, so comparison isn't perfect but covers basic async load.
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

  addImage(url?: string) {
    const src = url || window.prompt('URL de la imagen');
    if (src) {
      this.editor?.chain().focus().setImage({ src }).run();
    }
  }

  insertEmoji(emoji: string) {
    this.editor?.chain().focus().insertContent(emoji).run();
    this.showEmojiPicker = false;
  }
}
