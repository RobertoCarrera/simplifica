import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormNewCustomerComponent } from "../form-new-customer/form-new-customer.component";
import { FormNewRepairingComponent } from "../form-new-repairing/form-new-repairing.component";

@Component({
    selector: 'app-btn-new',
    imports: [CommonModule, FormNewCustomerComponent, FormNewRepairingComponent],
    templateUrl: './btn-new.component.html',
    styleUrl: './btn-new.component.scss'
})
export class BtnNewComponent implements AfterViewInit {

    @Input() itemType: string = '';
    @Input() totalItems: number = 0;
    @Input() maxSteps: number = 0;

    @ViewChild(FormNewCustomerComponent) actionsNewCustomerComponent!: FormNewCustomerComponent;

    newItem: any = null;
    formStep: number = 1;
    totalProducts: number = 0;
    maxTotalProducts: number = 6;

    creating: boolean = false;
    businessType: boolean = false;
    personType: boolean = false;

    ngAfterViewInit() {
    }

    isCreating() {
        this.creating = !this.creating;
    }

    customerType(type: string) {
        switch (type) {
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

    addProduct(){
        if(this.totalProducts < this.maxTotalProducts){
        this.totalProducts++;}
        
    }

    removeProduct(index: number){
        if (this.totalProducts > 0) {
            this.totalProducts--;
          }
    }

    addStep() {
        if (this.formStep < this.maxSteps) {
            this.formStep++;
        }
    }

    removeStep() {
      if(this.formStep === 2){
        this.clearFormFromParent();
        this.formStep = 1;
      }else{
        this.formStep--;
      }
    }

    clearFormFromParent() {
        if (this.actionsNewCustomerComponent) {
            this.actionsNewCustomerComponent.clearForm();
            this.totalProducts = 0;
            this.isCreating();
        }
    }
}