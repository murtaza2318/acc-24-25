import express from 'express';
import Joi from 'joi';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const accountSchema = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().required(),
  type: Joi.string().valid('asset', 'liability', 'equity', 'income', 'expense').required(),
  parent_id: Joi.number().allow(null)
});

// Get all accounts
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const accounts = await db.all(`
      SELECT a.*, p.name as parent_name 
      FROM accounts a 
      LEFT JOIN accounts p ON a.parent_id = p.id 
      WHERE a.is_active = 1
      ORDER BY a.code
    `);
    
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const account = await db.get(`
      SELECT a.*, p.name as parent_name 
      FROM accounts a 
      LEFT JOIN accounts p ON a.parent_id = p.id 
      WHERE a.id = ? AND a.is_active = 1
    `, [req.params.id]);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(account);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new account
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = accountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { code, name, type, parent_id } = req.body;
    const db = Database.getInstance();

    // Check if account code already exists
    const existingAccount = await db.get('SELECT id FROM accounts WHERE code = ?', [code]);
    if (existingAccount) {
      return res.status(409).json({ error: 'Account code already exists' });
    }

    const result = await db.run(
      'INSERT INTO accounts (code, name, type, parent_id) VALUES (?, ?, ?, ?)',
      [code, name, type, parent_id]
    );

    const newAccount = await db.get(`
      SELECT a.*, p.name as parent_name 
      FROM accounts a 
      LEFT JOIN accounts p ON a.parent_id = p.id 
      WHERE a.id = ?
    `, [result.lastID]);

    res.status(201).json(newAccount);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update account
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = accountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { code, name, type, parent_id } = req.body;
    const db = Database.getInstance();

    // Check if account exists
    const existingAccount = await db.get('SELECT id FROM accounts WHERE id = ?', [req.params.id]);
    if (!existingAccount) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if new code conflicts with another account
    const codeConflict = await db.get(
      'SELECT id FROM accounts WHERE code = ? AND id != ?',
      [code, req.params.id]
    );
    if (codeConflict) {
      return res.status(409).json({ error: 'Account code already exists' });
    }

    await db.run(
      'UPDATE accounts SET code = ?, name = ?, type = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [code, name, type, parent_id, req.params.id]
    );

    const updatedAccount = await db.get(`
      SELECT a.*, p.name as parent_name 
      FROM accounts a 
      LEFT JOIN accounts p ON a.parent_id = p.id 
      WHERE a.id = ?
    `, [req.params.id]);

    res.json(updatedAccount);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account (soft delete)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    // Check if account exists
    const account = await db.get('SELECT id FROM accounts WHERE id = ?', [req.params.id]);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if account has transactions
    const hasTransactions = await db.get(
      'SELECT id FROM transaction_entries WHERE account_id = ? LIMIT 1',
      [req.params.id]
    );
    if (hasTransactions) {
      return res.status(400).json({ error: 'Cannot delete account with existing transactions' });
    }

    await db.run('UPDATE accounts SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account balance
router.get('/:id/balance', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    
    const balance = await db.get(`
      SELECT 
        COALESCE(SUM(debit_amount), 0) as total_debits,
        COALESCE(SUM(credit_amount), 0) as total_credits,
        COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0) as balance
      FROM transaction_entries 
      WHERE account_id = ?
    `, [req.params.id]);

    res.json(balance);
  } catch (error) {
    console.error('Error fetching account balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;