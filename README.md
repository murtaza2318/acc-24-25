# Modern Accounting System

A comprehensive, web-based accounting system built with modern technologies to replace legacy desktop applications. This system provides all the essential accounting features with a modern, responsive interface.

## 🚀 Features

### Core Accounting
- **Chart of Accounts Management** - Hierarchical account structure
- **Double-Entry Bookkeeping** - Automatic balance validation
- **Journal Entries & Transactions** - Complete transaction management
- **Voucher System** - Payment, Receipt, and Journal vouchers
- **Multi-Currency Support** (planned)

### Financial Reporting
- **Trial Balance** - Real-time trial balance generation
- **Balance Sheet** - Assets, Liabilities, and Equity reporting
- **Profit & Loss Statement** - Income and expense analysis
- **Cash Flow Statement** - Cash movement tracking
- **Ledger Reports** - Detailed account-wise transactions
- **Aging Reports** - Accounts receivable/payable aging

### Inventory Management
- **Item Master** - Product/service catalog
- **Stock Movements** - In, Out, and Adjustment tracking
- **Stock Valuation** - FIFO/LIFO/Average costing
- **Low Stock Alerts** - Automatic reorder notifications
- **Inventory Reports** - Stock status and valuation

### Modern Features
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Updates** - Live data synchronization
- **User Management** - Role-based access control
- **Data Export** - PDF and Excel export capabilities
- **Backup & Restore** - Automated data backup
- **API-First Architecture** - RESTful API for integrations

## 🛠 Technology Stack

### Backend
- **Node.js** with **TypeScript** - Server runtime and language
- **Express.js** - Web framework
- **SQLite** - Database (easily upgradeable to PostgreSQL)
- **JWT** - Authentication and authorization
- **Joi** - Data validation
- **bcryptjs** - Password hashing

### Frontend
- **React 18** with **TypeScript** - UI framework and language
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **React Query** - Data fetching and caching
- **React Hook Form** - Form management
- **Chart.js** - Data visualization
- **Lucide React** - Icon library

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Git

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd modern-accounting-system
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Start the application**
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:12001
   - Backend API: http://localhost:12000

### Default Login Credentials
- **Username:** admin
- **Password:** admin123

## 🔄 Data Migration from Legacy Systems

### From Microsoft Access (.mdb files)

If you have an existing Access database (like `telelnk.mdb`), follow these steps:

#### Option 1: Using Access Export (Recommended)
1. Open your `.mdb` file in Microsoft Access
2. For each table:
   - Right-click table → Export → Text File
   - Choose "Delimited" format with comma separator
   - Include field names in first row
   - Save as CSV file

#### Option 2: Using MDB Tools (Linux/Mac)
```bash
# Install mdb-tools
sudo apt-get install mdb-tools  # Ubuntu/Debian
brew install mdb-tools          # macOS

# List tables
mdb-tables your-database.mdb

# Export each table
mdb-export your-database.mdb TableName > TableName.csv
```

#### Option 3: Using Python Script
```python
import pandas as pd
import pypyodbc

# Connect to Access database
conn = pypyodbc.connect(r'Driver={Microsoft Access Driver (*.mdb)};DBQ=path\to\your\database.mdb;')

# Export each table
tables = ['Accounts', 'Transactions', 'Vouchers', 'Items']
for table in tables:
    df = pd.read_sql(f'SELECT * FROM {table}', conn)
    df.to_csv(f'{table}.csv', index=False)
```

### Common Table Mappings

| Legacy Table | Modern Equivalent | Notes |
|--------------|-------------------|-------|
| Accounts / Chart_of_Accounts | accounts | Account master data |
| Transactions / Journal_Entries | transactions + transaction_entries | Journal entries |
| Vouchers / Payment_Vouchers | vouchers | Payment/Receipt vouchers |
| Items / Inventory / Products | inventory_items | Item master |
| Stock_Movements | stock_movements | Inventory movements |
| Customers / Suppliers | (Custom tables) | Party master data |

### Migration API Endpoints

The system provides API endpoints for data migration:

```bash
# Upload CSV files for migration
POST /api/migrate/import-csv
Content-Type: multipart/form-data

# Export current data
GET /api/migrate/export
```

## 🏗 Project Structure

```
modern-accounting-system/
├── server/                 # Backend application
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── routes/         # API routes
│   │   ├── models/         # Data models
│   │   ├── middleware/     # Custom middleware
│   │   ├── database/       # Database setup and migrations
│   │   └── utils/          # Utility functions
│   └── data/              # SQLite database files
├── client/                # Frontend application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   └── public/           # Static assets
└── docs/                 # Documentation
```

## 🔧 Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start both server and client in development mode
npm run dev

# Start only server
npm run server:dev

# Start only client
npm run client:dev

# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables

Create `.env` files in the server directory:

```env
# Server configuration
PORT=12000
JWT_SECRET=your-secret-key-here
NODE_ENV=development

# Database configuration
DB_PATH=./data/accounting.db
```

## 📊 API Documentation

### Authentication
```bash
# Login
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# Register new user
POST /api/auth/register
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123"
}
```

### Accounts
```bash
# Get all accounts
GET /api/accounts

# Create account
POST /api/accounts
{
  "code": "1110",
  "name": "Petty Cash",
  "type": "asset",
  "parent_id": 3
}

# Get account balance
GET /api/accounts/:id/balance
```

### Transactions
```bash
# Get transactions
GET /api/transactions?page=1&limit=20

# Create transaction
POST /api/transactions
{
  "date": "2024-01-15",
  "description": "Office supplies purchase",
  "entries": [
    {
      "account_id": 1,
      "debit_amount": 500,
      "credit_amount": 0
    },
    {
      "account_id": 2,
      "debit_amount": 0,
      "credit_amount": 500
    }
  ]
}
```

### Reports
```bash
# Trial Balance
GET /api/reports/trial-balance?as_of_date=2024-01-31

# Balance Sheet
GET /api/reports/balance-sheet?as_of_date=2024-01-31

# Profit & Loss
GET /api/reports/profit-loss?from_date=2024-01-01&to_date=2024-01-31

# Ledger Report
GET /api/reports/ledger/:accountId?from_date=2024-01-01&to_date=2024-01-31
```

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt password encryption
- **Input Validation** - Joi schema validation
- **SQL Injection Prevention** - Parameterized queries
- **CORS Protection** - Configurable CORS policies
- **Rate Limiting** - API rate limiting (planned)

## 🚀 Deployment

### Production Build
```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment (Planned)
```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 12000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `/docs` folder
- Review the API documentation above

## 🗺 Roadmap

### Phase 1 (Current)
- ✅ Basic accounting functionality
- ✅ User authentication
- ✅ Chart of accounts
- ✅ Transaction management
- ✅ Basic reporting

### Phase 2 (Next)
- 🔄 Advanced reporting with charts
- 🔄 Inventory management
- 🔄 Voucher workflow
- 🔄 Data import/export
- 🔄 User roles and permissions

### Phase 3 (Future)
- 📅 Multi-company support
- 📅 Multi-currency support
- 📅 Advanced analytics
- 📅 Mobile app
- 📅 Third-party integrations

---

**Built with ❤️ for modern businesses**