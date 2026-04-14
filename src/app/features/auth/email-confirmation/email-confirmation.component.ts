import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { AuthService } from "../../../services/auth.service";

import { Subscription } from "rxjs";

@Component({
  selector: "app-email-confirmation",
  standalone: true,
  imports: [],
  template: `
    <div
      class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8"
    >
      <div class="max-w-md w-full space-y-8">
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Confirmación de Email
          </h2>
        </div>

        @if (isLoading) {
          <div class="text-center">
            <div
              class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"
            ></div>
            <p class="mt-4 text-gray-600">Confirmando tu cuenta...</p>
          </div>
        }

        @if (isSuccess && !requiresInvitationApproval) {
          <div class="text-center">
            <div
              class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100"
            >
              <svg
                class="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">
              ¡Cuenta Confirmada!
            </h3>
            <p class="mt-2 text-gray-600">
              Tu email ha sido verificado exitosamente. Tu empresa y perfil han
              sido creados.
            </p>
            <div class="mt-6">
              <button
                (click)="goToDashboard()"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Ir al Dashboard
              </button>
            </div>
          </div>
        }

        @if (isError) {
          <div class="text-center">
            <div
              class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100"
            >
              <svg
                class="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">
              Error de Confirmación
            </h3>
            <p class="mt-2 text-gray-600">{{ errorMessage }}</p>
            <div class="mt-6 space-y-4">
              <button
                (click)="resendConfirmation()"
                [disabled]="isResending"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
              >
                {{
                  isResending ? "Enviando..." : "Reenviar Email de Confirmación"
                }}
              </button>
              <button
                (click)="goToRegister()"
                class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Volver al Registro
              </button>
            </div>
          </div>
        }

        @if (
          !isLoading && !isSuccess && !isError && !hasToken && !pendingByGuard
        ) {
          <div class="text-center">
            <div
              class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100"
            >
              <svg
                class="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                ></path>
              </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">
              Revisa tu Email
            </h3>
            <p class="mt-2 text-gray-600">
              Hemos enviado un enlace de confirmación a tu correo electrónico.
              Haz clic en el enlace para activar tu cuenta.
            </p>
            <p class="mt-2 text-sm text-gray-500">
              Si no lo encuentras, revisa tu carpeta de spam.
            </p>
          </div>
        }
      </div>
    </div>
  `,
})
export class EmailConfirmationComponent implements OnInit, OnDestroy {
  isLoading = false;
  isSuccess = false;
  isError = false;
  isResending = false;
  hasToken = false;
  pendingByGuard = false;
  errorMessage = "";
  requiresInvitationApproval = false;
  private sub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.sub = this.authService.userProfile$.subscribe((profile) => {
      if (profile && profile.active) {
        const hasPending =
          this.route.snapshot.queryParamMap.get("pending") === "1";
        if (hasPending || !this.hasToken) {
          this.router.navigate(["/dashboard"]);
        }
      }
    });

    this.pendingByGuard =
      this.route.snapshot.queryParamMap.get("pending") === "1" &&
      !this.hasToken;

    this.route.fragment.subscribe((fragment) => {
      if (fragment) {
        this.hasToken = true;
        this.handleEmailConfirmation(fragment);
      }
    });

    this.route.queryParams.subscribe((params) => {
      if (params["token"] || params["type"]) {
        this.hasToken = true;
        this.handleEmailConfirmation(window.location.hash.substring(1));
      }
    });
  }

  private async handleEmailConfirmation(fragmentOrParams: string) {
    this.isLoading = true;
    this.isError = false;

    try {
      const result = await this.authService.confirmEmail(fragmentOrParams);

      if (result.success) {
        if (result.requiresInvitationApproval) {
          this.requiresInvitationApproval = true;
        } else {
          this.isSuccess = true;
        }
      } else {
        this.isError = true;
        this.errorMessage =
          result.error || "Error desconocido durante la confirmación";
      }
    } catch (error: any) {
      this.isError = true;
      this.errorMessage = error.message || "Error de conexión";
    } finally {
      this.isLoading = false;
    }
  }

  async resendConfirmation() {
    this.isResending = true;
    try {
      const result = await this.authService.resendConfirmation();
      if (result.success) {
        alert("Email de confirmación reenviado. Revisa tu bandeja de entrada.");
      } else {
        alert("Error al reenviar: " + result.error);
      }
    } catch (error) {
      alert("Error al reenviar email de confirmación");
    } finally {
      this.isResending = false;
    }
  }

  goToDashboard() {
    this.router.navigate(["/dashboard"]);
  }

  goToRegister() {
    this.router.navigate(["/register"]);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
