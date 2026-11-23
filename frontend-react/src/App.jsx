import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  GitBranch,
  Inbox,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  XCircle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const defaultItem = {
  sku: 'SKU-001',
  productCategory: 'Electronics',
  itemPrice: 4500
};

const scenarios = [
  {
    id: 1,
    title: 'Electronics inspection',
    description: '5% fee · Silver tier',
    tone: 'blue',
    form: { productCategory: 'Electronics', itemPrice: 4500, daysSinceDelivery: 5, customerTier: 'Silver', returnItems: [{ sku: 'SKU-ELEC-4500', productCategory: 'Electronics', itemPrice: 4500 }] }
  },
  {
    id: 2,
    title: 'Laptop + apparel order',
    description: 'Multi-item loop · 2 line items',
    tone: 'violet',
    form: { productCategory: 'Electronics', itemPrice: 87500, daysSinceDelivery: 7, customerTier: 'Silver', returnItems: [{ sku: 'SKU-LAPTOP-01', productCategory: 'Electronics', itemPrice: 85000 }, { sku: 'SKU-APPAREL-01', productCategory: 'Apparel', itemPrice: 2500 }] }
  },
  {
    id: 3,
    title: 'Gold instant refund',
    description: '₹450 · 3 days · Gold',
    tone: 'amber',
    form: { productCategory: 'Accessories', itemPrice: 450, daysSinceDelivery: 3, customerTier: 'Gold', returnItems: [{ sku: 'SKU-ACCESS-450', productCategory: 'Accessories', itemPrice: 450 }] }
  },
  {
    id: 4,
    title: 'Expired return window',
    description: 'Auto-reject · 20 days',
    tone: 'slate',
    form: { productCategory: 'Home', itemPrice: 3000, daysSinceDelivery: 20, customerTier: 'Regular', returnItems: [{ sku: 'SKU-HOME-3000', productCategory: 'Home', itemPrice: 3000 }] }
  },
  {
    id: 5,
    title: 'Gateway limit boundary',
    description: '₹6,00,000 · payment error',
    tone: 'rose',
    form: { productCategory: 'Electronics', itemPrice: 600000, daysSinceDelivery: 4, customerTier: 'Regular', returnItems: [{ sku: 'SKU-GATEWAY-01', productCategory: 'Electronics', itemPrice: 600000 }] }
  }
];

const workflowNodes = [
  { id: 'Start_ReturnRequest', label: ['Start', 'Return Request'], kind: 'start', x: 28, y: 118 },
  { id: 'Task_FetchOrder', label: ['Fetch & Verify', 'Line Items (MI)'], kind: 'task', x: 98, y: 78, w: 150, h: 80 },
  { id: 'Task_EvaluateDMN', label: ['Evaluate Return', 'Refund Policy (DMN)'], kind: 'task', x: 278, y: 78, w: 170, h: 80 },
  { id: 'Gateway_Routing', label: ['Refund Routing', 'Action?'], kind: 'gateway', x: 500, y: 118 },
  { id: 'SubProcess_Inspection', label: ['Warehouse Quality', 'Inspection Sub-Process'], kind: 'subprocess', x: 570, y: 118, w: 215, h: 160 },
  { id: 'Boundary_TimerSLA', label: ['SLA Timer', 'PT24H'], kind: 'boundary', x: 760, y: 38 },
  { id: 'Task_WarehouseInspect', label: ['Warehouse Item', 'Quality Inspection'], kind: 'task', x: 588, y: 94, w: 178, h: 66 },
  { id: 'Gateway_InspectionCheck', label: ['Inspection', 'Passed?'], kind: 'gateway', x: 840, y: 118 },
  { id: 'Task_DisburseRefund', label: ['Disburse Refund', 'via Payment Gateway'], kind: 'task', x: 900, y: 78, w: 170, h: 80 },
  { id: 'Boundary_PaymentError', label: ['Gateway Error', 'ERR_PAYMENT'], kind: 'boundary', x: 1052, y: 38 },
  { id: 'Task_UpdateERP', label: ['Update Order &', 'Inventory Records'], kind: 'task', x: 1100, y: 78, w: 160, h: 80 },
  { id: 'Call_NotifyCustomer', label: ['Dispatch Customer', 'Notification (Child)'], kind: 'task', x: 1290, y: 78, w: 172, h: 80 },
  { id: 'End_RefundCompleted', label: ['Refund Processed', '& Order Closed'], kind: 'end', x: 1512, y: 118 },
  { id: 'End_ReturnRejected', label: ['Return Rejected', '& Closed'], kind: 'endRejected', x: 1090, y: 246 }
];

