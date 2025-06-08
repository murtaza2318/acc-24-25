import express from 'express';
import Joi from 'joi';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const transactionEntrySchema = Joi.object({
  account_id: Joi.number().required(),
  debit_amount: Joi.number().min(0).default(0),
  credit_amount: Joi.number().min(0).default(0),
  description: Joi.string().allow('')
});

const transactionSchema = Joi.object({
  date: Joi.date().required(),
  description: Joi.string().required(),
  reference: Joi.string().allow(''),
  entries: Joi.array().items(transactionEntrySchema).min(2).required()
}).custom((value, helpers) => {
  const totalDebits = value.entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0);
  const totalCredits = value.entries.reduce((sum: number, entry: any) => sum + (entry.credit_amount || 0), 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return helpers.error('any.invalid', { message: 'Total debits must equal total credits' });
  }
  
  return value;
});

// Get all transactions
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const transactions = await db.all(`
      SELECT t.*, u.username as created_by_name
      FROM transactions t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    // Get entries for each transaction
    for (const transaction of transactions) {
      const entries = await db.all(`
        SELECT te.*, a.code as account_code, a.name as account_name
        FROM transaction_entries te
        JOIN accounts a ON te.account_id = a.id
        WHERE te.transaction_id = ?
        ORDER BY te.id
      `, [transaction.id]);
      transaction.entries = entries;
    }

    const totalCount = await db.get('SELECT COUNT(*) as count FROM transactions');

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    
    const transaction = await db.get(`
      SELECT t.*, u.username as created_by_name
      FROM transactions t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const entries = await db.all(`
      SELECT te.*, a.code as account_code, a.name as account_name
      FROM transaction_entries te
      JOIN accounts a ON te.account_id = a.id
      WHERE te.transaction_id = ?
      ORDER BY te.id
    `, [transaction.id]);

    transaction.entries = entries;
    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new transaction
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { date, description, reference, entries } = req.body;
    const db = Database.getInstance();

    // Generate transaction number
    const lastTransaction = await db.get(
      'SELECT transaction_number FROM transactions ORDER BY id DESC LIMIT 1'
    );
    
    let nextNumber = 1;
    if (lastTransaction) {
      const match = lastTransaction.transaction_number.match(/TXN(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const transactionNumber = `TXN${nextNumber.toString().padStart(6, '0')}`;

    const totalAmount = entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0);

    // Start transaction
    await db.run('BEGIN TRANSACTION');

    try {
      // Insert transaction
      const transactionResult = await db.run(`
        INSERT INTO transactions (transaction_number, date, description, reference, total_amount, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [transactionNumber, date, description, reference, totalAmount, req.user!.id]);

      // Insert entries
      for (const entry of entries) {
        await db.run(`
          INSERT INTO transaction_entries (transaction_id, account_id, debit_amount, credit_amount, description)
          VALUES (?, ?, ?, ?, ?)
        `, [transactionResult.lastID, entry.account_id, entry.debit_amount || 0, entry.credit_amount || 0, entry.description || '']);

        // Update account balance
        const balanceChange = (entry.debit_amount || 0) - (entry.credit_amount || 0);
        await db.run(
          'UPDATE accounts SET balance = balance + ? WHERE id = ?',
          [balanceChange, entry.account_id]
        );
      }

      await db.run('COMMIT');

      // Fetch the created transaction with entries
      const newTransaction = await db.get(`
        SELECT t.*, u.username as created_by_name
        FROM transactions t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ?
      `, [transactionResult.lastID]);

      const newEntries = await db.all(`
        SELECT te.*, a.code as account_code, a.name as account_name
        FROM transaction_entries te
        JOIN accounts a ON te.account_id = a.id
        WHERE te.transaction_id = ?
        ORDER BY te.id
      `, [transactionResult.lastID]);

      newTransaction.entries = newEntries;
      res.status(201).json(newTransaction);
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transaction
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { date, description, reference, entries } = req.body;
    const db = Database.getInstance();

    // Check if transaction exists
    const existingTransaction = await db.get('SELECT id FROM transactions WHERE id = ?', [req.params.id]);
    if (!existingTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const totalAmount = entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0);

    await db.run('BEGIN TRANSACTION');

    try {
      // Reverse old entries from account balances
      const oldEntries = await db.all(
        'SELECT account_id, debit_amount, credit_amount FROM transaction_entries WHERE transaction_id = ?',
        [req.params.id]
      );

      for (const entry of oldEntries) {
        const balanceChange = (entry.credit_amount || 0) - (entry.debit_amount || 0);
        await db.run(
          'UPDATE accounts SET balance = balance + ? WHERE id = ?',
          [balanceChange, entry.account_id]
        );
      }

      // Delete old entries
      await db.run('DELETE FROM transaction_entries WHERE transaction_id = ?', [req.params.id]);

      // Update transaction
      await db.run(`
        UPDATE transactions 
        SET date = ?, description = ?, reference = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [date, description, reference, totalAmount, req.params.id]);

      // Insert new entries
      for (const entry of entries) {
        await db.run(`
          INSERT INTO transaction_entries (transaction_id, account_id, debit_amount, credit_amount, description)
          VALUES (?, ?, ?, ?, ?)
        `, [req.params.id, entry.account_id, entry.debit_amount || 0, entry.credit_amount || 0, entry.description || '']);

        // Update account balance
        const balanceChange = (entry.debit_amount || 0) - (entry.credit_amount || 0);
        await db.run(
          'UPDATE accounts SET balance = balance + ? WHERE id = ?',
          [balanceChange, entry.account_id]
        );
      }

      await db.run('COMMIT');

      // Fetch updated transaction
      const updatedTransaction = await db.get(`
        SELECT t.*, u.username as created_by_name
        FROM transactions t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ?
      `, [req.params.id]);

      const updatedEntries = await db.all(`
        SELECT te.*, a.code as account_code, a.name as account_name
        FROM transaction_entries te
        JOIN accounts a ON te.account_id = a.id
        WHERE te.transaction_id = ?
        ORDER BY te.id
      `, [req.params.id]);

      updatedTransaction.entries = updatedEntries;
      res.json(updatedTransaction);
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete transaction
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    // Check if transaction exists
    const transaction = await db.get('SELECT id FROM transactions WHERE id = ?', [req.params.id]);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await db.run('BEGIN TRANSACTION');

    try {
      // Reverse entries from account balances
      const entries = await db.all(
        'SELECT account_id, debit_amount, credit_amount FROM transaction_entries WHERE transaction_id = ?',
        [req.params.id]
      );

      for (const entry of entries) {
        const balanceChange = (entry.credit_amount || 0) - (entry.debit_amount || 0);
        await db.run(
          'UPDATE accounts SET balance = balance + ? WHERE id = ?',
          [balanceChange, entry.account_id]
        );
      }

      // Delete entries and transaction
      await db.run('DELETE FROM transaction_entries WHERE transaction_id = ?', [req.params.id]);
      await db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);

      await db.run('COMMIT');
      res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;