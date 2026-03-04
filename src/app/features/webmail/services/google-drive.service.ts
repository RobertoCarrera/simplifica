import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';

declare let gapi: any;
declare let google: any;

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {

  private pickerApiLoaded = false;
  private supabase = inject(SimpleSupabaseService);

  constructor() { }

  /**
   * Load the Google Picker API script dynamically.
   */
  loadPickerScript(): Promise<void> {
    if (this.pickerApiLoaded && typeof gapi !== 'undefined' && typeof google !== 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Load the overarching gapi library
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.onload = () => {
        // Once gapi is loaded, load the picker component
        gapi.load('picker', { callback: () => {
             this.pickerApiLoaded = true;
             resolve();
        }});
      };
      gapiScript.onerror = () => reject('Failed to load Google API script');
      document.body.appendChild(gapiScript);
    });
  }

  /**
   * Fetch a fresh access token using the Edge Function
   */
  async getAccessToken(): Promise<string> {
    const { data, error } = await this.supabase.getClient().functions.invoke('google-auth', {
      body: { action: 'get-picker-token' }
    }) as any;

    if (error || !data?.access_token) {
      throw new Error(data?.error || 'No se pudo obtener el token de acceso para Google Drive');
    }

    return data.access_token;
  }

  /**
   * Opens the Google Picker modal
   */
  openPicker(accessToken: string, onPicked: (doc: any) => void, onCancel?: () => void) {
    if (!this.pickerApiLoaded || typeof google === 'undefined') {
      console.error('Picker API not loaded');
      return;
    }

    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true);
    const sharedView = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setOwnedByMe(false);
    const uploadView = new google.picker.DocsUploadView();

    const picker = new google.picker.PickerBuilder()
      .addView(docsView)
      .addView(sharedView)
      .addView(google.picker.ViewId.RECENTLY_PICKED)
      .addView(uploadView)
      .setOAuthToken(accessToken)
      .setDeveloperKey(environment.googlePickerApiKey)
      .setLocale('es')
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
           onPicked({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
              url: doc.url, // Useful for linking directly
           });
        } else if (data.action === google.picker.Action.CANCEL) {
           if (onCancel) onCancel();
        }
      })
      .build();

    picker.setVisible(true);
    
    // Fix Google Picker Z-Index issue dynamically
    setTimeout(() => {
        const pickerElements = document.querySelectorAll('.picker-modal-dialog, .picker-modal-dialog-bg');
        pickerElements.forEach((el: any) => {
            el.style.zIndex = '99999';
        });
    }, 100);
  }

  /**
   * Download the file contents via REST API using the access token
   * We download it directly here instead of Edge Function to bypass size limits.
   */
  async downloadFile(fileId: string, accessToken: string, fileName: string, mimeType: string): Promise<File> {
      // For Google Workspace documents (Docs, Sheets, Slides), we need to export them.
      // For binary files (PDFs, Images), we get them via ?alt=media
      const isGoogleWorkspaceType = mimeType.startsWith('application/vnd.google-apps');
      
      let fetchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      
      if (isGoogleWorkspaceType) {
          // Export mapping
          let exportMime = 'application/pdf'; // fallback
          if (mimeType.includes('document')) exportMime = 'application/pdf'; // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          else if (mimeType.includes('spreadsheet')) exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // XLSX
          else if (mimeType.includes('presentation')) exportMime = 'application/pdf'; // PDF for presentations is safest usually
          
          fetchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportMime}`;
          mimeType = exportMime; 
          // Append extensions
          if(exportMime.includes('pdf') && !fileName.endsWith('.pdf')) fileName += '.pdf';
          if(exportMime.includes('spreadsheet') && !fileName.endsWith('.xlsx')) fileName += '.xlsx';
      }

      const response = await fetch(fetchUrl, {
          headers: {
              'Authorization': `Bearer ${accessToken}`
          }
      });

      if (!response.ok) {
          throw new Error(`Error descargando archivo de Drive: ${response.statusText}`);
      }

      const blob = await response.blob();
      return new File([blob], fileName, { type: mimeType });
  }

}
