import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Customer } from '../../models/customer';

@Component({
  selector: 'app-btn-new',
  imports: [CommonModule],
  templateUrl: './btn-new.component.html',
  styleUrl: './btn-new.component.scss'
})
export class BtnNewComponent {

  @Input() itemType: string = '';
  @Input() totalItems: number = 0;

  newItem: any = null;
  formStep: number = 1;

  creating: boolean = false;
  businessType: boolean = false;
  personType: boolean = false;
  
  isCreating(){

    this.creating = !this.creating;
  }

  customerType(type: string){
    switch(type){
      case 'business':
        this.businessType = true;
        this.personType = false;
        this.formStep++;
        break;
      case 'person':
        this.personType = true;
        this.businessType = false;
        this.formStep++;
        break;
      default:
        alert("Error en la elección");
        break;
    }
  }

  addStep(){
    if(this.formStep < 4){
      this.formStep++;
    }
  }

  removeStep(){
    this.formStep--;
  }
}