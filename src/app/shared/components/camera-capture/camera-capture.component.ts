
import { Component, EventEmitter, Output, ViewChild, ElementRef, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-camera-capture',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-[99999] bg-black flex flex-col">
      <!-- Header -->
      <div class="absolute top-0 left-0 right-0 z-[60] flex justify-between items-center p-4 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
        <button (click)="close.emit()" class="pointer-events-auto text-white p-3 rounded-full bg-black/20 backdrop-blur-md hover:bg-white/10 transition-colors" title="Cerrar">
          <i class="fas fa-times text-2xl"></i>
        </button>
        <div class="flex gap-4 pointer-events-auto">
           <!-- Gallery Trigger -->
           <button (click)="fileInput.click()" class="text-white p-3 rounded-full bg-black/20 backdrop-blur-md hover:bg-white/10 transition-colors" title="Subir desde Galería">
             <i class="fas fa-image text-2xl"></i>
           </button>
           <!-- Switch Camera -->
           <button *ngIf="hasMultipleCameras()" (click)="switchCamera()" class="text-white p-3 rounded-full bg-black/20 backdrop-blur-md hover:bg-white/10 transition-colors" title="Cambiar cámara">
             <i class="fas fa-sync-alt text-2xl"></i>
           </button>
        </div>
      </div>

      <!-- Hidden Input for Gallery -->
      <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)">

      <!-- Camera Preview -->
      <div class="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        <video #videoElement autoplay playsinline muted class="w-full h-full object-cover"></video>
        
        <!-- Loading / Permission State -->
        <div *ngIf="loading() || error()" class="absolute inset-0 flex items-center justify-center bg-black/90 z-50 px-6">
          <div class="text-center max-w-sm">
             <div *ngIf="loading()" class="mb-6">
               <i class="fas fa-circle-notch fa-spin text-5xl text-blue-500"></i>
             </div>
             
             <div *ngIf="error()" class="mb-6">
                <i class="fas fa-exclamation-triangle text-5xl text-yellow-500 mb-4"></i>
             </div>

             <h3 class="text-white text-xl font-bold mb-3">{{ error() ? 'No se puede acceder a la cámara' : 'Iniciando Cámara...' }}</h3>
             
             <p class="text-gray-300 text-base mb-6 leading-relaxed">
                {{ error() || 'Por favor permite el acceso a la cámara.' }}
             </p>

             <div *ngIf="error()" class="flex flex-col gap-3">
                 <button (click)="initCamera()" class="px-6 py-3 bg-blue-600 active:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                   Reintentar
                 </button>
                 <button (click)="fileInput.click()" class="px-6 py-3 bg-gray-700 active:bg-gray-600 text-white rounded-xl font-medium transition-colors">
                   <i class="fas fa-image mr-2"></i> Usar Galería en su lugar
                 </button>
                 <button (click)="close.emit()" class="px-6 py-3 text-gray-400 hover:text-white transition-colors">
                   Cancelar
                 </button>
             </div>
          </div>
        </div>

        <!-- Guides -->
        <div *ngIf="!error() && !loading()" class="absolute inset-0 pointer-events-none border-2 border-white/20 m-8 rounded-2xl z-10">
            <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/50 rounded-tl-xl"></div>
            <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/50 rounded-tr-xl"></div>
            <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/50 rounded-bl-xl"></div>
            <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/50 rounded-br-xl"></div>
        </div>
      </div>

      <!-- Footer / Controls -->
      <div class="bg-black/80 p-8 pb-12 flex justify-center items-center z-40">
        <button (click)="capture()" [disabled]="loading() || error()" 
          class="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center shadow-lg transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          <div class="w-16 h-16 bg-white rounded-full"></div>
        </button>
      </div>
      
      <!-- Canvas for capture (hidden) -->
      <canvas #canvasElement class="hidden"></canvas>
    </div>
  `
})
export class CameraCaptureComponent implements OnDestroy {
  @Output() imageCaptured = new EventEmitter<File>();
  @Output() close = new EventEmitter<void>();

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  stream: MediaStream | null = null;
  loading = signal(true);
  error = signal<string | null>(null);
  currentFacingMode: 'user' | 'environment' = 'environment';
  hasMultipleCameras = signal(false);

  ngAfterViewInit() {
    this.checkContextAndInit();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async checkContextAndInit() {
    // Check for Secure Context (HTTPS or localhost)
    if (!window.isSecureContext) {
      this.loading.set(false);
      this.error.set('Seguridad del Navegador: La cámara requiere acceso HTTPS o Localhost. Si estás probando en móvil por IP, esto no funcionará. Usa la opción "Usar Galería".');
      return;
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.loading.set(false);
      this.error.set('Tu navegador no soporta acceso a la cámara. Intenta usar otro navegador o subir desde galería.');
      return;
    }

    await this.checkCameras();
    this.initCamera();
  }

  async checkCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      this.hasMultipleCameras.set(cameras.length > 1);
    } catch (e) {
      console.warn('Error checking cameras:', e);
    }
  }

  async initCamera() {
    this.loading.set(true);
    this.error.set(null);
    this.stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: this.currentFacingMode,
          // Removed ideal width/height to let browser decide best fit for mobile
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.videoElement.nativeElement.onloadedmetadata = () => {
          this.videoElement.nativeElement.play();
          this.loading.set(false);
        };
      }
    } catch (err: any) {
      console.error('Camera init error:', err);

      let msg = 'No se pudo acceder a la cámara.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permiso denegado. Por favor permite el acceso a la cámara en la configuración de tu navegador.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No se encontró ninguna cámara en el dispositivo.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'La cámara está siendo usada por otra aplicación.';
      }

      this.error.set(msg);
      this.loading.set(false);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  switchCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    this.initCamera();
  }

  capture() {
    if (!this.videoElement?.nativeElement || !this.canvasElement?.nativeElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;

    // Set canvas dimensions to match video stream
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (context) {
      // Optional: Mirror if user facing? Usually not needed for result analysis
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          this.imageCaptured.emit(file);
          this.close.emit(); // Auto-close after capture? Or maybe preview? Let's just emit and close for speed.
        }
      }, 'image/jpeg', 0.9);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.imageCaptured.emit(input.files[0]);
      this.close.emit();
    }
  }
}
