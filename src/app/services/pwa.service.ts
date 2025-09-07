import { Injectable, NgZone, signal, computed } from '@angular/core';
import { fromEvent, BehaviorSubject } from 'rxjs';

export interface PWAInstallPrompt {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isPWA: boolean;
  isOnline: boolean;
  screenSize: 'sm' | 'md' | 'lg' | 'xl';
}

@Injectable({
  providedIn: 'root'
})
export class PWAService {
  private deferredPrompt: PWAInstallPrompt | null = null;
  private _isOnline = signal(navigator.onLine);
  private _deviceInfo = signal<DeviceInfo>(this.detectDevice());

  // Public signals
  readonly isOnline = this._isOnline.asReadonly();
  readonly deviceInfo = this._deviceInfo.asReadonly();
  readonly canInstall = signal(false);
  readonly isInstalled = signal(this.isPWAInstalled());

  // Computed values
  readonly isMobileDevice = computed(() => this.deviceInfo().isMobile || this.deviceInfo().isTablet);
  readonly shouldShowMobileOptimizations = computed(() => 
    this.isMobileDevice() || this.deviceInfo().screenSize === 'sm'
  );

  constructor(private ngZone: NgZone) {
    this.setupEventListeners();
    this.monitorNetworkStatus();
    this.updateScreenSize();
  }

  private setupEventListeners(): void {
    // PWA Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as any;
      this.canInstall.set(true);
    });

    // PWA Install success
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.canInstall.set(false);
      this.deferredPrompt = null;
    });

    // Screen orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateScreenSize(), 100);
    });

    // Window resize
    window.addEventListener('resize', () => this.updateScreenSize());
  }

  private monitorNetworkStatus(): void {
    fromEvent(window, 'online').subscribe(() => {
      this.ngZone.run(() => this._isOnline.set(true));
    });

    fromEvent(window, 'offline').subscribe(() => {
      this.ngZone.run(() => this._isOnline.set(false));
    });
  }

  private detectDevice(): DeviceInfo {
    const userAgent = navigator.userAgent;
    const screen = window.screen;
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent) || 
                    (screen.width >= 768 && screen.width <= 1024);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);
    
    return {
      isMobile: isMobile && !isTablet,
      isTablet,
      isDesktop: !isMobile && !isTablet,
      isIOS,
      isAndroid,
      isPWA: this.isPWAInstalled(),
      isOnline: navigator.onLine,
      screenSize: this.getScreenSize()
    };
  }

  private getScreenSize(): 'sm' | 'md' | 'lg' | 'xl' {
    const width = window.innerWidth;
    if (width < 640) return 'sm';
    if (width < 768) return 'md';
    if (width < 1024) return 'lg';
    return 'xl';
  }

  private updateScreenSize(): void {
    this._deviceInfo.update(info => ({
      ...info,
      screenSize: this.getScreenSize()
    }));
  }

  private isPWAInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }

  async installPWA(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        this.canInstall.set(false);
        this.deferredPrompt = null;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error installing PWA:', error);
      return false;
    }
  }

  // Cache management
  async clearCache(): Promise<void> {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      const cacheNames = await caches.keys();
      let totalSize = 0;

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        for (const key of keys) {
          const response = await cache.match(key);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }

      return totalSize;
    } catch (error) {
      console.error('Error calculating cache size:', error);
      return 0;
    }
  }

  // Vibration API (mobile)
  vibrate(pattern: number | number[]): boolean {
    if ('vibrate' in navigator) {
      return navigator.vibrate(pattern);
    }
    return false;
  }

  // Share API
  async share(data: ShareData): Promise<boolean> {
    if ('share' in navigator) {
      try {
        await navigator.share(data);
        return true;
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
    return false;
  }

  // Battery API
  async getBatteryInfo(): Promise<any> {
    if ('getBattery' in navigator) {
      try {
        return await (navigator as any).getBattery();
      } catch (error) {
        console.error('Error getting battery info:', error);
      }
    }
    return null;
  }

  // Wake Lock API (prevent screen sleep)
  async requestWakeLock(): Promise<any> {
    if ('wakeLock' in navigator) {
      try {
        return await (navigator as any).wakeLock.request('screen');
      } catch (error) {
        console.error('Error requesting wake lock:', error);
      }
    }
    return null;
  }
}
