import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebmailLayoutComponent } from './webmail-layout.component';

describe('WebmailLayoutComponent', () => {
  let component: WebmailLayoutComponent;
  let fixture: ComponentFixture<WebmailLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebmailLayoutComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WebmailLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
