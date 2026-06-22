import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FormNewProductComponent } from './form-new-product.component';
import { BrandsService } from '../../../services/brands.service';
import { SosService } from '../../../services/sos.service';
import { ModelsService } from '../../../services/models.service';
import { CpusService } from '../../../services/cpus.service';
import { RamsService } from '../../../services/rams.service';
import { SsdsService } from '../../../services/ssds.service';
import { HhdsService } from '../../../services/hhds.service';
import { InchesService } from '../../../services/inches.service';
import { GraphicCardsService } from '../../../services/graphic-cards.service';
import { ToastService } from '../../../services/toast.service';

function observableMock<T extends object>(methods: (keyof T)[]): jest.Mocked<T> {
    const mock: any = {};
    methods.forEach((method) => { mock[method] = jest.fn().mockReturnValue(of([])); });
    return mock as jest.Mocked<T>;
}

describe('FormNewProductComponent', () => {
    let component: FormNewProductComponent;
    let fixture: ComponentFixture<FormNewProductComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FormNewProductComponent],
            providers: [
                { provide: BrandsService, useValue: observableMock<BrandsService>(['getBrands']) },
                { provide: SosService, useValue: observableMock<SosService>(['getSOs']) },
                { provide: ModelsService, useValue: observableMock<ModelsService>(['getModels']) },
                { provide: CpusService, useValue: observableMock<CpusService>(['getCPUs']) },
                { provide: RamsService, useValue: observableMock<RamsService>(['getRAMs']) },
                { provide: SsdsService, useValue: observableMock<SsdsService>(['getSSDs']) },
                { provide: HhdsService, useValue: observableMock<HhdsService>(['getHHDs']) },
                { provide: InchesService, useValue: observableMock<InchesService>(['getInches']) },
                { provide: GraphicCardsService, useValue: observableMock<GraphicCardsService>(['getGraphicCards']) },
                { provide: ToastService, useValue: observableMock<ToastService>(['success', 'error', 'warning', 'info']) },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(FormNewProductComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => { expect(component).toBeTruthy(); });
    it('should start with no brand selected', () => {
        expect(component.selectedBrand).toBeNull();
        expect(component.isSelectedBrand).toBe(false);
    });
    it('should have empty draft defaults', () => {
        expect(component.brands).toEqual([]);
        expect(component.cpus).toEqual([]);
        expect(component.rams).toEqual([]);
        expect(component.ssds).toEqual([]);
        expect(component.hhds).toEqual([]);
        expect(component.inches).toEqual([]);
        expect(component.graphicCards).toEqual([]);
    });
});