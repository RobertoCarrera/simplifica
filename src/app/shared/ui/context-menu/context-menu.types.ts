/**
 * Context Menu — shared types
 *
 * Reusable context menu component (right-click) for the webmail
 * and any other feature that needs it.
 */

export type ContextMenuItemType = 'item' | 'separator' | 'label';

export interface ContextMenuItem {
  /** Stable id (used for tests + key tracking) */
  id: string;
  /** Display label (can be a transloco key via the template, or a plain string) */
  label: string;
  /** Optional icon class (e.g. 'fas fa-trash') */
  icon?: string;
  /** Built-in icon name from the @shared-ui context-menu-icons registry (preferred) */
  iconName?: ContextMenuIconName;
  /** Disable without hiding (greyed out) */
  disabled?: boolean;
  /** Hide the item entirely */
  hidden?: boolean;
  /** Destructive styling (red) */
  danger?: boolean;
  /** Optional keyboard shortcut hint, e.g. 'Del' */
  shortcut?: string;
  /** Click handler (optional for separators/labels) */
  action?: () => void | Promise<void>;
}

export type ContextMenuIconName =
  | 'reply'
  | 'reply-all'
  | 'forward'
  | 'delete'
  | 'trash'
  | 'archive'
  | 'spam'
  | 'not-spam'
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'move'
  | 'copy'
  | 'print'
  | 'mark'
  | 'refresh'
  | 'search';

export interface ContextMenuSubmenu {
  /** Stable id (used for tests + key tracking) */
  id: string;
  /** Display label (can be a transloco key via the template, or a plain string) */
  label: string;
  /** Optional icon class (e.g. 'fas fa-folder') */
  icon?: string;
  /** Disable without hiding (greyed out) */
  disabled?: boolean;
  /** Hide the submenu entirely */
  hidden?: boolean;
  /** Child entries (items, separators, labels only — no nested submenus) */
  children: (ContextMenuEntry & { type: 'item' | 'separator' | 'label' })[];
}

export type ContextMenuEntry =
  | { type: 'item'; item: ContextMenuItem }
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | { type: 'submenu'; submenu: ContextMenuSubmenu };

/** Position request passed to ContextMenuService.open */
export interface ContextMenuOpenRequest<T = unknown> {
  /** Mouse / pointer event (used to derive position) */
  event: MouseEvent | TouchEvent;
  /** Entries to render (items, separators, labels) */
  entries: ContextMenuEntry[];
  /**
   * Optional data context (e.g. the message the menu was opened on).
   * The subscriber receives it back via the open() Observable.
   */
  data?: T;
  /** Close when an item is clicked (default true) */
  closeOnItemClick?: boolean;
}
