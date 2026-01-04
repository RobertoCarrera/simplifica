import { Routes } from '@angular/router';
import { WebmailLayoutComponent } from './webmail-layout/webmail-layout.component';
import { MessageListComponent } from './components/message-list/message-list.component';
import { MessageDetailComponent } from './components/message-detail/message-detail.component';

export const WEBMAIL_ROUTES: Routes = [
    {
        path: '',
        component: WebmailLayoutComponent,
        children: [
            { path: '', redirectTo: 'inbox', pathMatch: 'full' },
            {
                path: 'composer',
                loadComponent: () => import('./components/message-composer/message-composer.component').then(m => m.MessageComposerComponent),
                data: { title: 'Redactar' }
            },
            {
                path: 'settings',
                loadComponent: () => import('./components/settings/webmail-settings.component').then(m => m.WebmailSettingsComponent),
                data: { title: 'Configuración' }
            },
            {
                path: 'thread/:threadId',
                component: MessageDetailComponent
            },
            {
                path: ':folderPath', // e.g. 'inbox', 'sent', or 'custom-folder-id'
                component: MessageListComponent
            }
        ]
    }
];
