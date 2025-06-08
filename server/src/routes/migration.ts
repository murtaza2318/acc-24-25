import express from 'express';
import multer from 'multer';
import { Database } from '../database/init';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { DataMigration, generateMigrationInstructions } from '../utils/data-migration';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get migration instructions
router.get('/instructions', authenticateToken, (req: AuthRequest, res) => {
  res.json({
    instructions: generateMigrationInstructions(),
    endpoints: {
      import_csv: '/api/migration/import-csv',
      export_data: '/api/migration/export',
      status: '/api/migration/status'
    }
  });
});

// Import CSV file
router.post('/import-csv', authenticateToken, requireRole(['admin']), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tableType = req.body.table_type || 'auto-detect';
    const fs = require('fs');
    const csv = require('csv-parser');
    
    const results: any[] = [];
    const filePath = req.file.path;

    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data: any) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    if (results.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or invalid' });
    }

    // Auto-detect table type if not specified
    let detectedType = tableType;
    if (tableType === 'auto-detect') {
      detectedType = detectTableType(results[0]);
    }

    // Process the data based on type
    const migration = new DataMigration();
    const tableStructure = {
      tableName: detectedType,
      columns: Object.keys(results[0]),
      data: results
    };

    await migration.importFromAccessExport([tableStructure]);

    res.json({
      message: 'Data imported successfully',
      table_type: detectedType,
      records_imported: results.length,
      columns: Object.keys(results[0])
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import data', details: error.message });
  }
});

// Export current data
router.get('/export', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const migration = new DataMigration();
    const exportData = await migration.exportToJson();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="accounting_export.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Get migration status
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = Database.getInstance();
    
    const stats = {
      accounts: await db.get('SELECT COUNT(*) as count FROM accounts WHERE is_active = 1'),
      transactions: await db.get('SELECT COUNT(*) as count FROM transactions'),
      vouchers: await db.get('SELECT COUNT(*) as count FROM vouchers'),
      inventory_items: await db.get('SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1'),
      users: await db.get('SELECT COUNT(*) as count FROM users')
    };

    res.json({
      database_status: 'connected',
      total_records: {
        accounts: stats.accounts.count,
        transactions: stats.transactions.count,
        vouchers: stats.vouchers.count,
        inventory_items: stats.inventory_items.count,
        users: stats.users.count
      },
      migration_ready: true
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get migration status' });
  }
});

// Helper function to detect table type from CSV headers
function detectTableType(firstRow: any): string {
  const headers = Object.keys(firstRow).map(h => h.toLowerCase());
  
  // Check for account-related headers
  if (headers.some(h => h.includes('account') && (h.includes('code') || h.includes('name')))) {
    return 'accounts';
  }
  
  // Check for transaction-related headers
  if (headers.some(h => h.includes('transaction') || h.includes('journal')) ||
      (headers.includes('debit') && headers.includes('credit'))) {
    return 'transactions';
  }
  
  // Check for voucher-related headers
  if (headers.some(h => h.includes('voucher') || h.includes('payment') || h.includes('receipt'))) {
    return 'vouchers';
  }
  
  // Check for inventory-related headers
  if (headers.some(h => h.includes('item') || h.includes('product') || h.includes('stock'))) {
    return 'inventory';
  }
  
  // Default to accounts if unsure
  return 'accounts';
}

export default router;