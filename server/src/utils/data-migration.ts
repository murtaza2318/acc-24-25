import { Database } from '../database/init';

export interface AccessTableStructure {
  tableName: string;
  columns: string[];
  data: any[];
}

export class DataMigration {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Import data from Access database export (JSON format)
   * This assumes you've exported your Access data to JSON format
   */
  async importFromAccessExport(accessData: AccessTableStructure[]): Promise<void> {
    console.log('Starting data migration from Access database...');

    try {
      await this.db.run('BEGIN TRANSACTION');

      for (const table of accessData) {
        await this.migrateTable(table);
      }

      await this.db.run('COMMIT');
      console.log('✅ Data migration completed successfully');
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error('❌ Data migration failed:', error);
      throw error;
    }
  }

  private async migrateTable(table: AccessTableStructure): Promise<void> {
    console.log(`Migrating table: ${table.tableName}`);

    switch (table.tableName.toLowerCase()) {
      case 'accounts':
      case 'chart_of_accounts':
        await this.migrateAccounts(table.data);
        break;
      case 'transactions':
      case 'journal_entries':
        await this.migrateTransactions(table.data);
        break;
      case 'vouchers':
      case 'payment_vouchers':
      case 'receipt_vouchers':
        await this.migrateVouchers(table.data);
        break;
      case 'inventory':
      case 'items':
      case 'products':
        await this.migrateInventoryItems(table.data);
        break;
      case 'customers':
      case 'suppliers':
      case 'vendors':
        await this.migrateParties(table.data, table.tableName);
        break;
      default:
        console.log(`⚠️  Unknown table: ${table.tableName}, skipping...`);
    }
  }

  private async migrateAccounts(accounts: any[]): Promise<void> {
    console.log(`Migrating ${accounts.length} accounts...`);

    for (const account of accounts) {
      try {
        // Map Access account fields to our schema
        const mappedAccount = {
          code: account.AccountCode || account.Code || account.account_code,
          name: account.AccountName || account.Name || account.account_name,
          type: this.mapAccountType(account.AccountType || account.Type || account.account_type),
          parent_id: account.ParentID || account.parent_id || null,
          balance: account.Balance || account.OpeningBalance || 0
        };

        // Check if account already exists
        const existing = await this.db.get(
          'SELECT id FROM accounts WHERE code = ?',
          [mappedAccount.code]
        );

        if (!existing) {
          await this.db.run(`
            INSERT INTO accounts (code, name, type, parent_id, balance)
            VALUES (?, ?, ?, ?, ?)
          `, [mappedAccount.code, mappedAccount.name, mappedAccount.type, mappedAccount.parent_id, mappedAccount.balance]);
        }
      } catch (error) {
        console.error(`Error migrating account ${account.AccountCode || account.Code}:`, error);
      }
    }
  }

  private async migrateTransactions(transactions: any[]): Promise<void> {
    console.log(`Migrating ${transactions.length} transactions...`);

    for (const transaction of transactions) {
      try {
        // Generate transaction number if not provided
        const transactionNumber = transaction.TransactionNumber || 
                                transaction.VoucherNumber || 
                                `TXN${Date.now()}`;

        const result = await this.db.run(`
          INSERT INTO transactions (transaction_number, date, description, reference, total_amount, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          transactionNumber,
          transaction.Date || transaction.TransactionDate,
          transaction.Description || transaction.Narration || '',
          transaction.Reference || '',
          transaction.Amount || transaction.TotalAmount || 0,
          1 // Default to admin user
        ]);

        // If transaction has entries, migrate them
        if (transaction.Entries && Array.isArray(transaction.Entries)) {
          for (const entry of transaction.Entries) {
            await this.migrateTransactionEntry(result.lastID!, entry);
          }
        }
      } catch (error) {
        console.error(`Error migrating transaction ${transaction.TransactionNumber}:`, error);
      }
    }
  }

  private async migrateTransactionEntry(transactionId: number, entry: any): Promise<void> {
    try {
      // Find account by code
      const account = await this.db.get(
        'SELECT id FROM accounts WHERE code = ?',
        [entry.AccountCode || entry.Account]
      );

      if (account) {
        await this.db.run(`
          INSERT INTO transaction_entries (transaction_id, account_id, debit_amount, credit_amount, description)
          VALUES (?, ?, ?, ?, ?)
        `, [
          transactionId,
          account.id,
          entry.DebitAmount || entry.Debit || 0,
          entry.CreditAmount || entry.Credit || 0,
          entry.Description || ''
        ]);
      }
    } catch (error) {
      console.error('Error migrating transaction entry:', error);
    }
  }

  private async migrateVouchers(vouchers: any[]): Promise<void> {
    console.log(`Migrating ${vouchers.length} vouchers...`);

    for (const voucher of vouchers) {
      try {
        const voucherType = this.mapVoucherType(voucher.VoucherType || voucher.Type);
        
        await this.db.run(`
          INSERT INTO vouchers (voucher_number, type, date, payee, amount, description, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          voucher.VoucherNumber || voucher.Number,
          voucherType,
          voucher.Date || voucher.VoucherDate,
          voucher.Payee || voucher.Party || '',
          voucher.Amount || 0,
          voucher.Description || voucher.Narration || '',
          voucher.Status || 'posted',
          1 // Default to admin user
        ]);
      } catch (error) {
        console.error(`Error migrating voucher ${voucher.VoucherNumber}:`, error);
      }
    }
  }

