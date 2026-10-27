import { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  ArrowUpRight,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  DollarSign,
  Plus,
} from 'lucide-react';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface OrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  itemsCount: number;
  channel: string;
  createdAt: string;
}

const SAMPLE_ORDERS: OrderItem[] = [
  {
    id: 'ord-101',
    orderNumber: 'ORD-9482',
    customerName: 'Rahul Verma',
    customerPhone: '+91 98765 43210',
    totalAmount: 2499,
    currency: 'INR',
    status: 'delivered',
    itemsCount: 3,
    channel: 'WhatsApp',
    createdAt: '2026-10-27T10:15:00Z',
  },
  {
    id: 'ord-102',
    orderNumber: 'ORD-9483',
    customerName: 'Ananya Sharma',
    customerPhone: '+91 98123 45678',
    totalAmount: 1250,
    currency: 'INR',
    status: 'processing',
    itemsCount: 1,
    channel: 'WhatsApp AI Agent',
    createdAt: '2026-10-27T11:45:00Z',
  },
  {
    id: 'ord-103',
    orderNumber: 'ORD-9484',
    customerName: 'Karthik Menon',
    customerPhone: '+91 94455 66778',
    totalAmount: 4800,
    currency: 'INR',
    status: 'shipped',
    itemsCount: 4,
    channel: 'WhatsApp',
    createdAt: '2026-10-27T13:20:00Z',
  },
  {
    id: 'ord-104',
    orderNumber: 'ORD-9485',
    customerName: 'Pooja Nair',
    customerPhone: '+91 99887 76655',
    totalAmount: 899,
    currency: 'INR',
    status: 'pending',
    itemsCount: 2,
    channel: 'Customer Chat',
    createdAt: '2026-10-27T14:05:00Z',
  },
];

export function Orders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredOrders = SAMPLE_ORDERS.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerPhone.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: OrderItem['status']) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 className="size-3" /> Delivered
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <Clock className="size-3" /> Processing
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20">
            <Truck className="size-3" /> Shipped
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Clock className="size-3" /> Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            <AlertCircle className="size-3" /> Cancelled
          </span>
        );
    }
  };

  return (
    <Container className="py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ShoppingBag className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-on-surface">Orders & Commerce</h1>
              <p className="text-xs text-on-surface-variant">
                Manage and track customer orders placed through WhatsApp and AI chat flows.
              </p>
            </div>
          </div>
        </div>

        <Button variant="primary" size="sm" className="glow-primary self-start sm:self-auto cursor-pointer">
          <Plus className="size-4 mr-1.5" />
          Create Order
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">Total Orders</span>
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Package className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">1,248</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-medium">
            <ArrowUpRight className="size-3" />
            <span>+14.2% from last month</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">Total Revenue</span>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <DollarSign className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">₹4,82,900</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 font-medium">
            <ArrowUpRight className="size-3" />
            <span>+8.6% growth</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">Pending Fulfillment</span>
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">18</p>
          <span className="text-xs text-on-surface-variant mt-1 block">Awaiting shipping</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">AI Automated Orders</span>
            <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">64%</p>
          <span className="text-xs text-on-surface-variant mt-1 block">Closed without agent handover</span>
        </Card>
      </div>

      {/* Main Orders Table Card */}
      <Card className="p-6">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by order ID, customer name, or phone..."
              className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant/40 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-on-surface-variant" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface border border-outline-variant/40 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider font-semibold">
                <th className="pb-3 px-3">Order</th>
                <th className="pb-3 px-3">Customer</th>
                <th className="pb-3 px-3">Channel</th>
                <th className="pb-3 px-3">Items</th>
                <th className="pb-3 px-3">Total</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high/60">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                    No orders matching your search filters.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-on-surface">{order.orderNumber}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-on-surface">{order.customerName}</div>
                      <div className="text-[11px] text-on-surface-variant">{order.customerPhone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium border border-outline-variant/20">
                        {order.channel}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-on-surface-variant">{order.itemsCount} items</td>
                    <td className="py-3 px-3 font-bold text-on-surface">
                      ₹{order.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3">{getStatusBadge(order.status)}</td>
                    <td className="py-3 px-3 text-on-surface-variant">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Container>
  );
}
