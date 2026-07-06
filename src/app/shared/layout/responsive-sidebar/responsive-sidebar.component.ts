import { Component, OnInit, inject, signal, HostListener, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import {
  LucideAngularModule,
  LUCIDE_ICONS,
  LucideIconProvider,
  Home,
  Users,
  Ticket,
  MessageCircle,
  FileText,
  Receipt,
  TrendingUp,
  Package,
  Wrench,
  Settings,
  Sparkles,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Smartphone,
  Download,
  FileQuestion,
  FileStack,
  Bell,
  Mail,
  Megaphone,
  Shield,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Building,
  Calendar,
  LayoutGrid,
  Clock,
  Star,
  BookOpen,
  ClipboardCheck,
  Activity,
} from 'lucide-angular';
import { PWAService } from '../../../services/pwa.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';
import { MailStoreService } from '../../../features/webmail/services/mail-store.service';
import { fromEvent, map, startWith } from 'rxjs';
import { MenuVisibilityService } from './services/menu-visibility.service';
import { SidebarFloatingTooltipComponent } from './components/sidebar-floating-tooltip/sidebar-floating-tooltip.component';
import { SidebarFooterLinksComponent } from './components/sidebar-footer-links/sidebar-footer-links.component';
import { SidebarMobileOverlayComponent } from './components/sidebar-mobile-overlay/sidebar-mobile-overlay.component';
import { SidebarMobilePwaActionsComponent } from './components/sidebar-mobile-pwa-actions/sidebar-mobile-pwa-actions.component';
import { SidebarUserProfileComponent } from './components/sidebar-user-profile/sidebar-user-profile.component';
import {
  MenuItem,
  WEBMAIL_ITEM_ID,
  NOTIFICATION_ITEM_IDS,
} from './data/sidebar-menu.items';

@Component({
  selector: 'app-responsive-sidebar',
  standalone: true,
  host: {
    '[class.collapsed]': 'isCollapsed()',
    '[class.expanded]': '!isCollapsed()',
    '[class.mobile-visible]': 'isOpen() && isMobile()',
    '[class.mobile-hidden]': '!isOpen() && isMobile()',
  },
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    TranslocoPipe,
    SidebarFloatingTooltipComponent,
    SidebarFooterLinksComponent,
    SidebarMobileOverlayComponent,
    SidebarMobilePwaActionsComponent,
    SidebarUserProfileComponent,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Home,
        Users,
        Ticket,
        MessageCircle,
        FileText,
        Receipt,
        TrendingUp,
        Package,
        Wrench,
        Settings,
        Sparkles,
        HelpCircle,
        ChevronLeft,
        ChevronRight,
        ChevronUp,
        LogOut,
        Smartphone,
        Download,
        FileQuestion,
        FileStack,
        Bell,
        Mail,
        Megaphone,
        Shield,
        ChevronDown,
        Check,
        Building,
        Calendar,
        LayoutGrid,
        Clock,
        ArrowLeft,
        Star,
        BookOpen,
        ClipboardCheck,
        Activity,
      }),
    },
  ],
  templateUrl: './responsive-sidebar.component.html',
  styleUrls: ['./responsive-sidebar.component.scss'],
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  sidebarState = inject(SidebarStateService);
  private translocoService = inject(TranslocoService);

  // Tooltip interaction state — converted to signals so the floating-tooltip
  // sub-component can consume them as @Input() Signal<...> and react without
  // the parent re-rendering the entire sidebar on every hover change.
  readonly hoveredItem = signal<MenuItem | null>(null);
  readonly tooltipStyle = signal<{ top: string; left: string }>({ top: '0px', left: '0px' });

  onMouseEnter(event: MouseEvent, item: MenuItem) {
    if (!this.isCollapsed()) return;

    // Calculate position based on the target element
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Position fixed logic
    this.tooltipStyle.set({
      top: `${rect.top + rect.height / 2}px`,
      left: `${rect.right + 10}px`, // 10px offset
    });
    this.hoveredItem.set(item);
  }

  onMouseLeave() {
    this.hoveredItem.set(null);
  }
  authService = inject(AuthService); // público para template
  private settingsService = inject(SupabaseSettingsService);
  notificationsService = inject(SupabaseNotificationsService); // Public for template access if needed
  /**
   * Owns the pure visibility logic (role / module / permission / dev-mode
   * filtering). The parent just delegates the binding in the template and
   * triggers the initial data load from ngOnInit — see MenuVisibilityService.
   */
  private menuVisibility = inject(MenuVisibilityService);

  // Company Switcher State — owned by the parent so any sub-component that
  // needs to mutate the switcher (open / toggle / close) shares a single
  // source of truth via the signal ref. The child user-profile component
  // mutates this same signal instance via @Input(), so toggles / selects /
  // exits in the child observe the same state without round-tripping through
  // outputs.
  isSwitcherOpen = signal(false);

  currentCompanyName = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    const profile = this.authService.userProfileSignal();
    return mem?.company?.name || profile?.company?.name || this.translocoService.translate('shared.miEmpresa');
  });

  currentCompanyLogo = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    return mem?.company?.logo_url;
  });

  currentCompanyColors = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    const settings = mem?.company?.settings || {};
    const branding = settings.branding || {};
    return {
      primary: branding.primary_color || branding.primary || settings.primaryColor || '#3B82F6',
      secondary:
        branding.secondary_color || branding.secondary || settings.secondaryColor || '#10B981',
    };
  });

  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;
  /**
   * Reactive window.innerWidth — toSignal auto-unsubscribes the fromEvent
   * stream when the component is destroyed, so no manual cleanup needed.
   * Feeds isMobileSignal below so sub-components (mobile-overlay) re-render
   * when the viewport crosses the 768px breakpoint on desktop.
   */
  readonly innerWidth = toSignal(
    fromEvent(window, 'resize').pipe(
      map(() => window.innerWidth),
      startWith(window.innerWidth),
    ),
    { initialValue: window.innerWidth },
  );

  /**
   * Reactive wrapper around the legacy isMobile() method. The host binding and
   * ngOnInit still call the method directly (which re-evaluates on each CD
   * cycle), but sub-components that need reactivity (e.g. mobile-overlay)
   * consume this signal as @Input() Signal<boolean>.
   *
   * innerWidth() is the reactive source for the viewport branch — the computed
   * re-evaluates on every resize event, so children update correctly when the
   * user crosses the 768px breakpoint on desktop.
   */
  readonly isMobileSignal = computed(
    () => this.pwaService.isMobileDevice() || this.innerWidth() < 768,
  );
  // All menu items (productivos, visibles también en desarrollo)
  // Lucide icons para el template
  readonly icons = {
    Home,
    Users,
    Ticket,
    MessageCircle,
    FileText,
    Receipt,
    TrendingUp,
    Package,
    Wrench,
    Settings,
    Sparkles,
    HelpCircle,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Smartphone,
    Download,
    FileQuestion,
    FileStack,
    Bell,
    Mail,
    Megaphone,
    Shield,
    Calendar,
    LayoutGrid,
  };

  // Notification badge kept in a separate computed so that unreadCount changes
  // do NOT re-trigger the heavy menuItems filtering logic.
  notificationBadge = computed(() => this.notificationsService.unreadCount());

  // NOTIFICATION_ITEM_IDS and WEBMAIL_ITEM_ID are imported from
  // data/sidebar-menu.items and re-used by the nav list (PR 2 territory).
  // Re-exposed as readonly class members so the template type checker can
  // resolve them — Angular templates only see class members, not module-level
  // imports. The shadowed local names just rebind the imported constants.
  readonly WEBMAIL_ITEM_ID = WEBMAIL_ITEM_ID;
  readonly NOTIFICATION_ITEM_IDS = NOTIFICATION_ITEM_IDS;

  // Webmail unread badge
  private mailStore = inject(MailStoreService);
  webmailBadge = computed(() => this.mailStore.totalUnreadMail() || null);

  // Computed menu items based on user role (does NOT depend on notification count).
  // Core items render immediately. Production items appear once modules load.
  // The pure visibility logic lives in MenuVisibilityService — this binding
  // is just a delegation so the template (and any future consumer) can keep
  // calling `menuItems()` as before.
  readonly menuItems = this.menuVisibility.visibleMenuItems;

  ngOnInit() {
    // Auto-collapse on mobile
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    } else {
      // Restore collapsed state from localStorage
      this.sidebarState.loadSavedState();
    }

    // Kick off the async loads the menu depends on (sidebar order, effective
    // modules, permissions matrix). The service owns the allowed-keys signal
    // and exposes `visibleMenuItems` reactively — the parent does not need to
    // track any of this state directly.
    this.menuVisibility.loadSidebarData();
  }

  @HostListener('window:resize', ['$event'])
  onResize(_event: Event) {
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    }
  }

  isMobile(): boolean {
    return this.pwaService.isMobileDevice() || window.innerWidth < 768;
  }

  toggleSidebar() {
    if (this.isMobile()) {
      // En mobile: abrir/cerrar completamente
      this.sidebarState.toggleOpen();
    } else {
      // En desktop: colapsar/expandir
      this.sidebarState.toggleCollapse();
    }
  }

  closeSidebar() {
    this.sidebarState.setOpen(false);
  }

  toggleCollapse() {
    if (!this.isMobile()) {
      this.sidebarState.toggleCollapse();
    }
  }
}
