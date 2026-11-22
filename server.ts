import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocket, WebSocketServer} from 'ws';
import type {
  Customer,
  Medicine,
  PharmacySettings,
  PharmacySnapshot,
  Sale,
  SyncMutation,
} from './src/types/pharmacy.ts';
import {
  checkDatabaseHealth,
  createSaleTransaction,
  deleteCustomer,
  deleteMedicine,
  getFullSnapshot,
  initDatabase,
  payCustomerDue,
  restoreFullSnapshot,
  updateSettings,
  upsertCustomer,
  upsertMedicine,
} from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

initDatabase();

const app = express();
app.use(express.json({limit: '10mb'}));

const server = http.createServer(app);
const wss = new WebSocketServer({server, path: '/ws'});

function broadcastEvent(type: string, payload: unknown): void {
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'connected',
      payload: {clients: wss.clients.size},
      timestamp: new Date().toISOString(),
    }),
  );

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as {type?: string};
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({type: 'pong', timestamp: new Date().toISOString()}));
      }
    } catch {
      // Ignore malformed ping frames
    }
  });
});

// Kubernetes & container health probes
app.get('/api/health', (_req, res) => {
  res.status(200).json({status: 'ok', service: 'saramoni-medicine-corner', uptime: process.uptime()});
});

app.get('/api/ready', (_req, res) => {
  const dbOk = checkDatabaseHealth();
  if (!dbOk) {
    res.status(503).json({status: 'unavailable'});
    return;
  }
  res.status(200).json({status: 'ready'});
});

