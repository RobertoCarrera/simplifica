
import { Component, EventEmitter, Output, ViewChild, ElementRef, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-camera-capture',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="fixed inset-0 z-50 bg-black flex flex-col">
      <!-- Header -->
      <div class="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4 bg-gradient-to-b from-black/50 to-transparent">
        <button (click)="close.emit()" class="text-white p-2 rounded-full hover:bg-white/10 transition-colors">
          <i class="fas fa-times text-2xl"></i>
        </button>
        <div class="flex gap-4">
           <!-- Gallery Trigger -->
           <button (click)="fileInput.click()" class="text-white p-2 rounded-full hover:bg-white/10 transition-colors" title="Subir desde Galería">
             <i class="fas fa-image text-2xl"></i>
           </button>
           <!-- Switch Camera -->
           <button *ngIf="hasMultipleCameras()" (click)="switchCamera()" class="text-white p-2 rounded-full hover:bg-white/10 transition-colors">
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
        <div *ngIf="loading() || error()" class="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div class="text-center p-6 max-w-xs">
             <div *ngIf="loading()" class="mb-4">
               <i class="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
             </div>
             <p class="text-white text-lg font-medium mb-2">{{ error() ? 'Error de Cámara' : 'Iniciando Cámara...' }}</p>
             <p class="text-gray-400 text-sm">{{ error() || 'Por favor permite el acceso a la cámara.' }}</p>
             <button *ngIf="error()" (click)="initCamera()" class="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">
               Reintentar
             </button>
          </div>
        </div>

        <!-- Guides -->
        <div class="absolute inset-0 pointer-events-none border-2 border-white/20 m-8 rounded-lg">
            <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/50 rounded-tl-lg"></div>
            <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/50 rounded-tr-lg"></div>
            <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/50 rounded-bl-lg"></div>
            <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/50 rounded-br-lg"></div>
        </div>
      </div>

      <!-- Footer / Controls -->
      <div class="bg-black/80 p-8 pb-12 flex justify-center items-center">
        <button (click)="capture()" [disabled]="loading() || error()" 
          class="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center shadow-lg transform active:scale-95 transition-all">
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
        this.checkCameras();
        this.initCamera();
    }

    ngOnDestroy() {
        this.stopCamera();
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
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
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
            this.error.set('No se pudo acceder a la cámara. Verifica los permisos.');
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
