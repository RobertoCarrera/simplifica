import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Customer } from '../models/customer';
import { HttpClient} from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class CustomersService {

  private apiUrl = "https://a2022.twidget.io/clientes";
  
  constructor(private http: HttpClient){}

  getCustomers(): Observable<Customer[]>{
    return this.http.get<Customer[]>(this.apiUrl);
  }

  getCustomer(customerId: string): Observable<Customer> {
    return this.http.get<Customer>(`${this.apiUrl}/${customerId}`); 
  }

  createCustomer(customer: Customer): Observable<Customer> {
    return this.http.post<Customer>(this.apiUrl, customer);
  }

  updateCustomer(customerId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${customerId}`, updateData);
  }

  deleteCustomer(customerId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${customerId}`);
  }
}