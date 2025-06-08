import { useQuery } from 'react-query';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Package, 
  Receipt,
  AlertTriangle
} from 'lucide-react';
import api from '../services/api';

interface DashboardStats {
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  monthly_revenue: number;
  monthly_expenses: number;
  net_income: number;
  total_accounts: number;
  total_transactions: number;
  total_vouchers: number;
  total_inventory_items: number;
  low_stock_items: number;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>(
    'dashboard-stats',
    async () => {
      // This would be a dedicated dashboard endpoint in a real app
      // For now, we'll simulate the data
      return {
        total_assets: 125000,
        total_liabilities: 45000,
        total_equity: 80000,
        monthly_revenue: 25000,
        monthly_expenses: 18000,
        net_income: 7000,
        total_accounts: 23,
        total_transactions: 156,
        total_vouchers: 89,
        total_inventory_items: 45,
        low_stock_items: 3,
      };
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      name: 'Total Assets',
      value: `$${stats?.total_assets.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Monthly Revenue',
      value: `$${stats?.monthly_revenue.toLocaleString()}`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Monthly Expenses',
      value: `$${stats?.monthly_expenses.toLocaleString()}`,
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      name: 'Net Income',
      value: `$${stats?.net_income.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ];

  const activityCards = [
    {
      name: 'Total Accounts',
      value: stats?.total_accounts,
      icon: Users,
      href: '/accounts',
    },
    {
      name: 'Transactions',
      value: stats?.total_transactions,
      icon: Receipt,
      href: '/transactions',
    },
    {
      name: 'Vouchers',
      value: stats?.total_vouchers,
      icon: Receipt,
      href: '/vouchers',
    },
    {
      name: 'Inventory Items',
      value: stats?.total_inventory_items,
      icon: Package,
      href: '/inventory',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome to your modern accounting system
        </p>
      </div>

      {/* Financial Overview */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.name} className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`p-3 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{card.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity Overview */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {activityCards.map((card) => (
          <div key={card.name} className="card hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{card.name}</p>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              </div>
              <div className="flex-shrink-0">
                <card.icon className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {stats?.low_stock_items && stats.low_stock_items > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
            <p className="text-sm text-yellow-800">
              <span className="font-medium">{stats.low_stock_items} items</span> are running low on stock.
              <a href="/inventory" className="ml-1 underline hover:text-yellow-900">
                View inventory
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/transactions"
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Receipt className="h-5 w-5 text-primary-600 mr-3" />
            <span className="text-sm font-medium text-gray-900">New Transaction</span>
          </a>
          <a
            href="/vouchers"
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Receipt className="h-5 w-5 text-primary-600 mr-3" />
            <span className="text-sm font-medium text-gray-900">Create Voucher</span>
          </a>
          <a
            href="/accounts"
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users className="h-5 w-5 text-primary-600 mr-3" />
            <span className="text-sm font-medium text-gray-900">Manage Accounts</span>
          </a>
          <a
            href="/reports"
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <TrendingUp className="h-5 w-5 text-primary-600 mr-3" />
            <span className="text-sm font-medium text-gray-900">View Reports</span>
          </a>
        </div>
      </div>
    </div>
  );
}