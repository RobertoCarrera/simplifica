import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-form-new-product',
  imports: [CommonModule, FormsModule],
  templateUrl: './form-new-product.component.html',
  styleUrl: './form-new-product.component.scss'
})
export class FormNewProductComponent {

  selectedCPU = false;
  selectedRAM = false;
  selectedMarca = false;
  selectedModelo = false;
  selectedHDD = false;
  selectedSSD = false;
  selectedPulgadas = false;
  selectedGrafica = false;
  selectedPeso = false;
  selectedSO = false;
}
