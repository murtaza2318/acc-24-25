import express from 'express';
import Joi from 'joi';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const itemSchema = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  unit: Joi.string().default('pcs'),
  cost_price: Joi.number().min(0).default(0),
  selling_price: Joi.number().min(0).default(0),
  minimum_stock: Joi.number().min(0).default(0)
});

const stockMovementSchema = Joi.object({
  item_id: Joi.number().required(),
  movement_type: Joi.string().valid('in', 'out', 'adjustment').required(),
  quantity: Joi.number().required(),
  unit_cost: Joi.number().min(0),
  reference: Joi.string().allow(''),
  date: Joi.date().required()
});

// Get all inventory items
router.get('/items', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const items = await db.all(`
      SELECT * FROM inventory_items 
      WHERE is_active = 1 
      ORDER BY code
    `);
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get inventory item by ID
router.get('/items/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const item = await db.get(`
      SELECT * FROM inventory_items 
      WHERE id = ? AND is_active = 1
    `, [req.params.id]);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new inventory item
router.post('/items', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = itemSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { code, name, description, unit, cost_price, selling_price, minimum_stock } = req.body;
    const db = Database.getInstance();

    // Check if item code already exists
    const existingItem = await db.get('SELECT id FROM inventory_items WHERE code = ?', [code]);
    if (existingItem) {
      return res.status(409).json({ error: 'Item code already exists' });
    }

    const result = await db.run(`
      INSERT INTO inventory_items (code, name, description, unit, cost_price, selling_price, minimum_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [code, name, description, unit, cost_price, selling_price, minimum_stock]);

    const newItem = await db.get('SELECT * FROM inventory_items WHERE id = ?', [result.lastID]);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update inventory item
router.put('/items/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = itemSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { code, name, description, unit, cost_price, selling_price, minimum_stock } = req.body;
    const db = Database.getInstance();

    // Check if item exists
    const existingItem = await db.get('SELECT id FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if new code conflicts with another item
    const codeConflict = await db.get(
      'SELECT id FROM inventory_items WHERE code = ? AND id != ?',
      [code, req.params.id]
    );
    if (codeConflict) {
      return res.status(409).json({ error: 'Item code already exists' });
    }

    await db.run(`
      UPDATE inventory_items 
      SET code = ?, name = ?, description = ?, unit = ?, cost_price = ?, selling_price = ?, minimum_stock = ?
      WHERE id = ?
    `, [code, name, description, unit, cost_price, selling_price, minimum_stock, req.params.id]);

    const updatedItem = await db.get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete inventory item (soft delete)
router.delete('/items/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();

    // Check if item exists
    const item = await db.get('SELECT id FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await db.run('UPDATE inventory_items SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock movements
router.get('/movements', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const itemId = req.query.item_id as string;

    let query = `
      SELECT sm.*, i.code as item_code, i.name as item_name, u.username as created_by_name
      FROM stock_movements sm
      JOIN inventory_items i ON sm.item_id = i.id
      LEFT JOIN users u ON sm.created_by = u.id
    `;
    let params: any[] = [];

    if (itemId) {
      query += ' WHERE sm.item_id = ?';
      params.push(itemId);
    }

    query += ' ORDER BY sm.date DESC, sm.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const movements = await db.all(query, params);

    let countQuery = 'SELECT COUNT(*) as count FROM stock_movements';
    let countParams: any[] = [];
    if (itemId) {
      countQuery += ' WHERE item_id = ?';
      countParams.push(itemId);
    }

    const totalCount = await db.get(countQuery, countParams);

    res.json({
      movements,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        pages: Math.ceil(totalCount.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create stock movement
router.post('/movements', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { error } = stockMovementSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { item_id, movement_type, quantity, unit_cost, reference, date } = req.body;
    const db = Database.getInstance();

    // Check if item exists
    const item = await db.get('SELECT id, current_stock FROM inventory_items WHERE id = ?', [item_id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Calculate new stock level
    let stockChange = 0;
    if (movement_type === 'in') {
      stockChange = quantity;
    } else if (movement_type === 'out') {
      stockChange = -quantity;
      // Check if sufficient stock
      if (item.current_stock + stockChange < 0) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    } else if (movement_type === 'adjustment') {
      stockChange = quantity - item.current_stock;
    }

    await db.run('BEGIN TRANSACTION');

    try {
      // Insert stock movement
      const result = await db.run(`
        INSERT INTO stock_movements (item_id, movement_type, quantity, unit_cost, reference, date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [item_id, movement_type, quantity, unit_cost, reference, date, req.user!.id]);

      // Update item stock
      await db.run(
        'UPDATE inventory_items SET current_stock = current_stock + ? WHERE id = ?',
        [stockChange, item_id]
      );

      await db.run('COMMIT');

      const newMovement = await db.get(`
        SELECT sm.*, i.code as item_code, i.name as item_name, u.username as created_by_name
        FROM stock_movements sm
        JOIN inventory_items i ON sm.item_id = i.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE sm.id = ?
      `, [result.lastID]);

      res.status(201).json(newMovement);
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating stock movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get low stock items
router.get('/low-stock', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const items = await db.all(`
      SELECT * FROM inventory_items 
      WHERE is_active = 1 AND current_stock <= minimum_stock
      ORDER BY (current_stock - minimum_stock) ASC
    `);
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get inventory valuation
router.get('/valuation', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    const valuation = await db.all(`
      SELECT 
        i.*,
        (i.current_stock * i.cost_price) as cost_value,
        (i.current_stock * i.selling_price) as selling_value
      FROM inventory_items i
      WHERE i.is_active = 1 AND i.current_stock > 0
      ORDER BY cost_value DESC
    `);

    const totals = await db.get(`
      SELECT 
        SUM(current_stock * cost_price) as total_cost_value,
        SUM(current_stock * selling_price) as total_selling_value,
        COUNT(*) as total_items
      FROM inventory_items 
      WHERE is_active = 1 AND current_stock > 0
    `);
    
    res.json({
      items: valuation,
      totals
    });
  } catch (error) {
    console.error('Error fetching inventory valuation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;