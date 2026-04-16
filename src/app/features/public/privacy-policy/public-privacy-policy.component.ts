import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SupabaseClientService } from '../../../services/supabase-client.service';

@Component({
  selector: 'app-public-privacy-policy',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (isLoading()) {
      <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    } @else if (policyHtml()) {
      <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 dark:text-gray-100"
             [innerHTML]="policyHtml()">
        </div>
      </div>
    } @else {
      <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div class="max-w-md w-full text-center">
          <p class="text-gray-500 dark:text-gray-400 mb-4">
            La política de privacidad de esta empresa no está disponible.
          </p>
          <a routerLink="/" class="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            Volver al inicio
          </a>
        </div>
      </div>
    }
  `,
})
export class PublicPrivacyPolicyComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private sbClient = inject(SupabaseClientService);

  isLoading = signal(true);
  policyHtml = signal<SafeHtml | null>(null);

  async ngOnInit(): Promise<void> {
    const companyId = this.route.snapshot.paramMap.get('companyId');
    if (!companyId) {
      this.isLoading.set(false);
      return;
    }

    try {
      const { data } = await this.sbClient.instance.rpc('get_company_privacy_policy', {
        p_company_id: companyId,
      });

      if (data) {
        this.policyHtml.set(this.sanitizer.bypassSecurityTrustHtml(data as string));
      }
    } catch {
      // content stays null — fallback UI renders
    } finally {
      this.isLoading.set(false);
    }
  }
}