  private async migrateInventoryItems(items: any[]): Promise<void> {
    console.log(`Migrating ${items.length} inventory items...`);

    for (const item of items) {
      try {
        await this.db.run(`
          INSERT INTO inventory_items (code, name, description, unit, cost_price, selling_price, current_stock, minimum_stock)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.ItemCode || item.Code,
          item.ItemName || item.Name,
          item.Description || '',
          item.Unit || 'pcs',
          item.CostPrice || item.Cost || 0,
          item.SellingPrice || item.Price || 0,
          item.Stock || item.Quantity || 0,
          item.MinimumStock || item.ReorderLevel || 0
        ]);
      } catch (error) {
        console.error(`Error migrating item ${item.ItemCode || item.Code}:`, error);
      }
    }
  }

  private async migrateParties(parties: any[], tableType: string): Promise<void> {
    console.log(`Migrating ${parties.length} ${tableType}...`);
    // This would create customer/supplier tables if needed
    // For now, we'll skip this as it's not in our basic schema
  }

  private mapAccountType(accessType: string): string {
    if (!accessType) return 'asset';
    
    const type = accessType.toLowerCase();
    if (type.includes('asset')) return 'asset';
    if (type.includes('liability')) return 'liability';
    if (type.includes('equity') || type.includes('capital')) return 'equity';
    if (type.includes('income') || type.includes('revenue')) return 'income';
    if (type.includes('expense') || type.includes('cost')) return 'expense';
    
    return 'asset'; // Default
  }

  private mapVoucherType(accessType: string): string {
    if (!accessType) return 'journal';
    
    const type = accessType.toLowerCase();
    if (type.includes('payment') || type.includes('pay')) return 'payment';
    if (type.includes('receipt') || type.includes('receive')) return 'receipt';
    
    return 'journal';
  }

  /**
   * Export current database to JSON format for backup
   */
  async exportToJson(): Promise<any> {
    const export_data: any = {};

    // Export accounts
    export_data.accounts = await this.db.all('SELECT * FROM accounts WHERE is_active = 1');
    
    // Export transactions with entries
    const transactions = await this.db.all('SELECT * FROM transactions');
    for (const transaction of transactions) {
      const entries = await this.db.all(
        'SELECT * FROM transaction_entries WHERE transaction_id = ?',
        [transaction.id]
      );
      transaction.entries = entries;
    }
    export_data.transactions = transactions;

    // Export vouchers
    export_data.vouchers = await this.db.all('SELECT * FROM vouchers');

    // Export inventory
    export_data.inventory_items = await this.db.all('SELECT * FROM inventory_items WHERE is_active = 1');
    export_data.stock_movements = await this.db.all('SELECT * FROM stock_movements');

    return export_data;
  }
}

// Utility function to convert Access MDB to JSON
export function generateMigrationInstructions(): string {
  return `
# Data Migration Instructions

To migrate your data from telelnk.mdb to the modern accounting system:

## Option 1: Using Access Export (Recommended)
1. Open your telelnk.mdb file in Microsoft Access
2. For each table you want to migrate:
   - Right-click the table → Export → Text File
   - Choose "Delimited" format
   - Use comma as delimiter
   - Include field names in first row
   - Save as CSV file

## Option 2: Using MDB Tools (Linux/Mac)
1. Install mdb-tools: 
   - Ubuntu/Debian: sudo apt-get install mdb-tools
   - Mac: brew install mdb-tools
2. List tables: mdb-tables telelnk.mdb
3. Export each table: mdb-export telelnk.mdb [table_name] > [table_name].csv

## Option 3: Using Python (Cross-platform)
1. Install pandas and pypyodbc: pip install pandas pypyodbc
2. Use the provided Python script to extract data

## Common Table Names to Look For:
- Accounts / Chart_of_Accounts
- Transactions / Journal_Entries
- Vouchers / Payment_Vouchers / Receipt_Vouchers
- Items / Inventory / Products
- Customers / Suppliers / Vendors

## After Export:
1. Upload the CSV files to the migration endpoint
2. The system will automatically map and import your data
3. Review the imported data and make any necessary adjustments

## API Endpoint for Migration:
POST /api/migrate/import-csv
- Upload CSV files with proper headers
- System will auto-detect table types and map fields
`;
}