import { 
  Directive, 
  ElementRef, 
  Input, 
  OnInit, 
  OnDestroy, 
  inject,
  HostListener,
  Renderer2 
} from '@angular/core';
import { AnimationService, MicroAnimationType } from '../services/animation.service';

@Directive({
  selector: '[appSmoothTransition]',
  standalone: true
})
export class SmoothTransitionDirective implements OnInit, OnDestroy {
  @Input() appSmoothTransition: MicroAnimationType = 'fadeIn';
  @Input() transitionDuration: number = 300;
  @Input() transitionDelay: number = 0;
  @Input() hoverEffect: boolean = false;
  @Input() clickEffect: boolean = false;
  @Input() triggerOnScroll: boolean = false;

  private element = inject(ElementRef);
  private renderer = inject(Renderer2);
  private animationService = inject(AnimationService);
  
  private intersectionObserver?: IntersectionObserver;
  private hasAnimated = false;

  ngOnInit() {
    this.setupInitialStyles();
    
    if (this.triggerOnScroll) {
      this.setupScrollAnimation();
    } else {
      this.playAnimation();
    }

    if (this.hoverEffect) {
      this.setupHoverEffects();
    }
  }

  ngOnDestroy() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  private setupInitialStyles() {
    // Aplicar estilos iniciales para la animación
    this.renderer.setStyle(this.element.nativeElement, 'opacity', '0');
    this.renderer.setStyle(this.element.nativeElement, 'transform', 'translateY(20px)');
    this.renderer.setStyle(this.element.nativeElement, 'transition', 'all 0.3s ease-out');
  }

  private setupScrollAnimation() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.hasAnimated) {
            this.playAnimation();
            this.hasAnimated = true;
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px 0px'
      }
    );

    this.intersectionObserver.observe(this.element.nativeElement);
  }

  private async playAnimation() {
    if (this.animationService.isReducedMotion()) {
      // Animación simple para usuarios con preferencia de movimiento reducido
      this.renderer.setStyle(this.element.nativeElement, 'opacity', '1');
      this.renderer.setStyle(this.element.nativeElement, 'transform', 'translateY(0)');
      return;
    }

    // Pequeño delay antes de animar
    await new Promise(resolve => setTimeout(resolve, this.transitionDelay));

    // Aplicar la animación
    const animation = this.animationService.createMicroAnimation(
      this.element.nativeElement,
      this.appSmoothTransition,
      { duration: this.transitionDuration }
    );

    // Resetear estilos después de la animación
    animation.finished.then(() => {
      this.renderer.setStyle(this.element.nativeElement, 'opacity', '1');
      this.renderer.setStyle(this.element.nativeElement, 'transform', 'none');
    });
  }

  private setupHoverEffects() {
    this.renderer.setStyle(this.element.nativeElement, 'cursor', 'pointer');
    this.renderer.setStyle(this.element.nativeElement, 'transition', 'transform 0.2s ease-out');
  }

  @HostListener('mouseenter')
  onMouseEnter() {
    if (this.hoverEffect && !this.animationService.isReducedMotion()) {
      this.renderer.setStyle(this.element.nativeElement, 'transform', 'scale(1.02) translateY(-2px)');
    }
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    if (this.hoverEffect) {
      this.renderer.setStyle(this.element.nativeElement, 'transform', 'scale(1) translateY(0)');
    }
  }

  @HostListener('mousedown')
  onMouseDown() {
    if (this.clickEffect && !this.animationService.isReducedMotion()) {
      this.animationService.createMicroAnimation(
        this.element.nativeElement,
        'pulse',
        { duration: 150 }
      );
    }
  }
}
