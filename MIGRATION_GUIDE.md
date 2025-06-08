# Data Migration Guide: From telelnk.mdb to Modern Accounting System

This guide will help you migrate your existing data from the `telelnk.mdb` Microsoft Access database to the new modern accounting system.

## 📋 Pre-Migration Checklist

- [ ] Backup your original `telelnk.mdb` file
- [ ] Install Microsoft Access or MDB Tools
- [ ] Ensure the modern accounting system is running
- [ ] Have admin access to the new system

## 🔍 Step 1: Analyze Your Current Database

First, let's understand the structure of your `telelnk.mdb` database:

### Using Microsoft Access
1. Open `telelnk.mdb` in Microsoft Access
2. Go to the Database window
3. Note down all table names and their purposes
4. Check the relationships between tables

### Using MDB Tools (Linux/Mac)
```bash
# List all tables
mdb-tables telelnk.mdb

# Show table structure
mdb-schema telelnk.mdb

# Preview data from a table
mdb-export telelnk.mdb TableName | head -10
```

### Common Table Names to Look For
Based on typical accounting systems, your database likely contains:

| Table Name | Purpose | Priority |
|------------|---------|----------|
| Accounts / ChartOfAccounts | Account master | High |
| Transactions / JournalEntries | Transaction data | High |
| Vouchers / PaymentVouchers / ReceiptVouchers | Voucher data | High |
| Items / Inventory / Products | Item master | Medium |
| Customers / Suppliers / Vendors | Party master | Medium |
| Companies / CompanyInfo | Company details | Low |

## 📤 Step 2: Export Data from Access Database

### Method 1: Using Microsoft Access (Recommended)

For each important table:

1. **Open the table** in Access
2. **Right-click** on the table name
3. **Select "Export" → "Text File"**
4. **Choose settings:**
   - Format: Delimited
   - Delimiter: Comma
   - Text Qualifier: " (double quote)
   - ✅ Include Field Names on First Row
5. **Save as:** `TableName.csv`

### Method 2: Using MDB Tools

```bash
# Export all tables to CSV
for table in $(mdb-tables telelnk.mdb); do
    echo "Exporting $table..."
    mdb-export telelnk.mdb "$table" > "${table}.csv"
done
```

### Method 3: Using Python Script

Create a file called `export_access.py`:

```python
import pandas as pd
import pypyodbc
import os

# Database connection
db_path = "path/to/your/telelnk.mdb"
conn_str = f'Driver={{Microsoft Access Driver (*.mdb)}};DBQ={db_path};'

try:
    conn = pypyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Get all table names
    cursor.execute("SELECT Name FROM MSysObjects WHERE Type=1 AND Flags=0")
    tables = [row[0] for row in cursor.fetchall()]
    
    # Export each table
    for table in tables:
        try:
            print(f"Exporting {table}...")
            df = pd.read_sql(f'SELECT * FROM [{table}]', conn)
            df.to_csv(f'{table}.csv', index=False)
            print(f"✅ {table}.csv created with {len(df)} records")
        except Exception as e:
            print(f"❌ Error exporting {table}: {e}")
    
    conn.close()
    print("🎉 Export completed!")
    
except Exception as e:
    print(f"❌ Connection error: {e}")
    print("Make sure you have the Microsoft Access Database Engine installed")
```

Run the script:
```bash
pip install pandas pypyodbc
python export_access.py
```

## 🔄 Step 3: Data Mapping and Transformation

### Chart of Accounts Mapping

Your Access database accounts table likely has these fields:
```
AccountCode, AccountName, AccountType, ParentAccount, OpeningBalance
```

Map to modern system format:
```csv
code,name,type,parent_id,balance
1000,Cash,asset,,5000.00
1100,Bank Account,asset,1,25000.00
2000,Accounts Payable,liability,,3000.00
```

**Account Type Mapping:**
- `Asset` → `asset`
- `Liability` → `liability`
- `Capital/Equity` → `equity`
- `Income/Revenue` → `income`
- `Expense/Cost` → `expense`

### Transaction Data Mapping

Your transactions might be in multiple tables. Common structures:

**Single Transaction Table:**
```
TransactionID, Date, Description, AccountCode, DebitAmount, CreditAmount
```

**Separate Header/Detail Tables:**
```
TransactionHeader: ID, Date, Description, Reference, TotalAmount
TransactionDetail: HeaderID, AccountCode, DebitAmount, CreditAmount
```

Transform to modern format:
```json
{
  "date": "2024-01-15",
  "description": "Office supplies purchase",
  "reference": "INV-001",
  "entries": [
    {
      "account_id": 15,
      "debit_amount": 500,
      "credit_amount": 0,
      "description": "Office supplies"
    },
    {
      "account_id": 3,
      "debit_amount": 0,
      "credit_amount": 500,
      "description": "Cash payment"
    }
  ]
}
```

