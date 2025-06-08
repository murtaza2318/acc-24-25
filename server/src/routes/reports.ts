import express from 'express';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Trial Balance
router.get('/trial-balance', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const asOfDate = req.query.as_of_date as string || new Date().toISOString().split('T')[0];

    const trialBalance = await db.all(`
      SELECT 
        a.id,
        a.code,
        a.name,
        a.type,
        COALESCE(SUM(te.debit_amount), 0) as total_debits,
        COALESCE(SUM(te.credit_amount), 0) as total_credits,
        COALESCE(SUM(te.debit_amount), 0) - COALESCE(SUM(te.credit_amount), 0) as balance
      FROM accounts a
      LEFT JOIN transaction_entries te ON a.id = te.account_id
      LEFT JOIN transactions t ON te.transaction_id = t.id
      WHERE a.is_active = 1 
        AND (t.date IS NULL OR t.date <= ?)
      GROUP BY a.id, a.code, a.name, a.type
      HAVING ABS(total_debits) > 0 OR ABS(total_credits) > 0 OR ABS(balance) > 0
      ORDER BY a.code
    `, [asOfDate]);

    const totals = trialBalance.reduce((acc, account) => {
      acc.total_debits += Math.max(0, account.balance);
      acc.total_credits += Math.max(0, -account.balance);
      return acc;
    }, { total_debits: 0, total_credits: 0 });

    res.json({
      as_of_date: asOfDate,
      accounts: trialBalance,
      totals
    });
  } catch (error) {
    console.error('Error generating trial balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Balance Sheet
router.get('/balance-sheet', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const asOfDate = req.query.as_of_date as string || new Date().toISOString().split('T')[0];

    const balanceSheet = await db.all(`
      SELECT 
        a.id,
        a.code,
        a.name,
        a.type,
        a.parent_id,
        COALESCE(SUM(te.debit_amount), 0) - COALESCE(SUM(te.credit_amount), 0) as balance
      FROM accounts a
      LEFT JOIN transaction_entries te ON a.id = te.account_id
      LEFT JOIN transactions t ON te.transaction_id = t.id
      WHERE a.is_active = 1 
        AND a.type IN ('asset', 'liability', 'equity')
        AND (t.date IS NULL OR t.date <= ?)
      GROUP BY a.id, a.code, a.name, a.type, a.parent_id
      ORDER BY a.type, a.code
    `, [asOfDate]);

    const assets = balanceSheet.filter(acc => acc.type === 'asset');
    const liabilities = balanceSheet.filter(acc => acc.type === 'liability');
    const equity = balanceSheet.filter(acc => acc.type === 'equity');

    const totalAssets = assets.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
    const totalEquity = equity.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);

    res.json({
      as_of_date: asOfDate,
      assets: {
        accounts: assets,
        total: totalAssets
      },
      liabilities: {
        accounts: liabilities,
        total: totalLiabilities
      },
      equity: {
        accounts: equity,
        total: totalEquity
      },
      totals: {
        assets: totalAssets,
        liabilities_and_equity: totalLiabilities + totalEquity
      }
    });
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profit & Loss Statement
router.get('/profit-loss', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const fromDate = req.query.from_date as string;
    const toDate = req.query.to_date as string || new Date().toISOString().split('T')[0];

    if (!fromDate) {
      return res.status(400).json({ error: 'from_date is required' });
    }

    const profitLoss = await db.all(`
      SELECT 
        a.id,
        a.code,
        a.name,
        a.type,
        a.parent_id,
        COALESCE(SUM(te.credit_amount), 0) - COALESCE(SUM(te.debit_amount), 0) as balance
      FROM accounts a
      LEFT JOIN transaction_entries te ON a.id = te.account_id
      LEFT JOIN transactions t ON te.transaction_id = t.id
      WHERE a.is_active = 1 
        AND a.type IN ('income', 'expense')
        AND t.date >= ? AND t.date <= ?
      GROUP BY a.id, a.code, a.name, a.type, a.parent_id
      ORDER BY a.type, a.code
    `, [fromDate, toDate]);

    const income = profitLoss.filter(acc => acc.type === 'income');
    const expenses = profitLoss.filter(acc => acc.type === 'expense');

    const totalIncome = income.reduce((sum, acc) => sum + acc.balance, 0);
    const totalExpenses = expenses.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
    const netIncome = totalIncome - totalExpenses;

    res.json({
      period: { from: fromDate, to: toDate },
      income: {
        accounts: income,
        total: totalIncome
      },
      expenses: {
        accounts: expenses,
        total: totalExpenses
      },
      net_income: netIncome
    });
  } catch (error) {
    console.error('Error generating profit & loss:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cash Flow Statement
router.get('/cash-flow', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const fromDate = req.query.from_date as string;
    const toDate = req.query.to_date as string || new Date().toISOString().split('T')[0];

    if (!fromDate) {
      return res.status(400).json({ error: 'from_date is required' });
    }

    // Get cash account transactions
    const cashTransactions = await db.all(`
      SELECT 
        t.date,
        t.description,
        te.debit_amount,
        te.credit_amount,
        te.debit_amount - te.credit_amount as net_change
      FROM transaction_entries te
      JOIN transactions t ON te.transaction_id = t.id
      JOIN accounts a ON te.account_id = a.id
      WHERE a.name LIKE '%Cash%' 
        AND t.date >= ? AND t.date <= ?
      ORDER BY t.date
    `, [fromDate, toDate]);

    const totalCashIn = cashTransactions.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
    const totalCashOut = cashTransactions.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
    const netCashFlow = totalCashIn - totalCashOut;

    res.json({
      period: { from: fromDate, to: toDate },
      transactions: cashTransactions,
      summary: {
        cash_in: totalCashIn,
        cash_out: totalCashOut,
        net_cash_flow: netCashFlow
      }
    });
  } catch (error) {
    console.error('Error generating cash flow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ledger Report
router.get('/ledger/:accountId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const accountId = req.params.accountId;
    const fromDate = req.query.from_date as string;
    const toDate = req.query.to_date as string || new Date().toISOString().split('T')[0];

    // Get account details
    const account = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    let query = `
      SELECT 
        t.date,
        t.transaction_number,
        t.description,
        te.debit_amount,
        te.credit_amount,
        te.description as entry_description
      FROM transaction_entries te
      JOIN transactions t ON te.transaction_id = t.id
      WHERE te.account_id = ?
    `;
    let params = [accountId];

    if (fromDate) {
      query += ' AND t.date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND t.date <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY t.date, t.id';

    const transactions = await db.all(query, params);

    // Calculate running balance
    let runningBalance = 0;
    const transactionsWithBalance = transactions.map(tx => {
      runningBalance += (tx.debit_amount || 0) - (tx.credit_amount || 0);
      return {
        ...tx,
        running_balance: runningBalance
      };
    });

    res.json({
      account,
      period: { from: fromDate, to: toDate },
      transactions: transactionsWithBalance,
      final_balance: runningBalance
    });
  } catch (error) {
    console.error('Error generating ledger report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Aging Report
router.get('/aging', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const asOfDate = req.query.as_of_date as string || new Date().toISOString().split('T')[0];
    const type = req.query.type as string || 'receivable'; // receivable or payable

    const accountType = type === 'receivable' ? 'Accounts Receivable' : 'Accounts Payable';

    // This is a simplified aging report - in a real system you'd track individual invoices
    const agingData = await db.all(`
      SELECT 
        t.date,
        t.description,
        t.reference,
        te.debit_amount,
        te.credit_amount,
        JULIANDAY(?) - JULIANDAY(t.date) as days_old
      FROM transaction_entries te
      JOIN transactions t ON te.transaction_id = t.id
      JOIN accounts a ON te.account_id = a.id
      WHERE a.name LIKE ?
        AND t.date <= ?
      ORDER BY t.date
    `, [asOfDate, `%${accountType}%`, asOfDate]);

    const aging = {
      current: [],
      days_30: [],
      days_60: [],
      days_90: [],
      over_90: []
    };

    agingData.forEach(item => {
      const amount = type === 'receivable' ? item.debit_amount : item.credit_amount;
      if (amount > 0) {
        if (item.days_old <= 30) aging.current.push(item);
        else if (item.days_old <= 60) aging.days_30.push(item);
        else if (item.days_old <= 90) aging.days_60.push(item);
        else if (item.days_old <= 120) aging.days_90.push(item);
        else aging.over_90.push(item);
      }
    });

    const totals = {
      current: aging.current.reduce((sum, item) => sum + (type === 'receivable' ? item.debit_amount : item.credit_amount), 0),
      days_30: aging.days_30.reduce((sum, item) => sum + (type === 'receivable' ? item.debit_amount : item.credit_amount), 0),
      days_60: aging.days_60.reduce((sum, item) => sum + (type === 'receivable' ? item.debit_amount : item.credit_amount), 0),
      days_90: aging.days_90.reduce((sum, item) => sum + (type === 'receivable' ? item.debit_amount : item.credit_amount), 0),
      over_90: aging.over_90.reduce((sum, item) => sum + (type === 'receivable' ? item.debit_amount : item.credit_amount), 0)
    };

    res.json({
      type,
      as_of_date: asOfDate,
      aging,
      totals,
      grand_total: Object.values(totals).reduce((sum, total) => sum + total, 0)
    });
  } catch (error) {
    console.error('Error generating aging report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;