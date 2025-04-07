import { Component, OnInit } from '@angular/core';
import { BrandsService } from '../../services/brands.service';
import { SosService } from '../../services/sos.service';
import { ModelsService } from '../../services/models.service';
import { CpusService } from '../../services/cpus.service';
import { Brand } from '../../models/brand';
import { So } from '../../models/so';
import { Model } from '../../models/model';
import { Cpu } from '../../models/cpu';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ram } from '../../models/ram';
import { RamsService } from '../../services/rams.service';
import { Ssd } from '../../models/ssd';
import { SsdsService } from '../../services/ssds.service';
import { Hhd } from '../../models/hhd';
import { HhdsService } from '../../services/hhds.service';
import { Inch } from '../../models/inch';
import { InchesService } from '../../services/inches.service';
import { GraphicCard } from '../../models/graphic-card';
import { GraphicCardsService } from '../../services/graphic-cards.service';

@Component({
  selector: 'app-form-new-product',
  imports: [CommonModule, FormsModule],
  templateUrl: './form-new-product.component.html',
  styleUrls: ['./form-new-product.component.scss']
})
export class FormNewProductComponent implements OnInit {

  brands: Brand[] = [];
  sos: So[] = [];
  models: Model[] = [];
  cpus: Cpu[] = [];
  rams: Ram[] = [];
  ssds: Ssd[] = [];
  hhds: Hhd[] = [];
  inches: Inch[] = [];
  graphicCards: GraphicCard[] = [];

  filteredModels: Model[] = [...this.models];
  filteredCPUs: Cpu[] = [...this.cpus];
  filteredGraphicCards: GraphicCard[] = [...this.graphicCards];

  selectedBrand: Brand | null = null;

  selectedModelName: string = '';
  selectedCPUModel: string = '';
  selectedBrandName: string = '';
  selectedSOName: string = '';
  selectedProductRAM: string = '';
  selectedProductSSD: string = '';
  selectedProductHHD: string = '';
  selectedProductInches: string = '';
  selectedGraphicCards: string = '';

  isSelectedBrand: boolean = false;
  selectedSO: boolean = false;
  selectedRAM: boolean = false;
  selectedSSD: boolean = false;
  selectedHHD: boolean = false;
  selectedInches: boolean = false;
  selectedGraphic: boolean = false;

  constructor(
    private brandsService: BrandsService,
    private sosService: SosService,
    private modelService: ModelsService,
    private cpuService: CpusService,
    private ramService: RamsService,
    private ssdService: SsdsService,
    private hhdService: HhdsService,
    private inchService: InchesService,
    private graphiCardsService: GraphicCardsService
  ) {}

  ngOnInit(): void {
    // Cargar marcas
    this.brandsService.getBrands('671eca034ecc7019c9ea3bd3').subscribe(brand => {
      this.brands = brand;
    });

    // Cargar CPUs
    this.cpuService.getCPUs().subscribe(cpu => {
      this.cpus = cpu;
    });
    this.ramService.getRAMs().subscribe(ram => {
      this.rams = ram;
    });
    this.ssdService.getSSDs().subscribe(ssd => {
      this.ssds = ssd;
    });
    this.hhdService.getHHDs().subscribe(hhd => {
      this.hhds = hhd;
    });
    this.inchService.getInches().subscribe(inch => {
      this.inches = inch;
    });
    this.graphiCardsService.getGraphicCards().subscribe(graphic => {
      this.graphicCards = graphic;
    });
  }

  // Método para buscar modelos
  onSearchProductModel(event: any) {
    const search = event.target.value;

    this.filteredModels = this.models.filter(model => 
      model.nombre.toLowerCase().includes(search.toLowerCase()));
  }

  // Método para buscar CPUs
  onSearchProductCPU(event: any) {
    const search = event.target.value;

    this.filteredCPUs = this.cpus.filter(cpu => 
      cpu.serie.toLowerCase().includes(search));
  }

  onSearchProductGraphicCard(event: any) {
    const search = event.target.value;

    this.filteredGraphicCards = this.graphicCards.filter(graphic => 
      graphic.nombre.toLowerCase().includes(search));
  }

  // Método para seleccionar un modelo
  selectModel(model: Model): void {
    this.selectedModelName = model.nombre;
    this.filteredModels = []; // Reinicia la lista filtrada
  }

  // Método para seleccionar una CPU
  selectCPU(cpu: Cpu): void {
    this.selectedCPUModel = cpu.serie;
    this.filteredCPUs = []; // Reinicia la lista filtrada
  }

  // Método para seleccionar una CPU
  selectGraphicCard(graphicCard: GraphicCard): void {
    this.selectedGraphicCards = graphicCard.nombre;
    this.filteredGraphicCards = []; // Reinicia la lista filtrada
  }

  // Método para manejar el cambio de SO según la marca
  onBrandChange(): void {

    if (this.selectedBrand?.nombre === 'Apple') {
      this.sosService.getSOs('true').subscribe(so => {
        this.sos = so;
      });
    } else {
      this.sosService.getSOs('false').subscribe(so => {
        this.sos = so;
      });
    }
    
    this.modelService.getModels('671eca034ecc7019c9ea3bd3',this.selectedBrand!._id).subscribe(model => {
      this.models = model;
      this.filteredModels = this.models; 
    });
    this.isSelectedBrand = true;
  }
}