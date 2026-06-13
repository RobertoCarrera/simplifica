import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';

/**
 * Global edit-mode flag for the /docs module.
 *
 * When the superadmin flips the toggle in the docs header, every
 * component in the module reads this service and switches from the
 * "view" rendering to the "edit" rendering (inline forms, + buttons,
 * drag handles, etc).
 *
 * Read access is public — only superadmins ever see the toggle in the
 * header, so non-superadmins never enter edit mode.
 */
@Injectable({ providedIn: 'root' })
export class EditModeService {
  private auth = inject(AuthService);

  private readonly _editMode = signal(false);
  /** Whether the superadmin has toggled the docs module into edit mode. */
  readonly editMode = this._editMode.asReadonly();

  /** Only superadmins can edit. */
  readonly canEdit = computed(() => this.auth.isSuperAdmin());

  toggle(): void {
    if (!this.canEdit()) return;
    this._editMode.update((v) => !v);
  }

  enter(): void {
    if (!this.canEdit()) return;
    this._editMode.set(true);
  }

  exit(): void {
    this._editMode.set(false);
  }
}
