import { Component } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  imports: [],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {

  isShrink = false;
  element = 1;

  constructor(private sidebarService: SidebarService){}

  toggleMenu(): void {
    this.isShrink = !this.isShrink;
    this.sidebarService.toggleSidebar(this.isShrink);
  }

  activeElement(el: number): void {
    this.element = el;
  }
}