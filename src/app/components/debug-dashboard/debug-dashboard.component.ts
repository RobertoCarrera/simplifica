import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-debug-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="debug-dashboard p-6 bg-gray-100 min-h-screen">
      <h1 class="text-2xl font-bold mb-6">🔧 Debug Dashboard</h1>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Database Status -->
        <div class="bg-white p-4 rounded-lg shadow">
          <h2 class="text-lg font-semibold mb-3">📊 Database Status</h2>
          <div class="space-y-2 text-sm">
            <div>Auth User: {{ authService.currentUser?.email || 'Not authenticated' }}</div>
            <div>App User ID: {{ authService.userProfile?.id || 'None' }}</div>
            <div>Role: {{ authService.userProfile?.role || 'None' }}</div>
            <div>Company ID: {{ authService.userProfile?.company_id || 'None' }}</div>
            <div>Company Name: {{ authService.userProfile?.company?.name || 'None' }}</div>
          </div>
        </div>

        <!-- Actions -->
        <div class="bg-white p-4 rounded-lg shadow">
          <h2 class="text-lg font-semibold mb-3">🔥 Quick Actions</h2>
          <div class="space-y-3">
            <button 
              (click)="testDatabaseConnection()"
              class="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Test Database Connection
            </button>
            <button 
              (click)="refreshUser()"
              class="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
              Refresh User Data
            </button>
            <button 
              (click)="checkTables()"
              class="w-full bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">
              Check Tables
            </button>
          </div>
        </div>

        <!-- Debug Output -->
        <div class="bg-white p-4 rounded-lg shadow md:col-span-2">
          <h2 class="text-lg font-semibold mb-3">📝 Debug Output</h2>
          <div class="bg-gray-100 p-3 rounded text-xs font-mono max-h-64 overflow-y-auto">
            <div *ngFor="let log of debugLogs" [class]="getLogClass(log.type)">
              [{{ log.timestamp }}] {{ log.message }}
            </div>
          </div>
          <button 
            (click)="clearLogs()"
            class="mt-2 text-sm bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600">
            Clear Logs
          </button>
        </div>
      </div>
    </div>
  `
})
export class DebugDashboardComponent {
  authService = inject(AuthService);
  debugLogs: { type: 'info' | 'error' | 'success'; message: string; timestamp: string }[] = [];

  private log(type: 'info' | 'error' | 'success', message: string) {
    this.debugLogs.push({
      type,
      message,
      timestamp: new Date().toLocaleTimeString()
    });
    console.log(`[DEBUG] ${message}`);
  }

  getLogClass(type: string): string {
    switch (type) {
      case 'error': return 'text-red-600';
      case 'success': return 'text-green-600';
      default: return 'text-gray-700';
    }
  }

  clearLogs() {
    this.debugLogs = [];
  }

  async testDatabaseConnection() {
    this.log('info', 'Testing database connection...');
    try {
      const client = this.authService.client;
      const { data, error } = await client
        .from('users')
        .select('id')
        .limit(1);
      
      if (error) {
        this.log('error', `Database error: ${error.message}`);
      } else {
        this.log('success', 'Database connection successful');
      }
    } catch (e: any) {
      this.log('error', `Connection failed: ${e.message}`);
    }
  }

  async refreshUser() {
    this.log('info', 'Refreshing user data...');
    try {
      await this.authService.refreshCurrentUser();
      this.log('success', 'User data refreshed');
    } catch (e: any) {
      this.log('error', `Refresh failed: ${e.message}`);
    }
  }

  async checkTables() {
    this.log('info', 'Checking table structures...');
    try {
      const client = this.authService.client;
      
      // Check users table
      const { data: usersData, error: usersError } = await client
        .from('users')
        .select('*')
        .limit(5);
      
      if (usersError) {
        this.log('error', `Users table error: ${usersError.message}`);
      } else {
        this.log('success', `Users table OK (${usersData?.length || 0} records)`);
      }

      // Check companies table
      const { data: companiesData, error: companiesError } = await client
        .from('companies')
        .select('*')
        .limit(5);
      
      if (companiesError) {
        this.log('error', `Companies table error: ${companiesError.message}`);
      } else {
        this.log('success', `Companies table OK (${companiesData?.length || 0} records)`);
      }
      
    } catch (e: any) {
      this.log('error', `Table check failed: ${e.message}`);
    }
  }
}
