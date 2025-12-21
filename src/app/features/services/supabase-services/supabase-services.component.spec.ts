import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SupabaseServicesComponent } from './supabase-services.component';

describe('SupabaseServicesComponent', () => {
  let component: SupabaseServicesComponent;
  let fixture: ComponentFixture<SupabaseServicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupabaseServicesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SupabaseServicesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
