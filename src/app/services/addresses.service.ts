import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Address } from '../models/address';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AddressesService {
  
  private apiUrl = "https://a2022.twidget.io/direcciones";
  
  constructor(private http: HttpClient){}

  getAddresses(): Observable<Address[]>{
    return this.http.get<Address[]>(this.apiUrl);
  }

  createAddress(address: Address): Observable<Address> {
    return this.http.post<Address>(this.apiUrl, address);
  }

  updateAddress(addressId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${addressId}`, updateData);
  }

  deleteAddress(addressId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${addressId}`);
  }
}
