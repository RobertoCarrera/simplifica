import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Injectable({ providedIn: 'root' })
export class MfaStepUpGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean> {
    const area: string = route.data['stepUpArea'];
    if (!area) return true;

    const key = `mfa_stepup_${area}`;
    const MFA_STEPUP_TTL = 30 * 60 * 1000;
    const lastTs = parseInt(sessionStorage.getItem(key) ?? '0', 10);
    if (Date.now() - lastTs < MFA_STEPUP_TTL) return true;

    const { data } = await this.auth.client.auth.mfa.listFactors();
    if (!data?.totp?.length) return true;

    this.router.navigate(['/mfa-verify'], {
      state: { returnTo: state.url, stepUpArea: area },
    });
    return false;
  }
}