// Full snapshot bootstrap
app.get('/api/bootstrap', (_req, res) => {
  try {
    const snapshot = getFullSnapshot();
    res.json({
      ...snapshot,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({error: 'Failed to load pharmacy database'});
  }
});

// Medicines CRUD
app.post('/api/medicines', (req, res) => {
  try {
    const body = req.body as Partial<Medicine>;
    if (
      !body ||
      typeof body.id !== 'string' ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      typeof body.batchNumber !== 'string' ||
      !body.batchNumber.trim() ||
      typeof body.expiryDate !== 'string' ||
      typeof body.purchasePrice !== 'number' ||
      typeof body.sellingPrice !== 'number' ||
      typeof body.stockQty !== 'number' ||
      body.purchasePrice < 0 ||
      body.sellingPrice < 0 ||
      body.stockQty < 0
    ) {
      res.status(400).json({error: 'Invalid medicine payload'});
      return;
    }

    const saved = upsertMedicine({
      id: body.id,
      name: body.name.trim(),
      genericName: String(body.genericName || '').trim(),
      category: String(body.category || '').trim(),
      manufacturer: String(body.manufacturer || '').trim(),
      batchNumber: body.batchNumber.trim(),
      expiryDate: body.expiryDate.trim(),
      purchasePrice: Number(body.purchasePrice),
      sellingPrice: Number(body.sellingPrice),
      piecesPerPack: Math.max(1, Math.floor(Number(body.piecesPerPack ?? 1))),
      stockQty: Math.floor(Number(body.stockQty)),
      minStockAlert: Math.max(0, Math.floor(Number(body.minStockAlert ?? 15))),
      unit: String(body.unit || 'পিস').trim(),
      updatedAt: new Date().toISOString(),
    });

    broadcastEvent('medicine:upsert', saved);
    res.json(saved);
  } catch (error) {
    console.error('Upsert medicine error:', error);
    res.status(500).json({error: 'Failed to save medicine'});
  }
});

app.delete('/api/medicines/:id', (req, res) => {
  try {
    const id = req.params.id;
    const deleted = deleteMedicine(id);
    if (deleted) {
      broadcastEvent('medicine:delete', {id});
    }
    res.json({ok: true, deleted});
  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({error: 'Failed to delete medicine'});
  }
});

// Customers CRUD & due payment
app.post('/api/customers', (req, res) => {
  try {
    const body = req.body as Partial<Customer>;
    if (!body || typeof body.id !== 'string' || typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({error: 'Invalid customer payload'});
      return;
    }

    const saved = upsertCustomer({
      id: body.id,
      name: body.name.trim(),
      phone: String(body.phone || '').trim(),
      address: String(body.address || '').trim(),
      dueBalance: Math.max(0, Number(body.dueBalance ?? 0)),
      totalSpent: Math.max(0, Number(body.totalSpent ?? 0)),
      visitCount: Math.max(0, Math.floor(Number(body.visitCount ?? 0))),
      notes: String(body.notes || ''),
      encryptedNotes: String(body.encryptedNotes || ''),
      lastVisit: String(body.lastVisit || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    });

    broadcastEvent('customer:upsert', saved);
    res.json(saved);
  } catch (error) {
    console.error('Upsert customer error:', error);
    res.status(500).json({error: 'Failed to save customer'});
  }
});

app.post('/api/customers/:id/pay-due', (req, res) => {
  try {
    const amount = Number((req.body as {amount?: number})?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({error: 'Invalid payment amount'});
      return;
    }
    const updated = payCustomerDue(req.params.id, amount);
    if (!updated) {
      res.status(404).json({error: 'Customer not found'});
      return;
    }
    broadcastEvent('customer:upsert', updated);
    res.json(updated);
  } catch (error) {
    console.error('Pay due error:', error);
    res.status(500).json({error: 'Failed to update due balance'});
  }
});

app.delete('/api/customers/:id', (req, res) => {
  try {
    const id = req.params.id;
    const deleted = deleteCustomer(id);
    if (deleted) {
      broadcastEvent('customer:delete', {id});
    }
    res.json({ok: true, deleted});
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({error: 'Failed to delete customer'});
  }
});

// Sales & Automated Invoice Creation
app.post('/api/sales', (req, res) => {
  try {
    const body = req.body as Partial<Sale>;
    if (
      !body ||
      typeof body.id !== 'string' ||
      typeof body.invoiceNumber !== 'string' ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      res.status(400).json({error: 'Invalid sale payload'});
      return;
    }

    const result = createSaleTransaction(body as Sale);
    broadcastEvent('sale:created', result);
    res.json(result);
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({error: 'Failed to record sale'});
  }
});

// Settings
app.post('/api/settings', (req, res) => {
  try {
    const body = req.body as Partial<PharmacySettings>;
    if (!body || typeof body.pharmacyName !== 'string') {
      res.status(400).json({error: 'Invalid settings payload'});
      return;
    }
    const saved = updateSettings(body as PharmacySettings);
    broadcastEvent('settings:updated', saved);
    res.json(saved);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({error: 'Failed to update settings'});
  }
});

// Offline Batch Sync Replay
app.post('/api/sync/batch', (req, res) => {
  try {
    const mutations = (req.body as {mutations?: SyncMutation[]})?.mutations;
    if (!Array.isArray(mutations)) {
      res.status(400).json({error: 'mutations array is required'});
      return;
    }

    const results: Array<{opId: string; ok: boolean; error?: string}> = [];

    for (const mut of mutations) {
      try {
        if (mut.entity === 'medicine' && mut.action === 'upsert') {
          const saved = upsertMedicine(mut.payload as unknown as Medicine);
          broadcastEvent('medicine:upsert', saved);
        } else if (mut.entity === 'medicine' && mut.action === 'delete') {
          const id = String(mut.payload.id || '');
          if (deleteMedicine(id)) {
            broadcastEvent('medicine:delete', {id});
          }
        } else if (mut.entity === 'customer' && mut.action === 'upsert') {
          const saved = upsertCustomer(mut.payload as unknown as Customer);
          broadcastEvent('customer:upsert', saved);
        } else if (mut.entity === 'customer' && mut.action === 'pay_due') {
          const updated = payCustomerDue(
            String(mut.payload.id || ''),
            Number(mut.payload.amount || 0),
          );
          if (updated) {
            broadcastEvent('customer:upsert', updated);
          }
        } else if (mut.entity === 'customer' && mut.action === 'delete') {
          const id = String(mut.payload.id || '');
          if (deleteCustomer(id)) {
            broadcastEvent('customer:delete', {id});
          }
        } else if (mut.entity === 'sale' && mut.action === 'create_sale') {
          const saleRes = createSaleTransaction(mut.payload as unknown as Sale);
          broadcastEvent('sale:created', saleRes);
        } else if (mut.entity === 'settings' && mut.action === 'upsert') {
          const saved = updateSettings(mut.payload as unknown as PharmacySettings);
          broadcastEvent('settings:updated', saved);
        }
        results.push({opId: mut.opId, ok: true});
      } catch (err) {
        results.push({
          opId: mut.opId,
          ok: false,
          error: err instanceof Error ? err.message : 'Mutation failed',
        });
      }
    }

    const snapshot = getFullSnapshot();
    res.json({results, snapshot});
  } catch (error) {
    console.error('Sync batch error:', error);
    res.status(500).json({error: 'Failed to process sync batch'});
  }
});

// Backup Restore
app.post('/api/backup/restore', (req, res) => {
  try {
    const body = req.body as Partial<PharmacySnapshot>;
    if (
      !body ||
      !Array.isArray(body.medicines) ||
      !Array.isArray(body.customers) ||
      !Array.isArray(body.sales)
    ) {
      res.status(400).json({error: 'Invalid backup snapshot structure'});
      return;
    }

    const restored = restoreFullSnapshot(body as PharmacySnapshot);
    broadcastEvent('state:reset', restored);
    res.json(restored);
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({error: 'Failed to restore backup'});
  }
});

async function startServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Sara Moni Medicine Corner (SaramoniPOS) server running on http://0.0.0.0:${port}`);
  });
}

startServer();
