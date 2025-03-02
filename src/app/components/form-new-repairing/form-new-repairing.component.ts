import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '../../models/product';
import { ProductsService } from '../../services/products.service';
import { Work } from '../../models/work';
import { WorksService } from '../../services/works.service';

@Component({
  selector: 'app-form-new-repairing',
  imports: [FormsModule, CommonModule],
  templateUrl: './form-new-repairing.component.html',
  styleUrl: './form-new-repairing.component.scss'
})
export class FormNewRepairingComponent implements OnInit{

  @Input()formStep: number = 0;
  @Output() productRemoved = new EventEmitter<void>();

  selectedServiceType: boolean = false;
  selectedCategory: boolean = false;
  selectedProduct: boolean = false;
  selectedDueDate: boolean = false;
  products: Product[] = [];
  works: Work[] = [];

  constructor(private productsService: ProductsService,
    private worksService: WorksService){}

  ngOnInit(): void {
      this.productsService.getProducts().subscribe( product =>{
        this.products = product;
      });
      this.worksService.getWorks().subscribe( work =>{
        this.works = work;
      });
  }

  removeProduct(){
    this.productRemoved.emit();
  }

}
