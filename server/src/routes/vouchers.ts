import express from 'express';
import Joi from 'joi';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const voucherSchema = Joi.object({
  type: Joi.string().valid('payment', 'receipt', 'journal').required(),
  date: Joi.date().required(),
  payee: Joi.string().allow(''),
  amount: Joi.number().min(0).required(),
  description: Joi.string().required(),
  status: Joi.string().valid('draft', 'approved', 'posted').default('draft')
});

// Get all vouchers
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const type = req.query.type as string;

    let query = `
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
    `;
    let params: any[] = [];

    if (type) {
      query += ' WHERE v.type = ?';
      params.push(type);
    }

    query += ' ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const vouchers = await db.all(query, params);

    let countQuery = 'SELECT COUNT(*) as count FROM vouchers';
    let countParams: any[] = [];
    if (type) {
      countQuery += ' WHERE type = ?';
      countParams.push(type);
    }

    const totalCount = await db.get(countQuery, countParams);

    res.json({
      vouchers,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get voucher by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    
    const voucher = await db.get(`
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `, [req.params.id]);

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    res.json(voucher);
  } catch (error) {
    console.error('Error fetching voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new voucher
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = voucherSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { type, date, payee, amount, description, status } = req.body;
    const db = Database.getInstance();

    // Generate voucher number
    const prefix = type === 'payment' ? 'PV' : type === 'receipt' ? 'RV' : 'JV';
    const lastVoucher = await db.get(
      'SELECT voucher_number FROM vouchers WHERE type = ? ORDER BY id DESC LIMIT 1',
      [type]
    );
    
    let nextNumber = 1;
    if (lastVoucher) {
      const match = lastVoucher.voucher_number.match(new RegExp(`${prefix}(\\d+)`));
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const voucherNumber = `${prefix}${nextNumber.toString().padStart(6, '0')}`;

    const result = await db.run(`
      INSERT INTO vouchers (voucher_number, type, date, payee, amount, description, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [voucherNumber, type, date, payee, amount, description, status, req.user!.id]);

    const newVoucher = await db.get(`
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `, [result.lastID]);

    res.status(201).json(newVoucher);
  } catch (error) {
    console.error('Error creating voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update voucher
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = voucherSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { type, date, payee, amount, description, status } = req.body;
    const db = Database.getInstance();

    // Check if voucher exists
    const existingVoucher = await db.get('SELECT id, status FROM vouchers WHERE id = ?', [req.params.id]);
    if (!existingVoucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    // Don't allow editing posted vouchers
    if (existingVoucher.status === 'posted') {
      return res.status(400).json({ error: 'Cannot edit posted vouchers' });
    }

    await db.run(`
      UPDATE vouchers 
      SET type = ?, date = ?, payee = ?, amount = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [type, date, payee, amount, description, status, req.params.id]);

    const updatedVoucher = await db.get(`
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `, [req.params.id]);

    res.json(updatedVoucher);
  } catch (error) {
    console.error('Error updating voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete voucher
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    // Check if voucher exists
    const voucher = await db.get('SELECT id, status FROM vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    // Don't allow deleting posted vouchers
    if (voucher.status === 'posted') {
      return res.status(400).json({ error: 'Cannot delete posted vouchers' });
    }

    await db.run('DELETE FROM vouchers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Voucher deleted successfully' });
  } catch (error) {
    console.error('Error deleting voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve voucher
router.post('/:id/approve', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    const voucher = await db.get('SELECT id, status FROM vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if (voucher.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft vouchers can be approved' });
    }

    await db.run('UPDATE vouchers SET status = ? WHERE id = ?', ['approved', req.params.id]);

    const updatedVoucher = await db.get(`
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `, [req.params.id]);

    res.json(updatedVoucher);
  } catch (error) {
    console.error('Error approving voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post voucher (convert to transaction)
router.post('/:id/post', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    const voucher = await db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if (voucher.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved vouchers can be posted' });
    }

    // This is a simplified posting - in a real system, you'd need to specify
    // which accounts to debit/credit based on the voucher type
    await db.run('UPDATE vouchers SET status = ? WHERE id = ?', ['posted', req.params.id]);

    const updatedVoucher = await db.get(`
      SELECT v.*, u.username as created_by_name
      FROM vouchers v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `, [req.params.id]);

    res.json(updatedVoucher);
  } catch (error) {
    console.error('Error posting voucher:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;