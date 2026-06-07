import { TestBed } from '@angular/core/testing';
import { MailContextMenuBuilder } from './mail-context-menu.builder';
import { MailOperationService } from './mail-operation.service';
import { MailStoreService } from './mail-store.service';
import { ToastService } from '../../../services/toast.service';
import { Router } from '@angular/router';
import { MailMessage, MailFolder } from '../../../core/interfaces/webmail.interface';
import { signal } from '@angular/core';

class FakeOps {
  archive = jasmine.createSpy('archive').and.returnValue(Promise.resolve());
  markAsSpam = jasmine.createSpy('markAsSpam').and.returnValue(Promise.resolve());
  markAsNotSpam = jasmine.createSpy('markAsNotSpam').and.returnValue(Promise.resolve());
  deleteMessages = jasmine.createSpy('deleteMessages').and.returnValue(Promise.resolve());
  toggleRead = jasmine.createSpy('toggleRead').and.returnValue(Promise.resolve());
  toggleStar = jasmine.createSpy('toggleStar').and.returnValue(Promise.resolve());
}
class FakeStore {
  currentAccount = signal({ id: 'acc-1' } as any);
  folders = signal<MailFolder[]>([]);
  loadFolders = jasmine.createSpy('loadFolders');
}
class FakeToast {
  success = jasmine.createSpy('success');
  error = jasmine.createSpy('error');
}
class FakeRouter {
  navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
  routerState = { root: {} };
}

function makeMsg(over: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'm-1',
    account_id: 'acc-1',
    folder_id: 'f-inbox',
    is_read: false,
    is_starred: false,
    from: { name: 'Ana', email: 'ana@example.com' },
    subject: 'Hola',
    snippet: '',
    received_at: '2025-01-01T00:00:00Z',
    ...over,
  } as MailMessage;
}

function makeFolder(role: string | undefined, id = 'f-' + role): MailFolder {
  return { id, name: role ?? 'f', path: '/' + (role ?? 'f'), system_role: role as any, account_id: 'acc-1', type: 'system' } as MailFolder;
}

describe('MailContextMenuBuilder', () => {
  let builder: MailContextMenuBuilder;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MailContextMenuBuilder,
        { provide: MailOperationService, useClass: FakeOps },
        { provide: MailStoreService, useClass: FakeStore },
        { provide: ToastService, useClass: FakeToast },
        { provide: Router, useClass: FakeRouter },
      ],
    });
    builder = TestBed.inject(MailContextMenuBuilder);
  });

  function ids(entries: any[]): string[] {
    return entries.filter((e) => e.type === 'item').map((e) => e.item.id);
  }

  it('returns the full action set for an inbox message', () => {
    const msg = makeMsg();
    const folder = makeFolder('inbox');
    const entries = builder.buildEntries(msg, folder);
    const list = ids(entries);
    expect(list).toContain('reply');
    expect(list).toContain('reply-all');
    expect(list).toContain('forward');
    expect(list).toContain('toggle-read');
    expect(list).toContain('toggle-star');
    expect(list).toContain('archive');
    expect(list).toContain('mark-spam');
    expect(list).toContain('delete');
  });

  it('hides archive + reply actions in trash and replaces delete with delete-permanent', () => {
    const msg = makeMsg();
    const folder = makeFolder('trash');
    const entries = builder.buildEntries(msg, folder);
    const list = ids(entries);
    expect(list).not.toContain('archive');
    expect(list).not.toContain('mark-spam');
    expect(list).toContain('delete-permanent');
    expect(list).not.toContain('delete');
  });

  it('shows "not-spam" instead of "mark-spam" inside the spam folder', () => {
    const msg = makeMsg();
    const folder = makeFolder('spam');
    const entries = builder.buildEntries(msg, folder);
    const list = ids(entries);
    expect(list).not.toContain('mark-spam');
    expect(list).toContain('not-spam');
  });

  it('uses unread label when is_read is true', () => {
    const msg = makeMsg({ is_read: true });
    const folder = makeFolder('inbox');
    const entries = builder.buildEntries(msg, folder);
    const toggleRead = entries.find((e) => e.type === 'item' && e.item.id === 'toggle-read') as any;
    expect(toggleRead.item.label).toBe('webmail.contextMenu.markUnread');
  });

  it('uses starred label when is_starred is true', () => {
    const msg = makeMsg({ is_starred: true });
    const folder = makeFolder('inbox');
    const entries = builder.buildEntries(msg, folder);
    const toggleStar = entries.find((e) => e.type === 'item' && e.item.id === 'toggle-star') as any;
    expect(toggleStar.item.label).toBe('webmail.contextMenu.unstar');
  });

  it('marks the archive action as danger=false and delete as danger=true', () => {
    const msg = makeMsg();
    const folder = makeFolder('inbox');
    const entries = builder.buildEntries(msg, folder);
    const archive = entries.find((e) => e.type === 'item' && e.item.id === 'archive') as any;
    const del = entries.find((e) => e.type === 'item' && e.item.id === 'delete') as any;
    expect(archive.item.danger).toBeFalsy();
    expect(del.item.danger).toBe(true);
  });

  it('reply is disabled in archive and drafts', () => {
    const msg = makeMsg();
    expect(
      ids(builder.buildEntries(msg, makeFolder('archive'))).includes('reply'),
    ).toBe(true);
    const archiveReply = builder
      .buildEntries(msg, makeFolder('archive'))
      .find((e) => e.type === 'item' && e.item.id === 'reply') as any;
    const draftsReply = builder
      .buildEntries(msg, makeFolder('drafts'))
      .find((e) => e.type === 'item' && e.item.id === 'reply') as any;
    expect(archiveReply.item.disabled).toBe(true);
    expect(draftsReply.item.disabled).toBe(true);
  });
});
