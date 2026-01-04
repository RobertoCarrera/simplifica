import { Injectable } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailAccount } from '../../../core/interfaces/webmail.interface';

@Injectable({
  providedIn: 'root'
})
export class MailAccountService {
  private supabase;

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  async createAccount(account: Partial<MailAccount>) {
    const { data, error } = await this.supabase
      .from('mail_accounts')
      .insert(account)
      .select()
      .single();

    if (error) throw error;
    return data as MailAccount;
  }

  async updateAccount(id: string, updates: Partial<MailAccount>) {
    const { data, error } = await this.supabase
      .from('mail_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as MailAccount;
  }

  async deleteAccount(id: string) {
    const { error } = await this.supabase
      .from('mail_accounts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
}
