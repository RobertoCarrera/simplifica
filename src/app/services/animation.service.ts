import { Injectable } from '@angular/core';
import { 
  trigger, 
  state, 
  style, 
  transition, 
  animate, 
  query, 
  stagger,
  keyframes,
  AnimationTriggerMetadata
} from '@angular/animations';

@Injectable({
  providedIn: 'root'
})
export class AnimationService {

  // Animación de entrada suave para elementos
  static fadeInUp: AnimationTriggerMetadata = trigger('fadeInUp', [
    transition(':enter', [
      style({ opacity: 0, transform: 'translateY(20px)' }),
      animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
    ])
  ]);

  // Animación de salida suave
  static fadeOut: AnimationTriggerMetadata = trigger('fadeOut', [
    transition(':leave', [
      animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
    ])
  ]);

  // Animación para listas con stagger
  static staggerList: AnimationTriggerMetadata = trigger('staggerList', [
    transition('* => *', [
      query(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        stagger(50, animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })))
      ], { optional: true })
    ])
  ]);

  // Animación de slide para modales
  static slideInModal: AnimationTriggerMetadata = trigger('slideInModal', [
    transition(':enter', [
      style({ opacity: 0, transform: 'scale(0.9) translateY(-20px)' }),
      animate('250ms cubic-bezier(0.4, 0, 0.2, 1)', 
        style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
    ]),
    transition(':leave', [
      animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', 
        style({ opacity: 0, transform: 'scale(0.9) translateY(-20px)' }))
    ])
  ]);

  // Animación de hover para cards
  static cardHover: AnimationTriggerMetadata = trigger('cardHover', [
    state('normal', style({ transform: 'scale(1)' })),
    state('hovered', style({ transform: 'scale(1.02)' })),
    transition('normal <=> hovered', animate('200ms ease-out'))
  ]);

  // Animación de click/tap para botones
  static buttonPress: AnimationTriggerMetadata = trigger('buttonPress', [
    transition('* => pressed', [
      animate('100ms ease-in', style({ transform: 'scale(0.95)' })),
      animate('100ms ease-out', style({ transform: 'scale(1)' }))
    ])
  ]);

  // Animación para sidebar collapse
  static sidebarCollapse: AnimationTriggerMetadata = trigger('sidebarCollapse', [
    state('expanded', style({ width: '250px' })),
    state('collapsed', style({ width: '60px' })),
    transition('expanded <=> collapsed', animate('300ms cubic-bezier(0.4, 0, 0.2, 1)'))
  ]);

  // Animación de loading spinner
  static loadingSpinner: AnimationTriggerMetadata = trigger('loadingSpinner', [
    transition('* => *', [
      animate('1s linear', keyframes([
        style({ transform: 'rotate(0deg)', offset: 0 }),
        style({ transform: 'rotate(360deg)', offset: 1 })
      ]))
    ])
  ]);

  // Animación de notificaciones toast
  static toastNotification: AnimationTriggerMetadata = trigger('toastNotification', [
    transition(':enter', [
      style({ opacity: 0, transform: 'translateX(100%)' }),
      animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', 
        style({ opacity: 1, transform: 'translateX(0)' }))
    ]),
    transition(':leave', [
      animate('250ms cubic-bezier(0.4, 0, 0.2, 1)', 
        style({ opacity: 0, transform: 'translateX(100%)' }))
    ])
  ]);

  // Animación de progreso de carga
  static progressBar: AnimationTriggerMetadata = trigger('progressBar', [
    transition('* => *', [
      style({ width: '0%' }),
      animate('{{ duration }}ms ease-out', style({ width: '{{ width }}%' }))
    ])
  ]);

  // Animación de entrada desde diferentes direcciones
  static slideInFromDirection: AnimationTriggerMetadata = trigger('slideInFromDirection', [
    transition('void => left', [
      style({ transform: 'translateX(-100%)', opacity: 0 }),
      animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
    ]),
    transition('void => right', [
      style({ transform: 'translateX(100%)', opacity: 0 }),
      animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
    ]),
    transition('void => top', [
      style({ transform: 'translateY(-100%)', opacity: 0 }),
      animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
    ]),
    transition('void => bottom', [
      style({ transform: 'translateY(100%)', opacity: 0 }),
      animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
    ])
  ]);

  // Animación de slide simple
  static slideIn: AnimationTriggerMetadata = trigger('slideIn', [
    transition(':enter', [
      style({ transform: 'translateX(-20px)', opacity: 0 }),
      animate('250ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
    ])
  ]);

  // Obtener todas las animaciones como array
  static getAllAnimations(): AnimationTriggerMetadata[] {
    return [
      this.fadeInUp,
      this.fadeOut,
      this.staggerList,
      this.slideInModal,
      this.cardHover,
      this.buttonPress,
      this.sidebarCollapse,
      this.loadingSpinner,
      this.toastNotification,
      this.progressBar,
      this.slideInFromDirection,
      this.slideIn
    ];
  }
}
