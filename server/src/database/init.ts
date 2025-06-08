import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/accounting.db');

export class Database {
  private static instance: Database;
  private db: sqlite3.Database;

  private constructor() {
    this.db = new sqlite3.Database(dbPath);
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public getDb(): sqlite3.Database {
    return this.db;
  }

  public run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  public get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  public all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

export async function initializeDatabase(): Promise<void> {
  const fs = require('fs');
  const dataDir = path.join(__dirname, '../../data');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = Database.getInstance();

  // Create tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      tax_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
      parent_id INTEGER,
      balance DECIMAL(15,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES accounts(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_number TEXT UNIQUE NOT NULL,
      date DATE NOT NULL,
      description TEXT,
      reference TEXT,
      total_amount DECIMAL(15,2) NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS transaction_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit_amount DECIMAL(15,2) DEFAULT 0,
      credit_amount DECIMAL(15,2) DEFAULT 0,
      description TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('payment', 'receipt', 'journal')),
      date DATE NOT NULL,
      payee TEXT,
      amount DECIMAL(15,2) NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted')),
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      unit TEXT DEFAULT 'pcs',
      cost_price DECIMAL(15,2) DEFAULT 0,
      selling_price DECIMAL(15,2) DEFAULT 0,
      current_stock DECIMAL(15,3) DEFAULT 0,
      minimum_stock DECIMAL(15,3) DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
      quantity DECIMAL(15,3) NOT NULL,
      unit_cost DECIMAL(15,2),
      reference TEXT,
      date DATE NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Insert default admin user if not exists
  const adminExists = await db.get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin@company.com', hashedPassword, 'admin']
    );
  }

  // Insert default company if not exists
  const companyExists = await db.get('SELECT id FROM companies LIMIT 1');
  if (!companyExists) {
    await db.run(
      'INSERT INTO companies (name, address, phone, email) VALUES (?, ?, ?, ?)',
      ['Your Company Name', '123 Business Street', '+1-234-567-8900', 'info@company.com']
    );
  }

  // Insert default chart of accounts if not exists
  const accountsExist = await db.get('SELECT id FROM accounts LIMIT 1');
  if (!accountsExist) {
    const defaultAccounts = [
      { code: '1000', name: 'Assets', type: 'asset', parent_id: null },
      { code: '1100', name: 'Current Assets', type: 'asset', parent_id: 1 },
      { code: '1110', name: 'Cash', type: 'asset', parent_id: 2 },
      { code: '1120', name: 'Accounts Receivable', type: 'asset', parent_id: 2 },
      { code: '1130', name: 'Inventory', type: 'asset', parent_id: 2 },
      { code: '1200', name: 'Fixed Assets', type: 'asset', parent_id: 1 },
      { code: '1210', name: 'Equipment', type: 'asset', parent_id: 6 },
      
      { code: '2000', name: 'Liabilities', type: 'liability', parent_id: null },
      { code: '2100', name: 'Current Liabilities', type: 'liability', parent_id: 8 },
      { code: '2110', name: 'Accounts Payable', type: 'liability', parent_id: 9 },
      { code: '2120', name: 'Accrued Expenses', type: 'liability', parent_id: 9 },
      
      { code: '3000', name: 'Equity', type: 'equity', parent_id: null },
      { code: '3100', name: 'Owner\'s Equity', type: 'equity', parent_id: 12 },
      { code: '3200', name: 'Retained Earnings', type: 'equity', parent_id: 12 },
      
      { code: '4000', name: 'Revenue', type: 'income', parent_id: null },
      { code: '4100', name: 'Sales Revenue', type: 'income', parent_id: 15 },
      { code: '4200', name: 'Service Revenue', type: 'income', parent_id: 15 },
      
      { code: '5000', name: 'Expenses', type: 'expense', parent_id: null },
      { code: '5100', name: 'Cost of Goods Sold', type: 'expense', parent_id: 18 },
      { code: '5200', name: 'Operating Expenses', type: 'expense', parent_id: 18 },
      { code: '5210', name: 'Rent Expense', type: 'expense', parent_id: 20 },
      { code: '5220', name: 'Utilities Expense', type: 'expense', parent_id: 20 },
      { code: '5230', name: 'Office Supplies', type: 'expense', parent_id: 20 }
    ];

    for (const account of defaultAccounts) {
      await db.run(
        'INSERT INTO accounts (code, name, type, parent_id) VALUES (?, ?, ?, ?)',
        [account.code, account.name, account.type, account.parent_id]
      );
    }
  }

  console.log('✅ Database initialized successfully');
}