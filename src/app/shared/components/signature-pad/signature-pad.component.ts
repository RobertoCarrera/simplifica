import { Component, ElementRef, ViewChild, AfterViewInit, Output, EventEmitter, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import SignaturePad from 'signature_pad';

@Component({
    selector: 'app-signature-pad',
    standalone: true,
    imports: [CommonModule],
  template: `
    <div class="signature-container border border-gray-300 rounded-lg bg-white relative">
      <canvas #canvas class="w-full h-full touch-none rounded-lg cursor-crosshair"></canvas>
      
      <div *ngIf="isEmpty && !hasInitialSignature" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span class="text-gray-300 text-lg font-handwriting select-none">Firmar aquí</span>
        <span class="text-gray-300 text-xs mt-1">Usa todo el alto para que la firma no quede pequeña</span>
      </div>
      <div *ngIf="isEmpty && hasInitialSignature" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span class="text-gray-400 text-sm">Firma actual - haz clic en Borrar para eliminarla</span>
        <span class="text-gray-400 text-xs mt-1">O dibuja una nueva encima</span>
      </div>

      <div class="absolute bottom-2 right-2 flex gap-2">
        <button *ngIf="!isEmpty || hasInitialSignature" 
                (click)="clear()" 
                class="text-xs text-gray-500 hover:text-red-500 bg-white/80 p-1 px-2 rounded border border-gray-200 shadow-sm transition-colors">
          Borrar
        </button>
      </div>
    </div>
  `,
    styles: [`
    .signature-container {
      height: 200px;
      width: 100%;
    }
    .font-handwriting {
      font-family: 'Courier New', Courier, monospace; /* Placeholder style */
    }
  `]
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
    @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
    @Output() signatureChange = new EventEmitter<string | null>();
    @Input() penColor = 'rgb(0, 0, 0)';
    
    private _initialSignature: string | null = null;
    private _hasInitialSignature = false;
    hasInitialSignature = false;

    get initialSignature(): string | null {
        return this._initialSignature;
    }

    @Input() set initialSignature(data: string | null) {
        this._initialSignature = data;
        this._hasInitialSignature = !!data;
        this.hasInitialSignature = !!data;
        if (data && this.signaturePad) {
            this.loadSignature(data);
        }
    }

    private signaturePad: SignaturePad | null = null;
    private resizeObserver: ResizeObserver | null = null;
    isEmpty = true;

    ngAfterViewInit() {
        this.initSignaturePad();
    }

    ngOnDestroy() {
        if (this.signaturePad) {
            this.signaturePad.off();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }

    private initSignaturePad() {
        const canvas = this.canvasRef.nativeElement;
        this.signaturePad = new SignaturePad(canvas, {
            penColor: this.penColor,
            backgroundColor: 'rgba(255, 255, 255, 0)' // Transparent
        });

        // Set up resize observer first
        this.initResizeObserver();
        
        // Resize canvas (which also clears)
        this.resizeCanvas();
        
        // Now load initial signature if provided
        if (this._initialSignature) {
            this.loadSignature(this._initialSignature);
        }

        this.signaturePad.addEventListener('endStroke', () => {
            this.updateSignatureStatus();
        });
    }

    private initResizeObserver() {
        this.resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
        });
        this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
    }

    private resizeCanvas() {
        const canvas = this.canvasRef.nativeElement;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);

        // Get parent width/height
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth * ratio;
            canvas.height = parent.clientHeight * ratio;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(ratio, ratio);
        }

        // Clear signature when resizing as coordinate mapping changes
        // Alternatively we could save data and redraw, but clearing is safer for now
        this.clear();
    }

    clear() {
        if (this.signaturePad) {
            this.signaturePad.clear();
            this.updateSignatureStatus();
        }
    }

    private updateSignatureStatus() {
        if (!this.signaturePad) return;

        this.isEmpty = this.signaturePad.isEmpty();
        if (this.isEmpty) {
            this.signatureChange.emit(null);
        } else {
            this.signatureChange.emit(this.signaturePad.toDataURL()); // Base64 PNG
        }
    }

    getSignatureData(): string | null {
        if (this.signaturePad && !this.signaturePad.isEmpty()) {
            return this.signaturePad.toDataURL();
        }
        return null;
    }

    private loadSignature(dataUrl: string) {
        console.log('[SignaturePad] Loading signature, signaturePad exists:', !!this.signaturePad);
        if (this.signaturePad) {
            try {
                this.signaturePad.fromDataURL(dataUrl);
                console.log('[SignaturePad] Signature loaded, isEmpty:', this.signaturePad.isEmpty());
                this.updateSignatureStatus();
            } catch (e) {
                console.error('Error loading signature:', e);
            }
        }
    }
}
