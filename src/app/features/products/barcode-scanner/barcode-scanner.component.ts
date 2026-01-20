
import { Component, EventEmitter, Output, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Html5QrcodeScanner } from 'html5-qrcode';

@Component({
    selector: 'app-barcode-scanner',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './barcode-scanner.component.html',
    styleUrls: ['./barcode-scanner.component.scss']
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
    @Output() scanSuccess = new EventEmitter<string>();
    @Output() close = new EventEmitter<void>();

    private scanner: Html5QrcodeScanner | null = null;

    ngAfterViewInit() {
        this.initScanner();
    }

    ngOnDestroy() {
        this.stopScanner();
    }

    private initScanner() {
        // Configuración del escáner
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        // 'reader' is the id of the HTML element
        this.scanner = new Html5QrcodeScanner("reader", config, false);

        this.scanner.render(
            (decodedText, decodedResult) => {
                // Success callback
                this.scanSuccess.emit(decodedText);
                this.stopScanner(); // Stop after successful scan? Optional.
            },
            (errorMessage) => {
                // Error callback (called freqently, ignore generally)
            }
        );
    }

    stopScanner() {
        if (this.scanner) {
            this.scanner.clear().catch(error => {
                console.error("Failed to clear html5-qrcode scanner. ", error);
            });
            this.scanner = null;
        }
    }

    onClose() {
        this.close.emit();
    }
}
