import { ContextMenuComponent } from './context-menu.component';
import { ContextMenuService } from './context-menu.service';

export * from './context-menu.types';
export * from './context-menu.service';
export * from './context-menu.component';

/** Public surface of the app-context-menu feature */
export const CONTEXT_MENU_EXPORTS = [ContextMenuComponent, ContextMenuService];
