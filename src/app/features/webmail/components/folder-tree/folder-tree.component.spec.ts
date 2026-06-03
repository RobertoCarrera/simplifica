import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { FolderTreeComponent } from './folder-tree.component';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolderService } from '../../services/mail-folder.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailDragStateService } from '../../services/mail-drag-state.service';
import { ToastService } from '../../../../services/toast.service';
import { MailErrorService } from '../../services/mail-error.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';
import { signal } from '@angular/core';

function mockMailFolder(overrides: Partial<MailFolder> = {}): MailFolder {
  return {
    id: 'f-1',
    account_id: 'acc-1',
    parent_id: null,
    name: 'Recibidos',
    path: '/inbox',
    type: 'system',
    system_role: 'inbox',
    unread_count: 3,
    total_count: 47,
    children: [],
    ...overrides,
  };
}

describe('FolderTreeComponent', () => {
  let component: FolderTreeComponent;
  let fixture: ComponentFixture<FolderTreeComponent>;
  let mailStoreSpy: jasmine.SpyObj<MailStoreService>;
  let mailFolderSpy: jasmine.SpyObj<MailFolderService>;
  let mailOpSpy: jasmine.SpyObj<MailOperationService>;
  let dragStateSpy: jasmine.SpyObj<MailDragStateService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let errorSpy: jasmine.SpyObj<MailErrorService>;
  let translocoSpy: jasmine.SpyObj<TranslocoService>;

  const systemFolders: MailFolder[] = [
    mockMailFolder({ id: 'f-inbox', system_role: 'inbox', name: 'Recibidos', unread_count: 5 }),
    mockMailFolder({ id: 'f-sent', system_role: 'sent', name: 'Enviados', unread_count: 0 }),
    mockMailFolder({ id: 'f-drafts', system_role: 'drafts', name: 'Borradores', unread_count: 0 }),
    mockMailFolder({ id: 'f-trash', system_role: 'trash', name: 'Papelera', unread_count: 0 }),
  ];

  const userFolder: MailFolder = mockMailFolder({
    id: 'f-user-1',
    type: 'user',
    system_role: undefined,
    name: 'Proyectos',
    path: '/Proyectos',
  });

  const allFolders = [...systemFolders, userFolder];

  beforeEach(async () => {
    mailStoreSpy = jasmine.createSpyObj('MailStoreService', [], {
      folderTree: signal(allFolders.map(f => ({ ...f, children: [] }))),
      accountsLoaded: signal(true),
      currentAccount: signal({ id: 'acc-1', email: 'test@example.com' }),
      accounts: signal([]),
      messages: signal([]),
      isLoading: signal(false),
      selectedMessage: signal(null),
      folders: signal(allFolders),
    });
    mailStoreSpy.loadFolders = jasmine.createSpy('loadFolders');

    mailFolderSpy = jasmine.createSpyObj('MailFolderService', [
      'deleteFolder', 'renameFolder', 'createFolder',
      'toggleSmartFolders', 'loadFolders', 'loadSmartFoldersSetting',
    ], {
      smartFoldersEnabled: signal(false),
      folders: signal(allFolders),
      folderTree: signal(allFolders.map(f => ({ ...f, children: [] }))),
      currentFolderId: signal(null),
    });
    mailFolderSpy.deleteFolder.and.resolveTo(true);
    mailFolderSpy.loadFolders.and.resolveTo();

    mailOpSpy = jasmine.createSpyObj('MailOperationService', ['moveMessages']);
    mailOpSpy.moveMessages.and.resolveTo();

    dragStateSpy = jasmine.createSpyObj('MailDragStateService', ['setDragData', 'clearDrag'], {
      isDragging: signal(false),
      draggedMessageIds: signal([]),
    });

    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error']);
    errorSpy = jasmine.createSpyObj('MailErrorService', ['parse']);

    translocoSpy = jasmine.createSpyObj('TranslocoService', ['translate']);
    translocoSpy.translate.and.returnValue('TRANSLATED');

    await TestBed.configureTestingModule({
      imports: [FolderTreeComponent],
      providers: [
        provideRouter([]),
        { provide: MailStoreService, useValue: mailStoreSpy },
        { provide: MailFolderService, useValue: mailFolderSpy },
        { provide: MailOperationService, useValue: mailOpSpy },
        { provide: MailDragStateService, useValue: dragStateSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: MailErrorService, useValue: errorSpy },
        { provide: TranslocoService, useValue: translocoSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Basic rendering ──────────────────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render folder items for all folders', () => {
    // We have 5 folders (4 system + 1 user)
    const items = fixture.debugElement.queryAll(By.css('a[role="treeitem"]'));
    expect(items.length).toBe(5);
  });

  it('should display folder names', () => {
    // Trigger change detection with updated tree
    fixture.detectChanges();
    const names = fixture.debugElement.queryAll(By.css('.folder-name'));
    const nameTexts = names.map(n => n.nativeElement.textContent.trim());
    expect(nameTexts).toContain('TRANSLATED'); // system folders use transloco
  });

  it('should show unread count badges', () => {
    // Inbox has unread_count: 5
    const badges = fixture.debugElement.queryAll(By.css('.badge'));
    // Only inbox should show a badge (unread_count = 5)
    expect(badges.length).toBe(1);
    expect(badges[0].nativeElement.textContent.trim()).toBe('5');
  });

  // ── ARIA accessibility ───────────────────────────────────────────────

  it('should have role="tree" on the folder list', () => {
    const tree = fixture.debugElement.query(By.css('ul[role="tree"]'));
    expect(tree).toBeTruthy();
  });

  it('should have role="treeitem" on folder links', () => {
    const items = fixture.debugElement.queryAll(By.css('a[role="treeitem"]'));
    expect(items.length).toBeGreaterThan(0);
    items.forEach(item => {
      expect(item.nativeElement.getAttribute('role')).toBe('treeitem');
    });
  });

  it('should have aria-level attributes on treeitems', () => {
    const items = fixture.debugElement.queryAll(By.css('a[role="treeitem"]'));
    items.forEach(item => {
      const level = item.nativeElement.getAttribute('aria-level');
      expect(level).toBeTruthy();
    });
  });

  it('should have tabindex="0" for keyboard focus', () => {
    const items = fixture.debugElement.queryAll(By.css('a[role="treeitem"]'));
    items.forEach(item => {
      expect(item.nativeElement.getAttribute('tabindex')).toBe('0');
    });
  });

  it('should have role="switch" on smart folder toggle', () => {
    const toggle = fixture.debugElement.query(By.css('button[role="switch"]'));
    expect(toggle).toBeTruthy();
    expect(toggle.nativeElement.getAttribute('aria-checked')).toBe('false');
  });

  it('should have role="menu" on context menu', () => {
    // Open context menu manually
    const userFolder = allFolders.find(f => f.type === 'user')!;
    const mockEvent = { preventDefault: () => {}, stopPropagation: () => {} } as any;
    component.onContextMenu(mockEvent, userFolder);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('div[role="menu"]'));
    expect(menu).toBeTruthy();

    const menuitems = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
    expect(menuitems.length).toBe(2);
  });

  // ── Context menu ─────────────────────────────────────────────────────

  it('should show context menu on right-click of user folder', () => {
    const userFolder = allFolders.find(f => f.type === 'user')!;
    const mockEvent = { preventDefault: () => {}, stopPropagation: () => {} } as any;
    component.onContextMenu(mockEvent, userFolder);
    fixture.detectChanges();

    expect(component.contextMenu()).toBeTruthy();
    expect(component.contextMenu()?.folder.id).toBe(userFolder.id);
  });

  it('should NOT show context menu for system folders', () => {
    const inbox = allFolders.find(f => f.system_role === 'inbox')!;
    const mockEvent = { preventDefault: () => {}, stopPropagation: () => {} } as any;
    component.onContextMenu(mockEvent, inbox);
    fixture.detectChanges();

    expect(component.contextMenu()).toBeNull();
  });

  // ── Folder create dialog ─────────────────────────────────────────────

  it('should open create dialog on + button click', () => {
    component.openCreateDialog();
    expect(component.showCreateDialog()).toBeTrue();
    expect(component.editTarget()).toBeNull();
  });

  it('should close create dialog', () => {
    component.openCreateDialog();
    component.closeCreateDialog();
    expect(component.showCreateDialog()).toBeFalse();
    expect(component.editTarget()).toBeNull();
  });

  // ── Drag & drop ──────────────────────────────────────────────────────

  it('should handle folder drop with message IDs', async () => {
    // Set up drag state with message IDs
    (dragStateSpy.draggedMessageIds as any).set(['msg-1', 'msg-2']);

    // Need to re-inject because the signal was swapped
    const target = userFolder;
    await component.onFolderDrop(target);

    expect(mailOpSpy.moveMessages).toHaveBeenCalledWith(['msg-1', 'msg-2'], target.id);
    expect(dragStateSpy.clearDrag).toHaveBeenCalled();
  });

  it('should not attempt move when no message IDs are dragged', async () => {
    (dragStateSpy.draggedMessageIds as any).set([]);
    await component.onFolderDrop(userFolder);
    expect(mailOpSpy.moveMessages).not.toHaveBeenCalled();
  });

  it('should set drop hover state on drag enter', () => {
    component.onFolderDragEnter(userFolder);
    expect(component.dropHoverFolderId()).toBe(userFolder.id);
  });

  it('should clear drop hover state on drag leave', () => {
    component.dropHoverFolderId.set(userFolder.id);
    component.onFolderDragLeave(userFolder);
    expect(component.dropHoverFolderId()).toBeNull();
  });

  it('should not clear hover state for different folder on leave', () => {
    component.dropHoverFolderId.set('f-inbox');
    component.onFolderDragLeave(userFolder);
    expect(component.dropHoverFolderId()).toBe('f-inbox');
  });

  // ── Folder route resolution ──────────────────────────────────────────

  it('should return system_role for system folder routes', () => {
    const inbox = systemFolders[0];
    expect(component.folderRoute(inbox)).toBe('inbox');
  });

  it('should return trimmed path for user folder routes', () => {
    expect(component.folderRoute(userFolder)).toBe('Proyectos');
  });

  // ── Keyboard navigation ──────────────────────────────────────────────

  it('should move focus down on ArrowDown', () => {
    const inbox = systemFolders[0];
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    spyOn(event, 'preventDefault');

    // Mock DOM query
    const mockEl = document.createElement('a');
    mockEl.dataset['folderId'] = 'f-inbox';
    const mockEl2 = document.createElement('a');
    mockEl2.dataset['folderId'] = 'f-sent';
    const focusSpy = spyOn(mockEl2, 'focus');
    spyOn(component as any, 'getVisibleFolderElements').and.returnValue([mockEl, mockEl2]);

    component.onFolderKeydown(event, inbox);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('should call focusFolderItem on Home key', () => {
    const sent = systemFolders[1];
    const event = new KeyboardEvent('keydown', { key: 'Home' });
    spyOn(event, 'preventDefault');

    const mockEl = document.createElement('a');
    mockEl.dataset['folderId'] = 'f-inbox';
    const mockEl2 = document.createElement('a');
    mockEl2.dataset['folderId'] = 'f-sent';
    const focusSpy = spyOn(mockEl, 'focus');
    spyOn(component as any, 'getVisibleFolderElements').and.returnValue([mockEl, mockEl2]);

    component.onFolderKeydown(event, sent);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });
});
