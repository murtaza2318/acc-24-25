export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parent_id?: number;
  parent_name?: string;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface TransactionEntry {
  id?: number;
  account_id: number;
  account_code?: string;
  account_name?: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

export interface Transaction {
  id: number;
  transaction_number: string;
  date: string;
  description: string;
  reference?: string;
  total_amount: number;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  entries: TransactionEntry[];
}

export interface Voucher {
  id: number;
  voucher_number: string;
  type: 'payment' | 'receipt' | 'journal';
  date: string;
  payee?: string;
  amount: number;
  description: string;
  status: 'draft' | 'approved' | 'posted';
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface InventoryItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  minimum_stock: number;
  is_active: boolean;
  created_at: string;
}

export interface StockMovement {
  id: number;
  item_id: number;
  item_code?: string;
  item_name?: string;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  unit_cost?: number;
  reference?: string;
  date: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface Report {
  trial_balance: {
    as_of_date: string;
    accounts: Array<{
      id: number;
      code: string;
      name: string;
      type: string;
      total_debits: number;
      total_credits: number;
      balance: number;
    }>;
    totals: {
      total_debits: number;
      total_credits: number;
    };
  };
  
  balance_sheet: {
    as_of_date: string;
    assets: {
      accounts: Account[];
      total: number;
    };
    liabilities: {
      accounts: Account[];
      total: number;
    };
    equity: {
      accounts: Account[];
      total: number;
    };
    totals: {
      assets: number;
      liabilities_and_equity: number;
    };
  };
  
  profit_loss: {
    period: { from: string; to: string };
    income: {
      accounts: Account[];
      total: number;
    };
    expenses: {
      accounts: Account[];
      total: number;
    };
    net_income: number;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}