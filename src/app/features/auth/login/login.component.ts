import { Component, inject, signal, OnDestroy, OnInit } from "@angular/core";

import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { Router, ActivatedRoute, RouterModule } from "@angular/router";
import { AuthService } from "../../../services/auth.service";
import { ToastService } from "../../../services/toast.service";
import { TranslocoPipe } from "@jsverse/transloco";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [ReactiveFormsModule, RouterModule, TranslocoPipe],
  template: `
    <div class="login-shell">
      <div class="brand-side d-none d-lg-flex flex-column text-white">
        <div class="brand-content">
          <div class="brand-top">
            <div class="logo-circle"><i class="bi bi-gear-fill"></i></div>
            <h1>Simplifica</h1>
            <p class="subtitle">{{ "login.subtitle" | transloco }}</p>
          </div>
          <ul class="feature-list">
            <li>
              <i class="bi bi-check2-circle"></i>
              {{ "login.feature1" | transloco }}
            </li>
            <li>
              <i class="bi bi-check2-circle"></i>
              {{ "login.feature2" | transloco }}
            </li>
            <li>
              <i class="bi bi-check2-circle"></i>
              {{ "login.feature3" | transloco }}
            </li>
            <li>
              <i class="bi bi-check2-circle"></i>
              {{ "login.feature4" | transloco }}
            </li>
          </ul>
          <div class="footer-note">© {{ currentYear }} Simplifica</div>
        </div>
      </div>

      <div class="form-side flex flex-col justify-center">
        <div class="form-wrapper mx-auto w-full">
          <div class="mobile-header text-center lg:hidden">
            <div class="logo-circle small"><i class="bi bi-gear-fill"></i></div>
            <h2>Simplifica</h2>
            <p class="subtitle">{{ "login.mobileSubtitle" | transloco }}</p>
          </div>
          <h3 class="form-title">{{ "login.formTitle" | transloco }}</h3>

          @if (loginMode === "email") {
            <div class="animate-fadeIn">
              <form
                [formGroup]="loginForm"
                (ngSubmit)="onEmailSubmit()"
                novalidate
              >
                <div class="mb-4">
                  <label class="form-label">{{
                    "login.emailLabel" | transloco
                  }}</label>
                  <div class="input-wrapper" [class.invalid]="emailInvalid()">
                    <i class="bi bi-at"></i>
                    <input
                      type="email"
                      placeholder="tu@empresa.com"
                      formControlName="email"
                      (blur)="loginForm.get('email')?.markAsTouched()"
                    />
                  </div>
                  @if (emailInvalid()) {
                    <div class="field-error">
                      {{ "login.emailError" | transloco }}
                    </div>
                  }
                </div>
                <button
                  class="w-full flex justify-center items-center py-3 px-4 mb-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50"
                  type="button"
                  (click)="onEmailSubmit()"
                  [disabled]="
                    loginForm.get('email')?.invalid ||
                    loading() ||
                    cooldownRemaining() > 0
                  "
                >
                  <i class="bi bi-magic mr-2"></i>
                  @if (loading()) {
                    <span
                      class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"
                    ></span>
                    {{ "login.sending" | transloco }}
                  } @else if (cooldownRemaining() > 0) {
                    {{
                      "login.resendIn"
                        | transloco: { seconds: cooldownRemaining() }
                    }}
                  } @else {
                    {{ "login.sendMagicLink" | transloco }}
                  }
                </button>
              </form>
            </div>
          }

          @if (errorMessage()) {
            <div
              class="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800 flex items-center"
            >
              <i class="bi bi-exclamation-triangle mr-2"></i
              >{{ errorMessage() }}
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        width: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      .login-shell {
        height: 100vh;
        width: 100%;
        display: flex;
        background: #ffffff;
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          sans-serif;
        overflow: hidden;
      }

      /* Brand Panel */
      .brand-side {
        flex: 1.2;
        background: linear-gradient(
          145deg,
          #1e40af 0%,
          #1e3a8a 40%,
          #1e40af 100%
        );
        position: relative;
        overflow: hidden;
        padding: 3rem 2.5rem;
      }
      .brand-side::before {
        content: "";
        position: absolute;
        top: -50%;
        right: -30%;
        width: 100%;
        height: 200%;
        background: radial-gradient(
          circle,
          rgba(255, 255, 255, 0.08) 0%,
          transparent 70%
        );
        pointer-events: none;
      }
      .brand-content {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        z-index: 1;
      }
      .brand-top {
        margin-bottom: 2rem;
      }
      .logo-circle {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        backdrop-filter: blur(8px);
        margin-bottom: 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      .logo-circle.small {
        width: 48px;
        height: 48px;
        font-size: 1.4rem;
        margin-bottom: 1rem;
        margin-left: auto;
        margin-right: auto;
      }
      .brand-side h1 {
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 0.75rem;
        color: white;
      }
      .subtitle {
        font-size: 1.05rem;
        opacity: 0.9;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
      }
      .feature-list {
        list-style: none;
        padding: 0;
        margin: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1rem;
      }
      .feature-list li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.95rem;
        opacity: 0.95;
        color: white;
      }
      .feature-list i {
        color: #10b981;
        font-size: 1.1rem;
      }
      .footer-note {
        font-size: 0.8rem;
        opacity: 0.7;
        text-align: center;
        color: rgba(255, 255, 255, 0.7);
        margin-top: 1rem;
      }

      /* Form Panel */
      .form-side {
        flex: 1;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1.5rem;
        overflow-y: auto;
      }
      .form-wrapper {
        width: 100%;
        max-width: 400px;
        padding: 2.5rem 2rem 2rem;
        background: white;
        border-radius: 24px;
        box-shadow:
          0 10px 40px -12px rgba(0, 0, 0, 0.15),
          0 4px 16px -8px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(0, 0, 0, 0.05);
      }
      .mobile-header {
        margin-bottom: 2rem;
      }
      .mobile-header h2 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.75rem 0 0.5rem;
        color: #1e293b;
      }
      .mobile-header .subtitle {
        color: #64748b;
        font-size: 0.9rem;
        margin: 0;
      }
      .form-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 1.75rem;
      }

      /* Form Elements */
      .form-label {
        font-weight: 600;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #64748b;
        margin-bottom: 0.5rem;
        display: block;
      }
      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        background: #fff;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        padding: 0.875rem 1rem;
        gap: 0.75rem;
        transition: all 0.2s ease;
        margin-bottom: 0.5rem;
      }
      .input-wrapper.invalid {
        border-color: #ef4444;
        background: #fef2f2;
      }
      .input-wrapper:focus-within {
        border-color: #3b82f6;
        background: #f8fafc;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      .input-wrapper i {
        font-size: 1.1rem;
        color: #94a3b8;
        flex-shrink: 0;
      }
      .input-wrapper input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        font-size: 1rem;
        font-weight: 500;
        color: #1e293b;
      }
      .input-wrapper input::placeholder {
        color: #94a3b8;
        font-weight: 400;
      }
      .field-error {
        font-size: 0.75rem;
        color: #ef4444;
        margin-top: 0.25rem;
        font-weight: 500;
      }

      /* PWA & Mobile Optimizations */
      @media (max-width: 991px) {
        .login-shell {
          flex-direction: column;
        }
        .brand-side {
          display: none !important;
        }
        .form-side {
          flex: 1;
          padding: 1.5rem 1rem;
          background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
        }
        .form-wrapper {
          padding: 2rem 1.5rem;
          border-radius: 20px;
          max-width: 360px;
          margin-top: 1rem;
          margin-bottom: 1rem;
        }
      }
      @media (max-width: 480px) {
        .form-side {
          padding: 1rem 0.75rem;
        }
        .form-wrapper {
          padding: 1.75rem 1.25rem;
          border-radius: 16px;
          box-shadow: 0 4px 20px -8px rgba(0, 0, 0, 0.15);
        }
        .form-title {
          font-size: 1.25rem;
        }
        .mobile-header h2 {
          font-size: 1.5rem;
        }
      }

      @media (prefers-color-scheme: dark) {
        .login-shell {
          background: #0f172a;
        }
        .form-side {
          background: #0f172a;
        }
        .form-wrapper {
          background: #1e293b;
          border-color: #334155;
          box-shadow: 0 10px 40px -12px rgba(0, 0, 0, 0.4);
        }
        .form-title,
        .mobile-header h2 {
          color: #f1f5f9;
        }
        .mobile-header .subtitle {
          color: #94a3b8;
        }
        .form-label {
          color: #94a3b8;
        }
        .input-wrapper {
          background: #0f172a !important;
          border-color: #475569 !important;
        }
        .input-wrapper i {
          color: #64748b;
        }
        .input-wrapper input {
          color: #f1f5f9 !important;
          background: transparent !important;
          border: none !important;
        }
        .input-wrapper input::placeholder {
          color: #64748b !important;
        }
        .small {
          color: #94a3b8;
        }
        .alert-error {
          background: #450a0a;
          color: #fca5a5;
          border-color: #7f1d1d;
        }
        .logo-circle {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.3);
          color: #60a5fa;
        }
      }
    `,
  ],
})
export class LoginComponent implements OnDestroy, OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);

  // Signals
  loading = signal(false);
  errorMessage = signal("");
  currentYear = 2026;

  loginMode: "email" = "email";
  currentMethod = signal<"passkey" | "magic" | null>(null);
  cooldownRemaining = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    document.body.classList.add("auth-page");
  }

  ngOnInit() {
    // Manejar mensajes del callback de auth (cuenta confirmada, etc.)
    this.route.queryParams.subscribe((params) => {
      if (params["message"] === "account_may_be_confirmed") {
        this.toastService.info(
          "Tu cuenta puede estar ya confirmada",
          "Intenta hacer login",
        );
        if (params["email"]) {
          this.loginForm.patchValue({ email: params["email"] });
        }
      }

      // Mensaje de éxito al crear contraseña desde invitación
      if (
        params["message"] &&
        params["message"].includes("Contraseña creada")
      ) {
        this.toastService.success(params["message"], "Bienvenido");
        if (params["email"]) {
          this.loginForm.patchValue({ email: params["email"] });
        }
      }
    });
  }

  ngOnDestroy() {
    document.body.classList.remove("auth-page");
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  // Forms
  loginForm = this.fb.group({
    email: ["", [Validators.required, Validators.email]],
  });

  // Validation
  emailInvalid = () => {
    const control = this.loginForm.get("email");
    return control?.invalid && control?.touched;
  };

  async onEmailSubmit() {
    // Guard: prevent double-submission
    if (this.loading() || this.cooldownRemaining() > 0) return;

    if (this.loginForm.get("email")?.invalid) {
      this.loginForm.get("email")?.markAsTouched();
      return;
    }

    const email = this.loginForm.get("email")?.value;
    if (!email) return;

    this.currentMethod.set("magic");
    this.loading.set(true);
    this.errorMessage.set("");

    try {
      const result = await this.authService.signInWithMagicLink(email);
      if (result.success) {
        this.toastService.info(
          "Revisa tu bandeja de entrada",
          "Enlace enviado",
        );
        this.startCooldown();
      } else {
        this.errorMessage.set(result.error || "Error al enviar enlace mágico");
      }
    } catch (e) {
      this.errorMessage.set("Error inesperado al solicitar acceso.");
    } finally {
      this.loading.set(false);
    }
  }

  private startCooldown() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }
    this.cooldownRemaining.set(60);
    this.cooldownTimer = setInterval(() => {
      const remaining = this.cooldownRemaining();
      if (remaining <= 1) {
        this.cooldownRemaining.set(0);
        clearInterval(this.cooldownTimer!);
        this.cooldownTimer = null;
      } else {
        this.cooldownRemaining.set(remaining - 1);
      }
    }, 1000);
  }
}
