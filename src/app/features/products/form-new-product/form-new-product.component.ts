import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { Brand } from '../../../models/brand';
import { So } from '../../../models/so';
import { Model } from '../../../models/model';
import { Cpu } from '../../../models/cpu';
import { Ram } from '../../../models/ram';
import { Ssd } from '../../../models/ssd';
import { Hhd } from '../../../models/hhd';
import { Inch } from '../../../models/inch';
import { GraphicCard } from '../../../models/graphic-card';

const DEFAULT_COMPANY_ID = '671eca034ecc7019c9ea3bd3';

@Component({
  selector: 'app-form-new-product',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './form-new-product.component.html',
  styleUrls: ['./form-new-product.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormNewProductComponent implements OnInit {
  private brandsService = inject(BrandsService);
  private sosService = inject(SosService);
  private modelService = inject(ModelsService);
  private cpuService = inject(CpusService);
  private ramService = inject(RamsService);
  private ssdService = inject(SsdsService);
  private hhdService = inject(HhdsService);
  private inchService = inject(InchesService);
  private graphicCardsService = inject(GraphicCardsService);
  private toastService = inject(ToastService);

  brands: Brand[] = [];
  sos: So[] = [];
  models: Model[] = [];
  cpus: Cpu[] = [];
  rams: Ram[] = [];
  ssds: Ssd[] = [];
  hhds: Hhd[] = [];
  inches: Inch[] = [];
  graphicCards: GraphicCard[] = [];

  filteredModels: Model[] = [];
  filteredCPUs: Cpu[] = [];
  filteredGraphicCards: GraphicCard[] = [];

  selectedBrand: Brand | null = null;
  serialNumber = '';
  selectedModelName = '';
  selectedCPUModel = '';
  selectedBrandName = '';
  selectedSOName = '';
  selectedProductRAM = '';
  selectedProductSSD = '';
  selectedProductHHD = '';
  selectedProductInches = '';
  selectedGraphicCards = '';

  isSelectedBrand = false;
  selectedSO = false;
  selectedRAM = false;
  selectedSSD = false;
  selectedHHD = false;
  selectedInches = false;
  selectedGraphic = false;

  ngOnInit(): void {
    this.brandsService.getBrands(DEFAULT_COMPANY_ID).subscribe({
      next: (brand) => (this.brands = brand),
      error: (err) => {
        console.error('Error cargando marcas', err);
        this.toastService.error('Error', 'No se pudieron cargar las marcas');
      },
    });
    this.cpuService.getCPUs().subscribe({ next: (cpu) => (this.cpus = cpu), error: (err) => console.error('Error cargando CPUs', err) });
    this.ramService.getRAMs().subscribe({ next: (ram) => (this.rams = ram), error: (err) => console.error('Error cargando RAMs', err) });
    this.ssdService.getSSDs().subscribe({ next: (ssd) => (this.ssds = ssd), error: (err) => console.error('Error cargando SSDs', err) });
    this.hhdService.getHHDs().subscribe({ next: (hhd) => (this.hhds = hhd), error: (err) => console.error('Error cargando HHDs', err) });
    this.inchService.getInches().subscribe({ next: (inch) => (this.inches = inch), error: (err) => console.error('Error cargando pulgadas', err) });
    this.graphicCardsService.getGraphicCards().subscribe({ next: (graphic) => (this.graphicCards = graphic), error: (err) => console.error('Error cargando tarjetas gráficas', err) });
  }

  onSearchProductModel(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    this.filteredModels = this.models.filter((model) => model.nombre.toLowerCase().includes(search.toLowerCase()));
  }

  onSearchProductCPU(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    this.filteredCPUs = this.cpus.filter((cpu) => cpu.serie.toLowerCase().includes(search.toLowerCase()));
  }

  onSearchProductGraphicCard(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    this.filteredGraphicCards = this.graphicCards.filter((graphic) => graphic.nombre.toLowerCase().includes(search.toLowerCase()));
  }

  selectModel(model: Model): void { this.selectedModelName = model.nombre; this.filteredModels = []; }
  selectCPU(cpu: Cpu): void { this.selectedCPUModel = cpu.serie; this.filteredCPUs = []; }
  selectGraphicCard(graphicCard: GraphicCard): void { this.selectedGraphicCards = graphicCard.nombre; this.filteredGraphicCards = []; }

  onBrandChange(): void {
    if (this.selectedBrand?.nombre === 'Apple') {
      this.sosService.getSOs('true').subscribe((so) => (this.sos = so));
    } else {
      this.sosService.getSOs('false').subscribe((so) => (this.sos = so));
    }
    this.modelService.getModels(DEFAULT_COMPANY_ID, this.selectedBrand!._id).subscribe({
      next: (model) => { this.models = model; this.filteredModels = this.models; },
      error: (err) => console.error('Error cargando modelos', err),
    });
    this.isSelectedBrand = true;
  }
}