## 📥 Step 4: Import Data to Modern System

### Using the Web Interface

1. **Login** to the modern accounting system
2. **Go to Settings** → Data Migration
3. **Upload CSV files** one by one
4. **Map fields** if prompted
5. **Review and confirm** the import

### Using API Endpoints

```bash
# Import accounts
curl -X POST http://localhost:12000/api/migrate/accounts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@accounts.csv"

# Import transactions
curl -X POST http://localhost:12000/api/migrate/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@transactions.csv"
```

### Using Custom Migration Script

Create `migrate_data.js`:

```javascript
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const API_BASE = 'http://localhost:12000/api';
const TOKEN = 'your-auth-token-here';

async function migrateAccounts() {
  const accounts = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream('accounts.csv')
      .pipe(csv())
      .on('data', (row) => {
        accounts.push({
          code: row.AccountCode,
          name: row.AccountName,
          type: mapAccountType(row.AccountType),
          balance: parseFloat(row.OpeningBalance || 0)
        });
      })
      .on('end', async () => {
        try {
          for (const account of accounts) {
            await axios.post(`${API_BASE}/accounts`, account, {
              headers: { Authorization: `Bearer ${TOKEN}` }
            });
            console.log(`✅ Imported account: ${account.name}`);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
  });
}

function mapAccountType(accessType) {
  const type = accessType.toLowerCase();
  if (type.includes('asset')) return 'asset';
  if (type.includes('liability')) return 'liability';
  if (type.includes('equity') || type.includes('capital')) return 'equity';
  if (type.includes('income') || type.includes('revenue')) return 'income';
  if (type.includes('expense') || type.includes('cost')) return 'expense';
  return 'asset'; // default
}

// Run migration
migrateAccounts()
  .then(() => console.log('🎉 Migration completed!'))
  .catch(error => console.error('❌ Migration failed:', error));
```

## ✅ Step 5: Verification and Validation

### 1. Verify Account Balances
```sql
-- In your old system, check total debits and credits
SELECT SUM(DebitAmount) as TotalDebits, SUM(CreditAmount) as TotalCredits 
FROM Transactions;

-- In new system, verify trial balance
GET /api/reports/trial-balance
```

### 2. Check Transaction Count
```sql
-- Old system
SELECT COUNT(*) FROM Transactions;

-- New system
GET /api/transactions?limit=1
-- Check pagination.total
```

### 3. Verify Key Reports
- Generate Trial Balance in both systems
- Compare Balance Sheet totals
- Check a few account ledgers

### 4. Test Functionality
- [ ] Create a new transaction
- [ ] Generate reports
- [ ] Check account balances
- [ ] Verify user access

## 🔧 Troubleshooting Common Issues

### Issue: "Account code already exists"
**Solution:** Check for duplicate account codes in your CSV file

### Issue: "Invalid account type"
**Solution:** Ensure account types are one of: asset, liability, equity, income, expense

### Issue: "Debits don't equal credits"
**Solution:** Verify your transaction entries balance before import

### Issue: "Date format error"
**Solution:** Ensure dates are in YYYY-MM-DD format

### Issue: "Parent account not found"
**Solution:** Import parent accounts before child accounts

## 📊 Post-Migration Tasks

### 1. Update Opening Balances
If your opening balances don't match:
```bash
POST /api/transactions
{
  "date": "2024-01-01",
  "description": "Opening Balance Adjustment",
  "entries": [
    // Adjustment entries
  ]
}
```

### 2. Set Up User Accounts
- Create user accounts for your team
- Assign appropriate roles
- Test access permissions

### 3. Configure Company Information
- Update company details
- Set fiscal year
- Configure report preferences

### 4. Train Users
- Provide system overview
- Show key differences from old system
- Create user documentation

## 🆘 Getting Help

If you encounter issues during migration:

1. **Check the logs** in the browser console and server logs
2. **Verify data format** matches expected schema
3. **Test with small data sets** first
4. **Contact support** with specific error messages

## 📋 Migration Checklist

- [ ] Database analyzed and understood
- [ ] Data exported to CSV files
- [ ] Data cleaned and formatted
- [ ] Accounts imported successfully
- [ ] Transactions imported successfully
- [ ] Vouchers imported (if applicable)
- [ ] Inventory items imported (if applicable)
- [ ] Balances verified and match
- [ ] Reports generated and reviewed
- [ ] Users trained on new system
- [ ] Old system archived safely

---

**Remember:** Keep your original `telelnk.mdb` file as a backup until you're completely satisfied with the migration!