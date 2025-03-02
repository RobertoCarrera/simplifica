import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoriesService } from '../../services/categories.service';
import { Category } from '../../models/category';

@Component({
  selector: 'app-form-new-repairing',
  imports: [FormsModule, CommonModule],
  templateUrl: './form-new-repairing.component.html',
  styleUrl: './form-new-repairing.component.scss'
})
export class FormNewRepairingComponent implements OnInit{

  @Input()formStep: number = 0;

  selectedServiceType: boolean = false;
  selectedCategory: boolean = false;
  selectedDueDate: boolean = false;
  categories: Category[] = [];

  constructor(private categoriesService: CategoriesService){}

  ngOnInit(): void {
      this.categoriesService.getCategories().subscribe( category =>{
        this.categories = category;
      })
  }

}
