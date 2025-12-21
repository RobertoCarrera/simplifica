import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BtnNewComponent } from './btn-new.component';

describe('BtnNewComponent', () => {
  let component: BtnNewComponent;
  let fixture: ComponentFixture<BtnNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BtnNewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BtnNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
