import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormNewCustomerComponent } from "../form-new-customer/form-new-customer.component";

@Component({
    selector: 'app-btn-new',
    imports: [CommonModule, FormNewCustomerComponent],
    templateUrl: './btn-new.component.html',
    styleUrl: './btn-new.component.scss'
})
export class BtnNewComponent implements AfterViewInit {

    @Input() itemType: string = '';
    @Input() totalItems: number = 0;
    @Input() maxSteps: number = 0;

    @ViewChild(FormNewCustomerComponent) actionsNewCustomerComponent!: FormNewCustomerComponent; // Usamos !

    newItem: any = null;
    formStep: number = 1;

    creating: boolean = false;
    businessType: boolean = false;
    personType: boolean = false;

    ngAfterViewInit() {
        // Aquí puedes estar seguro de que actionsNewCustomerComponent está inicializado.
        console.log(this.actionsNewCustomerComponent);
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

    addStep() {
        if (this.formStep < this.maxSteps) {
            this.formStep++;
        }
    }

    removeStep() {
      if(this.formStep === 2){
        this.clearFormFromParent();
      }else{
        this.formStep--;
      }
    }

    clearFormFromParent() {
        if (this.actionsNewCustomerComponent) {
            this.actionsNewCustomerComponent.clearForm();
            this.isCreating();
        }
    }
}