const workflowEdges = [
  [46, 118, 98, 118],
  [248, 118, 278, 118],
  [448, 118, 480, 118],
  [520, 118, 570, 118],
  [785, 118, 820, 118],
  [860, 118, 900, 118],
  [1070, 118, 1100, 118],
  [1260, 118, 1290, 118],
  [1462, 118, 1492, 118],
  [520, 132, 620, 246],
  [860, 132, 1090, 246],
  [1075, 155, 1090, 246]
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function statusFor(id, completed, active) {
  if (completed.has(id)) return 'completed';
  if (active.has(id)) return 'active';
  return 'idle';
}

function toneClasses(tone) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-300',
    violet: 'border-violet-100 bg-violet-50 text-violet-700 hover:border-violet-300',
    amber: 'border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-300',
    slate: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
    rose: 'border-rose-100 bg-rose-50 text-rose-700 hover:border-rose-300'
  };
  return tones[tone] || tones.blue;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof body === 'string' ? body : body?.detail?.error || body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function App() {
  const [form, setForm] = useState({
    productCategory: defaultItem.productCategory,
    itemPrice: defaultItem.itemPrice,
    daysSinceDelivery: 5,
    customerTier: 'Silver',
    returnItems: [defaultItem]
  });
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [status, setStatus] = useState(null);
  const [selectedPik, setSelectedPik] = useState('');
  const [tasks, setTasks] = useState([]);
  const [records, setRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('operations');
  const [submitting, setSubmitting] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadHealth = useCallback(async () => {
    try {
      const result = await apiFetch('/health');
      setHealth(result);
      setHealthError('');
    } catch (error) {
      setHealth(null);
      setHealthError(error.message);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const result = await apiFetch('/tasks');
      setTasks(asArray(result?.tasks));
    } catch (error) {
      setNotice({ type: 'error', text: `Could not load tasklist: ${error.message}` });
    }
  }, []);

  const loadRecords = useCallback(async () => {
    try {
      const result = await apiFetch('/db/records');
      setRecords(asArray(result));
    } catch (error) {
      setNotice({ type: 'error', text: `Could not load H2 records: ${error.message}` });
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!selectedPik) return;
    try {
      const result = await apiFetch(`/returns/status/${encodeURIComponent(selectedPik)}`);
      setStatus(result);
      setLastUpdated(new Date());
    } catch (error) {
      setNotice({ type: 'error', text: `Could not load workflow status: ${error.message}` });
    }
  }, [selectedPik]);

  useEffect(() => {
    loadHealth();
    const interval = window.setInterval(loadHealth, 10000);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

  useEffect(() => {
    loadTasks();
    const interval = window.setInterval(loadTasks, 5000);
    return () => window.clearInterval(interval);
  }, [loadTasks]);

  useEffect(() => {
    loadRecords();
    const interval = window.setInterval(loadRecords, 8000);
    return () => window.clearInterval(interval);
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedPik) return undefined;
    loadStatus();
    const interval = window.setInterval(loadStatus, 3000);
    return () => window.clearInterval(interval);
  }, [loadStatus, selectedPik]);

  const completedNodes = useMemo(() => new Set(asArray(status?.completedNodes)), [status]);
  const activeNodes = useMemo(() => new Set(asArray(status?.activeNodes)), [status]);
  const totalPrice = useMemo(() => form.returnItems.reduce((total, item) => total + Number(item.itemPrice || 0), 0), [form.returnItems]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    setForm((current) => {
      const returnItems = current.returnItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === 'itemPrice' ? Number(value) : value } : item);
      const next = { ...current, returnItems };
      if (index === 0 && field === 'productCategory') next.productCategory = value;
      next.itemPrice = returnItems.reduce((total, item) => total + Number(item.itemPrice || 0), 0);
      return next;
    });
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      returnItems: [...current.returnItems, { sku: `SKU-${String(current.returnItems.length + 1).padStart(3, '0')}`, productCategory: 'Apparel', itemPrice: 0 }]
    }));
  }

  function removeItem(index) {
    setForm((current) => {
      if (current.returnItems.length === 1) return current;
      const returnItems = current.returnItems.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        productCategory: returnItems[0].productCategory,
        itemPrice: returnItems.reduce((total, item) => total + Number(item.itemPrice || 0), 0),
        returnItems
      };
    });
  }

  function applyScenario(scenario) {
    setForm({ ...scenario.form, returnItems: scenario.form.returnItems.map((item) => ({ ...item })) });
    setNotice({ type: 'info', text: `Loaded scenario ${scenario.id}: ${scenario.title}` });
  }

  async function submitReturn(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await apiFetch('/returns/submit', {
        method: 'POST',
        body: JSON.stringify({
          productCategory: form.productCategory,
          itemPrice: Number(form.itemPrice),
          daysSinceDelivery: Number(form.daysSinceDelivery),
          customerTier: form.customerTier,
          returnItems: form.returnItems.map((item) => ({ ...item, itemPrice: Number(item.itemPrice) }))
        })
      });
      setSelectedPik(String(result.processInstanceKey));
      setNotice({ type: 'success', text: `Return submitted. Process instance ${result.processInstanceKey} is now being monitored.` });
      setActiveTab('operations');
      loadRecords();
    } catch (error) {
      setNotice({ type: 'error', text: `Return submission failed: ${error.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  async function assignTask(task) {
    setActionKey(`assign-${task.userTaskKey}`);
    try {
      await apiFetch('/tasks/assign', { method: 'POST', body: JSON.stringify({ userTaskKey: task.userTaskKey, assignee: 'demo' }) });
      setNotice({ type: 'success', text: `Task ${task.userTaskKey} assigned to demo.` });
      loadTasks();
    } catch (error) {
      setNotice({ type: 'error', text: `Task assignment failed: ${error.message}` });
    } finally {
      setActionKey('');
    }
  }

  async function completeTask(task, inspectionPassed) {
    setActionKey(`complete-${task.userTaskKey}`);
    try {
      await apiFetch('/tasks/complete', { method: 'POST', body: JSON.stringify({ userTaskKey: task.userTaskKey, variables: { inspectionPassed } }) });
      setNotice({ type: 'success', text: `Task completed with inspectionPassed = ${inspectionPassed}.` });
      loadTasks();
      if (selectedPik === String(task.processInstanceKey)) loadStatus();
    } catch (error) {
      setNotice({ type: 'error', text: `Task completion failed: ${error.message}` });
    } finally {
      setActionKey('');
    }
  }

  const statusLabel = status?.stepper?.completed ? 'Completed' : status?.stepper?.rejected ? 'Rejected' : status?.instanceState || 'Awaiting process';
  const healthConnected = health?.status === 'connected';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200"><Package size={22} /></div>
            <div>
              <p className="eyebrow">OrderCare Operations</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Return & Refund Control Center</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className={`flex items-center gap-2 rounded-full border px-3 py-2 ${healthConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              <span className={`h-2 w-2 rounded-full ${healthConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-semibold">Zeebe {healthConnected ? 'Connected' : 'Disconnected'}</span>
              {health?.version && <span className="hidden text-xs opacity-70 sm:inline">v{health.version}</span>}
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">API · {API_BASE}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-6 lg:px-8">
        {healthError && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertCircle size={17} /> {healthError}</div>}
        {notice && <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}><span>{notice.type === 'error' ? <AlertCircle size={17} /> : notice.type === 'success' ? <CheckCircle2 size={17} /> : <Sparkles size={17} />}</span>{notice.text}</div>}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="eyebrow">Part 3 · Live process starter</p><h2 className="mt-1 text-lg font-bold">Submit a return request</h2><p className="mt-1 text-sm text-slate-500">Every submission starts a real Camunda process instance through the Spring Boot API.</p></div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"><CircleDollarSign size={15} className="text-blue-600" /> Total {formatCurrency(totalPrice)}</div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {scenarios.map((scenario) => <button key={scenario.id} type="button" onClick={() => applyScenario(scenario)} className={`group rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${toneClasses(scenario.tone)}`}><div className="flex items-start justify-between gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/80 text-xs font-bold">{scenario.id}</span><ChevronRight size={16} className="opacity-50 transition group-hover:translate-x-0.5" /></div><p className="mt-2 text-sm font-bold">{scenario.title}</p><p className="mt-0.5 text-xs opacity-75">{scenario.description}</p></button>)}
              </div>
            </div>
            <form onSubmit={submitReturn} className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label><span className="field-label">Primary category</span><select className="field-control" value={form.productCategory} onChange={(event) => updateForm('productCategory', event.target.value)}><option>Electronics</option><option>Apparel</option><option>Footwear</option><option>Accessories</option><option>Home</option><option>Books</option><option>Digital</option><option>PersonalCare</option></select></label>
                <label><span className="field-label">Days since delivery</span><input className="field-control" type="number" min="0" value={form.daysSinceDelivery} onChange={(event) => updateForm('daysSinceDelivery', event.target.value)} /></label>
                <label><span className="field-label">Customer tier</span><select className="field-control" value={form.customerTier} onChange={(event) => updateForm('customerTier', event.target.value)}><option>Regular</option><option>Silver</option><option>Gold</option><option>Platinum</option></select></label>
                <label><span className="field-label">Payload total (₹)</span><input className="field-control bg-slate-50" type="number" min="0" value={form.itemPrice} readOnly /></label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-800">Return line items</p><p className="mt-0.5 text-xs text-slate-500">Sent as <code className="rounded bg-white px-1 py-0.5 text-blue-700">returnItems[]</code> for the parallel multi-instance fetch loop.</p></div><button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"><Plus size={15} /> Add line item</button></div>
                <div className="mt-4 space-y-3">{form.returnItems.map((item, index) => <div key={`${item.sku}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"><label><span className="field-label">SKU</span><input className="field-control" value={item.sku} onChange={(event) => updateItem(index, 'sku', event.target.value)} /></label><label><span className="field-label">Product category</span><select className="field-control" value={item.productCategory} onChange={(event) => updateItem(index, 'productCategory', event.target.value)}><option>Electronics</option><option>Apparel</option><option>Footwear</option><option>Accessories</option><option>Home</option><option>Books</option><option>Digital</option><option>PersonalCare</option></select></label><label><span className="field-label">Item price (₹)</span><input className="field-control" type="number" min="0" value={item.itemPrice} onChange={(event) => updateItem(index, 'itemPrice', event.target.value)} /></label><button type="button" onClick={() => removeItem(index)} disabled={form.returnItems.length === 1} className="flex h-[42px] items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" aria-label="Remove line item"><Trash2 size={17} /></button></div>)}</div>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Backend will derive the item count and total from this array.</p><button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60">{submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />} {submitting ? 'Starting process…' : 'Submit live return'}</button></div>
            </form>
          </div>

          <div className="card flex flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between"><div><p className="eyebrow">Selected process</p><h2 className="mt-1 text-lg font-bold">Live instance monitor</h2></div><Activity size={21} className="text-blue-600" /></div>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Process instance key</p><div className="mt-2 flex min-h-8 items-center justify-between gap-3"><span className="break-all font-mono text-sm font-semibold text-slate-700">{selectedPik || 'Submit a return to begin monitoring'}</span>{selectedPik && <button type="button" onClick={loadStatus} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-blue-600" title="Refresh status"><RefreshCw size={15} /></button>}</div></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">Workflow state</p><p className="mt-1 text-lg font-bold text-emerald-900">{statusLabel}</p></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-700">Policy decision</p><p className="mt-1 truncate text-lg font-bold text-blue-900">{status?.stepper?.policyDecision || '—'}</p></div></div>
            <div className="mt-5 space-y-3">{[['orderVerified', 'Order verified'], ['dmnEvaluated', 'DMN evaluated'], ['warehouseInspectionPending', 'Warehouse inspection'], ['refundDisbursed', 'Refund disbursed'], ['erpUpdated', 'ERP updated'], ['callActivityDone', 'Customer notified']].map(([key, label]) => <div key={key} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"><span className="text-slate-600">{label}</span>{status?.stepper?.[key] ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Minus size={18} className="text-slate-300" />}</div>)}</div>
            <div className="mt-auto border-t border-slate-100 pt-5 text-xs text-slate-400">{lastUpdated ? `Last status poll ${lastUpdated.toLocaleTimeString()}` : 'Status polls every 3 seconds after submission'}</div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="eyebrow">Camunda 8 · live element state</p><h2 className="mt-1 text-lg font-bold">Process_EcommerceReturn_PBL2</h2></div><div className="flex items-center gap-4 text-xs font-semibold"><span className="flex items-center gap-1.5 text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completed</span><span className="flex items-center gap-1.5 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Active</span><span className="flex items-center gap-1.5 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> Pending</span></div></div>
          <div className="overflow-x-auto bg-slate-50/50 p-4"><svg viewBox="0 0 1560 330" className="min-w-[1100px]" role="img" aria-label="Live Camunda workflow diagram"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#cbd5e1" /></marker></defs>{workflowEdges.map(([x1, y1, x2, y2], index) => <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="2" markerEnd="url(#arrow)" />)}{workflowNodes.map((node) => <WorkflowNode key={node.id} node={node} status={statusFor(node.id, completedNodes, activeNodes)} />)}</svg></div>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><GitBranch size={15} className="text-blue-600" /><span>{selectedPik ? `${completedNodes.size} completed elements · ${activeNodes.size} active elements` : 'Submit a request to see real element state from Operate search APIs.'}</span></div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200"><TabButton active={activeTab === 'operations'} onClick={() => setActiveTab('operations')} icon={<Inbox size={16} />}>Tasklist Inbox <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{tasks.length}</span></TabButton><TabButton active={activeTab === 'records'} onClick={() => setActiveTab('records')} icon={<Database size={16} />}>H2 Database Records <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{records.length}</span></TabButton></div>
          {activeTab === 'operations' ? <TaskInbox tasks={tasks} actionKey={actionKey} onAssign={assignTask} onComplete={completeTask} onSelect={(pik) => setSelectedPik(String(pik))} selectedPik={selectedPik} /> : <RecordsViewer records={records} onRefresh={loadRecords} />}
        </section>
      </main>
      <footer className="mx-auto max-w-[1600px] px-5 pb-8 text-xs text-slate-400 lg:px-8">OrderCare Return Automation · live backend integration · no mock workflow data</footer>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{icon}{children}</button>;
}

function WorkflowNode({ node, status }) {
  const colors = {
    completed: { fill: '#dcfce7', stroke: '#10b981', text: '#047857' },
    active: { fill: '#fef3c7', stroke: '#f59e0b', text: '#b45309' },
    idle: { fill: node.kind === 'subprocess' ? '#f8fafc' : '#ffffff', stroke: '#cbd5e1', text: '#475569' }
  }[status];
  const w = node.w || 38;
  const h = node.h || 38;
  const isRound = node.kind === 'start' || node.kind === 'end' || node.kind === 'endRejected' || node.kind === 'boundary';
  const isDiamond = node.kind === 'gateway';
  const x = isRound || isDiamond ? node.x : node.x;
  const y = isRound || isDiamond ? node.y : node.y;
  return <g className="transition"><title>{node.id} · {status}</title>{isDiamond ? <polygon points={`${x},${y - 22} ${x + 26},${y} ${x},${y + 22} ${x - 26},${y}`} fill={colors.fill} stroke={colors.stroke} strokeWidth="2" /> : isRound ? <circle cx={x} cy={y} r={node.kind === 'boundary' ? 22 : 19} fill={colors.fill} stroke={colors.stroke} strokeWidth="2" /> : <rect x={x} y={y - h / 2} width={w} height={h} rx="9" fill={colors.fill} stroke={colors.stroke} strokeWidth="2" />}{status !== 'idle' && <circle cx={isRound || isDiamond ? x + (isDiamond ? 18 : 14) : x + w - 12} cy={isRound || isDiamond ? y - 17 : y - h / 2 + 12} r="7" fill={colors.stroke} />}{status !== 'idle' && <path d={isRound || isDiamond ? `M${x + (isDiamond ? 14 : 10)} ${y - 17} l3 3 l5 -6` : `M${x + w - 16} ${y - h / 2 + 12} l3 3 l5 -6`} stroke="white" strokeWidth="1.6" fill="none" />}{isRound || isDiamond ? <text x={x} y={y + 36} textAnchor="middle" fontSize="10" fontWeight="700" fill={colors.text}>{node.label.map((line, index) => <tspan key={line} x={x} dy={index === 0 ? 0 : 12}>{line}</tspan>)}</text> : <text x={x + w / 2} y={y - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill={colors.text}>{node.label.map((line, index) => <tspan key={line} x={x + w / 2} dy={index === 0 ? 0 : 13}>{line}</tspan>)}</text>}<text x={isRound || isDiamond ? x : x + w / 2} y={isRound || isDiamond ? y + 64 : y + h / 2 + 16} textAnchor="middle" fontSize="8" fill="#94a3b8">{node.id}</text></g>;
}

function TaskInbox({ tasks, actionKey, onAssign, onComplete, onSelect, selectedPik }) {
  return <div className="card p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Custom Tasklist</p><h2 className="mt-1 text-lg font-bold">Warehouse inspection inbox</h2></div><span className="text-xs text-slate-400">GET /api/tasks · refreshed every 5s</span></div>{tasks.length === 0 ? <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center"><ClipboardCheck size={28} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No open user tasks</p><p className="mt-1 text-xs text-slate-400">Inspection tasks appear here when a return reaches the warehouse step.</p></div> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{tasks.map((task) => <div key={task.userTaskKey} className={`rounded-xl border p-4 transition ${selectedPik === String(task.processInstanceKey) ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{task.name}</p><p className="mt-1 font-mono text-[11px] text-slate-400">Task {task.userTaskKey}</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">{task.state}</span></div><button type="button" onClick={() => onSelect(task.processInstanceKey)} className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">View process {task.processInstanceKey} <ArrowRight size={13} /></button><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={Boolean(actionKey)} onClick={() => onAssign(task)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">{actionKey === `assign-${task.userTaskKey}` ? <LoaderCircle size={14} className="animate-spin" /> : <UserCheck size={14} />} Claim task</button><button type="button" disabled={Boolean(actionKey)} onClick={() => onComplete(task, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">{actionKey === `complete-${task.userTaskKey}` ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Pass inspection</button><button type="button" disabled={Boolean(actionKey)} onClick={() => onComplete(task, false)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"><XCircle size={14} /> Fail inspection</button></div></div>)}</div>}</div>;
}

function RecordsViewer({ records, onRefresh }) {
  return <div className="card overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="eyebrow">H2 persistence</p><h2 className="mt-1 text-lg font-bold">Return request records</h2></div><button type="button" onClick={onRefresh} className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"><RefreshCw size={14} /> Refresh records</button></div>{records.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center"><Database size={28} className="text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No persisted return records yet</p><p className="mt-1 text-xs text-slate-400">Submit a live request to populate the H2 database.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3 font-bold">Process</th><th className="px-5 py-3 font-bold">Category</th><th className="px-5 py-3 font-bold">Amount</th><th className="px-5 py-3 font-bold">Tier</th><th className="px-5 py-3 font-bold">Decision</th><th className="px-5 py-3 font-bold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={record.id || record.processInstanceKey} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-blue-700">{record.processInstanceKey}</td><td className="px-5 py-4 text-slate-600">{record.productCategory || '—'}<span className="ml-2 text-xs text-slate-400">{record.itemCount || 0} item(s)</span></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-800">{formatCurrency(record.itemPrice)}</td><td className="px-5 py-4 text-slate-600">{record.customerTier || '—'}</td><td className="px-5 py-4 text-slate-600">{record.policyDecision || 'Pending'}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{record.status || 'ACTIVE'}</span></td></tr>)}</tbody></table></div>}</div>;
}

export default App;
