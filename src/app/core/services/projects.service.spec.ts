import { TestBed } from '@angular/core/testing';
import { ProjectsService } from './projects.service';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { firstValueFrom } from 'rxjs';

/**
 * Helper: builds a mock Supabase query chain that resolves with { data, error }.
 */
function mockSupabaseQueryChain(resolveData: any = [], resolveError: any = null) {
  const chain: any = {};
  // Terminal methods return the resolved promise
  chain.maybeSingle = () => Promise.resolve({ data: resolveData, error: resolveError });
  chain.single = () => Promise.resolve({ data: resolveData, error: resolveError });
  chain.limit = () => chain;
  chain.order = () => chain;
  chain.eq = () => chain;
  chain.select = () => chain;
  return chain;
}

describe('ProjectsService — client visibility', () => {
  let service: ProjectsService;

  // Default mocks: admin user, modules loaded, moduloProyectos enabled
  let authMock: { userRole: jasmine.Spy; userProfileSignal: jasmine.Spy; currentCompanyId: jasmine.Spy };
  let modulesMock: { isModuleEnabled: jasmine.Spy };
  let supabaseFromSpy: jasmine.Spy;
  let supabaseInstance: any;

  function setup(
    opts: {
      role?: string;
      clientId?: string | null;
      companyId?: string;
      moduleEnabled?: boolean | null;
    } = {}
  ) {
    authMock.userRole.and.returnValue(opts.role ?? 'admin');
    authMock.userProfileSignal.and.returnValue(opts.clientId !== undefined ? { client_id: opts.clientId } : null);
    authMock.currentCompanyId.and.returnValue(opts.companyId ?? 'co-1');

    const moduleValue = opts.moduleEnabled !== undefined ? opts.moduleEnabled : true;
    modulesMock.isModuleEnabled.and.callFake((key: string) =>
      key === 'moduloProyectos' ? moduleValue : null
    );
  }

  beforeEach(() => {
    authMock = {
      userRole: jasmine.createSpy('userRole'),
      userProfileSignal: jasmine.createSpy('userProfileSignal'),
      currentCompanyId: jasmine.createSpy('currentCompanyId'),
    };
    modulesMock = {
      isModuleEnabled: jasmine.createSpy('isModuleEnabled'),
    };

    supabaseFromSpy = jasmine.createSpy('from');
    supabaseInstance = { from: supabaseFromSpy };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: SupabaseClientService, useValue: { instance: supabaseInstance } },
        { provide: SupabaseModulesService, useValue: modulesMock },
        ProjectsService,
      ],
    });
    service = TestBed.inject(ProjectsService);
  });

  // ── getProjects ──────────────────────────────────────────

  describe('getProjects', () => {
    it('admin ve todos los proyectos', async () => {
      setup({ role: 'admin' });
      const chain = mockSupabaseQueryChain([{ id: 'p1', client_id: 'c1' }]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects());
      expect(projects.length).toBe(1);
      expect(supabaseFromSpy).toHaveBeenCalledWith('projects');
    });

    it('cliente con módulo activo ve solo sus proyectos asignados', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: true });
      const chain = mockSupabaseQueryChain([{ id: 'p-a', client_id: 'c-42' }]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects());
      expect(projects.length).toBe(1);
      // The chain should include an eq('client_id', 'c-42') call
      expect(supabaseFromSpy).toHaveBeenCalledWith('projects');
    });

    it('cliente sin client_id devuelve array vacío', async () => {
      setup({ role: 'client', clientId: null, moduleEnabled: true });
      // from() should NOT be called because the guard returns of([])
      const projects = await firstValueFrom(service.getProjects());
      expect(projects).toEqual([]);
      expect(supabaseFromSpy).not.toHaveBeenCalled();
    });

    it('cliente con módulo inactivo ve todos (fallback)', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: false });
      const chain = mockSupabaseQueryChain([{ id: 'p1' }, { id: 'p2' }]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects());
      expect(projects.length).toBe(2);
      expect(supabaseFromSpy).toHaveBeenCalledWith('projects');
    });

    it('cliente con módulos no cargados ve todos (fallback)', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: null });
      const chain = mockSupabaseQueryChain([{ id: 'p1' }]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects());
      expect(projects.length).toBe(1);
      expect(supabaseFromSpy).toHaveBeenCalledWith('projects');
    });

    it('is_internal_archived filtrado para no-clientes', async () => {
      setup({ role: 'admin' });
      const chain = mockSupabaseQueryChain([
        { id: 'p1', is_internal_archived: false },
        { id: 'p2', is_internal_archived: true },
      ]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects());
      expect(projects.length).toBe(1);
      expect(projects[0].id).toBe('p1');
    });

    it('includeHidden=true muestra proyectos ocultos', async () => {
      setup({ role: 'admin' });
      const chain = mockSupabaseQueryChain([
        { id: 'p1', is_internal_archived: false },
        { id: 'p2', is_internal_archived: true },
      ]);
      supabaseFromSpy.and.returnValue(chain);

      const projects = await firstValueFrom(service.getProjects(false, true));
      expect(projects.length).toBe(2);
    });
  });

  // ── getProjectById ───────────────────────────────────────

  describe('getProjectById', () => {
    it('admin accede a cualquier proyecto', async () => {
      setup({ role: 'admin' });
      const chain = mockSupabaseQueryChain({ id: 'p-x', client_id: 'c-other' });
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('p-x');
      expect(project).not.toBeNull();
      expect(project!.id).toBe('p-x');
    });

    it('cliente accede a proyecto asignado', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: true });
      const chain = mockSupabaseQueryChain({ id: 'p-y', client_id: 'c-42' });
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('p-y');
      expect(project).not.toBeNull();
      expect(project!.id).toBe('p-y');
    });

    it('cliente bloqueado de proyecto no asignado', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: true });
      const chain = mockSupabaseQueryChain({ id: 'p-z', client_id: 'c-99' });
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('p-z');
      expect(project).toBeNull();
    });

    it('cliente sin client_id bloqueado', async () => {
      setup({ role: 'client', clientId: null, moduleEnabled: true });
      const chain = mockSupabaseQueryChain({ id: 'p-w', client_id: 'c-42' });
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('p-w');
      expect(project).toBeNull();
    });

    it('cliente con módulo inactivo sin restricción', async () => {
      setup({ role: 'client', clientId: 'c-42', moduleEnabled: false });
      const chain = mockSupabaseQueryChain({ id: 'p-v', client_id: 'c-99' });
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('p-v');
      expect(project).not.toBeNull();
      expect(project!.id).toBe('p-v');
    });

    it('proyecto inexistente retorna null', async () => {
      setup({ role: 'admin' });
      const chain = mockSupabaseQueryChain(null);
      supabaseFromSpy.and.returnValue(chain);

      const project = await service.getProjectById('nonexistent');
      expect(project).toBeNull();
    });
  });
});
