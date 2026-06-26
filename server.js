const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Helper to read DB
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return { menu: [], orders: [], settings: { restoInfo: { nama: "Resto Nusantara", alamat: "Jl. Sejahtera", telepon: "123", ppn: 11 }, bankAccounts: [], vaNumber: "888001", qrisUrl: "" }, orderCounter: 0 };
        }
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        console.error('Error reading db:', err);
        return { menu: [], orders: [], settings: {}, orderCounter: 0 };
    }
}

// Helper to write DB
function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing db:', err);
    }
}

// Parse request body for POST/PUT
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', (err) => {
            reject(err);
        });
    });
}

// Helper to send JSON response
function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Server Creation
const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ── API ROUTES ──
    if (pathname.startsWith('/api/')) {
        const db = readDB();

        // GET /api/menu
        if (pathname === '/api/menu' && method === 'GET') {
            sendJSON(res, db.menu || []);
            return;
        }

        // POST /api/menu (tambah & edit)
        if (pathname === '/api/menu' && method === 'POST') {
            const body = await getRequestBody(req);
            if (!body.nama || !body.harga) {
                sendJSON(res, { error: 'Nama dan harga wajib diisi' }, 400);
                return;
            }

            if (body.id) {
                // Edit
                const index = db.menu.findIndex(m => m.id === body.id);
                if (index !== -1) {
                    db.menu[index] = { ...db.menu[index], ...body };
                    writeDB(db);
                    sendJSON(res, db.menu[index]);
                } else {
                    sendJSON(res, { error: 'Menu tidak ditemukan' }, 404);
                }
            } else {
                // Add new
                const newItem = {
                    id: 'menu-' + Date.now(),
                    nama: body.nama,
                    kategori: body.kategori || 'Makanan',
                    harga: parseInt(body.harga),
                    deskripsi: body.deskripsi || '',
                    gambar: body.gambar || '',
                    tersedia: true
                };
                db.menu.push(newItem);
                writeDB(db);
                sendJSON(res, newItem, 201);
            }
            return;
        }

        // POST /api/menu/toggle-status
        if (pathname === '/api/menu/toggle-status' && method === 'POST') {
            const body = await getRequestBody(req);
            const index = db.menu.findIndex(m => m.id === body.id);
            if (index !== -1) {
                db.menu[index].tersedia = !db.menu[index].tersedia;
                writeDB(db);
                sendJSON(res, db.menu[index]);
            } else {
                sendJSON(res, { error: 'Menu tidak ditemukan' }, 404);
            }
            return;
        }

        // DELETE /api/menu
        if (pathname.startsWith('/api/menu/') && method === 'DELETE') {
            const id = pathname.split('/').pop();
            const index = db.menu.findIndex(m => m.id === id);
            if (index !== -1) {
                db.menu.splice(index, 1);
                writeDB(db);
                sendJSON(res, { success: true });
            } else {
                sendJSON(res, { error: 'Menu tidak ditemukan' }, 404);
            }
            return;
        }

        // GET /api/orders
        if (pathname === '/api/orders' && method === 'GET') {
            sendJSON(res, db.orders || []);
            return;
        }

        // POST /api/orders
        if (pathname === '/api/orders' && method === 'POST') {
            const body = await getRequestBody(req);
            if (!body.items || body.items.length === 0) {
                sendJSON(res, { error: 'Keranjang kosong' }, 400);
                return;
            }

            db.orderCounter = (db.orderCounter || 0) + 1;
            const shortId = '#' + String(db.orderCounter).padStart(4, '0');

            const newOrder = {
                id: shortId,
                namaPelanggan: body.namaPelanggan || 'Tanpa Nama',
                meja: body.meja || '-',
                items: body.items,
                subtotal: parseInt(body.subtotal) || 0,
                ppn: parseInt(body.ppn) || 0,
                total: parseInt(body.total) || 0,
                catatan: body.catatan || '',
                pembayaran: body.pembayaran || 'tunai',
                pembayaranStatus: body.pembayaranStatus || 'Menunggu',
                status: 'Baru',
                waktu: new Date().toISOString(),
                vaNumber: body.pembayaran === 'va' ? (db.settings.vaNumber ? String(parseInt(db.settings.vaNumber) + db.orders.length) : '888001' + db.orders.length) : null,
                selesaiWaktu: null,
                waktuBayar: body.pembayaranStatus === 'Lunas' ? new Date().toISOString() : null
            };

            db.orders.unshift(newOrder);
            writeDB(db);
            sendJSON(res, newOrder, 201);
            return;
        }

        // POST /api/orders/update-status
        if (pathname === '/api/orders/update-status' && method === 'POST') {
            const body = await getRequestBody(req);
            const index = db.orders.findIndex(o => o.id === body.id);
            if (index !== -1) {
                db.orders[index].status = body.status;
                if (body.status === 'Selesai') {
                    db.orders[index].selesaiWaktu = new Date().toISOString();
                }
                writeDB(db);
                sendJSON(res, db.orders[index]);
            } else {
                sendJSON(res, { error: 'Pesanan tidak ditemukan' }, 404);
            }
            return;
        }

        // POST /api/orders/update-pembayaran
        if (pathname === '/api/orders/update-pembayaran' && method === 'POST') {
            const body = await getRequestBody(req);
            const index = db.orders.findIndex(o => o.id === body.id);
            if (index !== -1) {
                db.orders[index].pembayaranStatus = body.pembayaranStatus;
                if (body.pembayaranStatus === 'Lunas') {
                    db.orders[index].waktuBayar = new Date().toISOString();
                    db.orders[index].status = 'Selesai';
                }
                writeDB(db);
                sendJSON(res, db.orders[index]);
            } else {
                sendJSON(res, { error: 'Pesanan tidak ditemukan' }, 404);
            }
            return;
        }

        // GET /api/settings
        if (pathname === '/api/settings' && method === 'GET') {
            sendJSON(res, db.settings || {});
            return;
        }

        // POST /api/settings
        if (pathname === '/api/settings' && method === 'POST') {
            const body = await getRequestBody(req);
            db.settings = { ...db.settings, ...body };
            writeDB(db);
            sendJSON(res, db.settings);
            return;
        }

        sendJSON(res, { error: 'Endpoint tidak ditemukan' }, 404);
        return;
    }

    // ── STATIC FILE SERVING / SPA DELIVERY ──
    if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_TEMPLATE);
        return;
    }

    // Fallback: serve local workspace file if request matches (like custom logo, local image, etc.)
    const localFilePath = path.join(__dirname, pathname);
    fs.stat(localFilePath, (err, stats) => {
        if (!err && stats.isFile()) {
            const ext = path.extname(localFilePath).toLowerCase();
            let contentType = 'application/octet-stream';
            if (ext === '.png') contentType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            else if (ext === '.gif') contentType = 'image/gif';
            else if (ext === '.svg') contentType = 'image/svg+xml';
            else if (ext === '.css') contentType = 'text/css';
            else if (ext === '.js') contentType = 'application/javascript';
            
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(localFilePath).pipe(res);
        } else {
            // Serve SPA for page reloads / client routes
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(HTML_TEMPLATE);
        }
    });
});

// HTML Single-Page Application Template
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resto Nusantara</title>
    
    <!-- Premium Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        :root {
            --primary: #1A3A2A;
            --primary-hover: #0D1F17;
            --primary-light: #EAF2EE;
            --accent: #E6A15C;
            --text: #0D0D0D;
            --text-muted: #888888;
            --bg: #F7F7F7;
            --card-bg: #FFFFFF;
            --border: #E8E8E8;
            
            --success: #2E7D32;
            --success-light: #E8F5E9;
            --warning: #E65100;
            --warning-light: #FFF3E0;
            
            --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
            --shadow-md: 0 6px 20px rgba(0,0,0,0.06);
            --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Poppins', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }

        /* ── UTILITIES ── */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
            font-size: 0.875rem;
            letter-spacing: 0.03em;
            cursor: pointer;
            border: none;
            transition: var(--transition);
            text-decoration: none;
            gap: 8px;
        }
        .btn-primary {
            background-color: var(--primary);
            color: #ffffff;
        }
        .btn-primary:hover {
            background-color: var(--primary-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(26,58,42,0.25);
        }
        .btn-secondary {
            background-color: var(--card-bg);
            color: var(--text);
            border: 1px solid var(--border);
        }
        .btn-secondary:hover {
            background-color: var(--bg);
            border-color: var(--text-muted);
        }
        .btn-danger {
            background-color: #ffebee;
            color: #c62828;
        }
        .btn-danger:hover {
            background-color: #ffcdd2;
        }
        .btn:active {
            transform: translateY(0);
        }
        
        .divider {
            height: 1px;
            background-color: var(--border);
            border: none;
            margin: 1.2rem 0;
        }

        /* ── CUSTOMER APP SHELL (Mobile-First 480px width) ── */
        .customer-shell {
            max-width: 480px;
            margin: 0 auto;
            min-height: 100vh;
            background-color: var(--card-bg);
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.05);
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .customer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.2rem 1.4rem;
            background-color: var(--card-bg);
            border-bottom: 0.5px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .customer-header h1 {
            font-family: 'Cormorant Garamond', serif;
            font-weight: 600;
            font-size: 1.6rem;
            color: var(--primary);
            letter-spacing: 0.04em;
        }
        .customer-header .subtitle {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 1px;
            letter-spacing: 0.03em;
        }

        /* ── VIEW SWITCHING ── */
        .view-container {
            display: none;
            opacity: 0;
            padding: 1rem 1.4rem 6rem;
            animation: fadeIn 0.3s forwards cubic-bezier(0.4, 0, 0.2, 1);
        }
        .view-container.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ── BACK BUTTON ── */
        .circle-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 1px solid var(--border);
            background-color: var(--card-bg);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text);
            transition: var(--transition);
        }
        .circle-btn:hover {
            border-color: var(--primary);
            color: var(--primary);
            background-color: var(--primary-light);
        }

        /* ── HOME VIEW ── */
        .search-container {
            margin-bottom: 1rem;
        }
        .search-container input {
            width: 100%;
            padding: 0.85rem 1.2rem;
            border-radius: 10px;
            border: 1px solid var(--border);
            background-color: #F8F9FA;
            font-family: 'Poppins', sans-serif;
            font-size: 0.875rem;
            outline: none;
            transition: var(--transition);
        }
        .search-container input:focus {
            border-color: var(--primary);
            background-color: #ffffff;
            box-shadow: var(--shadow-sm);
        }

        .category-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 1.5rem;
            overflow-x: auto;
            scrollbar-width: none;
            padding-bottom: 4px;
        }
        .category-tabs::-webkit-scrollbar { display: none; }
        .category-tab {
            padding: 0.5rem 1.2rem;
            border-radius: 20px;
            border: 1px solid var(--border);
            background-color: var(--card-bg);
            color: var(--text-muted);
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: var(--transition);
        }
        .category-tab.active {
            background-color: var(--primary);
            border-color: var(--primary);
            color: #ffffff;
            box-shadow: 0 4px 10px rgba(26,58,42,0.15);
        }

        .section-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 1rem;
            letter-spacing: 0.02em;
        }

        .menu-list {
            display: flex;
            flex-direction: column;
        }
        .menu-item-row {
            display: flex;
            gap: 16px;
            padding: 1rem 0;
            border-bottom: 1px solid #F3F3F3;
            cursor: pointer;
        }
        .menu-item-row img {
            width: 80px;
            height: 80px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
        }
        .menu-item-content {
            flex: 1;
            min-width: 0;
        }
        .menu-item-title {
            font-size: 0.95rem;
            font-weight: 600;
            margin-bottom: 2px;
        }
        .menu-item-description {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .menu-item-bottom {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .menu-item-price {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--primary);
        }
        .menu-item-badge-habis {
            font-size: 0.7rem;
            color: #c62828;
            background-color: #ffebee;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 500;
        }
        .add-cart-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 1px solid var(--primary);
            background-color: var(--card-bg);
            color: var(--primary);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 1.2rem;
            font-weight: 500;
            transition: var(--transition);
        }
        .add-cart-btn:hover {
            background-color: var(--primary);
            color: #ffffff;
        }

        .customer-bottom-bar {
            position: fixed;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 480px;
            background-color: var(--card-bg);
            border-top: 1px solid var(--border);
            padding: 1rem 1.4rem;
            z-index: 100;
            display: flex;
            gap: 12px;
        }

        /* ── DETAIL VIEW ── */
        .detail-img {
            width: 100%;
            height: 250px;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 1.5rem;
        }
        .detail-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.8rem;
            font-weight: 600;
            color: var(--primary);
            margin-bottom: 4px;
        }
        .detail-price {
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 1rem;
        }
        .detail-desc {
            font-size: 0.875rem;
            color: #555555;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }
        .control-group {
            background-color: #F8F9FA;
            border-radius: 10px;
            padding: 1rem;
            margin-bottom: 1.5rem;
        }
        .qty-picker {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1rem;
        }
        .qty-selectors {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .qty-btn-large {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 1px solid var(--primary);
            background-color: #ffffff;
            color: var(--primary);
            font-size: 1.2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--transition);
        }
        .qty-btn-large:hover {
            background-color: var(--primary);
            color: #ffffff;
        }
        .qty-val-large {
            font-size: 1.1rem;
            font-weight: 600;
            min-width: 20px;
            text-align: center;
        }
        .note-input {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            outline: none;
        }
        .note-input:focus {
            border-color: var(--primary);
        }

        /* ── CART VIEW ── */
        .cart-list {
            margin-bottom: 1.5rem;
        }
        .cart-item-card {
            display: flex;
            gap: 12px;
            padding: 1rem 0;
            border-bottom: 1px solid #F3F3F3;
            align-items: center;
        }
        .cart-item-card img {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 6px;
        }
        .cart-item-info {
            flex: 1;
            min-width: 0;
        }
        .cart-item-title {
            font-size: 0.9rem;
            font-weight: 600;
        }
        .cart-item-note {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-style: italic;
            margin-top: 2px;
        }
        .cart-item-price {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--primary);
            margin-top: 4px;
        }
        .cart-qty-ctrl {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .cart-qty-btn {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 1px solid var(--primary);
            background-color: #ffffff;
            color: var(--primary);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 0.9rem;
        }
        .cart-qty-btn:hover {
            background-color: var(--primary);
            color: white;
        }
        .cart-qty-val {
            font-size: 0.85rem;
            font-weight: 500;
            min-width: 16px;
            text-align: center;
        }
        .summary-card {
            background-color: #ffffff;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.2rem;
            margin-bottom: 2rem;
            box-shadow: var(--shadow-sm);
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            color: #555555;
            margin-bottom: 8px;
        }
        .summary-row.total {
            border-top: 1px dashed var(--border);
            margin-top: 12px;
            padding-top: 12px;
            font-weight: 700;
            font-size: 1.05rem;
            color: var(--primary);
        }

        /* ── CHECKOUT VIEW ── */
        .card-form {
            background-color: #ffffff;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.2rem;
            margin-bottom: 1rem;
            box-shadow: var(--shadow-sm);
        }
        .form-label {
            display: block;
            font-size: 0.8rem;
            font-weight: 500;
            margin-bottom: 6px;
            color: #555;
        }
        .required-star {
            color: #d32f2f;
            margin-left: 2px;
        }
        .form-control {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-size: 0.875rem;
            background-color: #F8F9FA;
            outline: none;
            transition: var(--transition);
        }
        .form-control:focus {
            border-color: var(--primary);
            background-color: #ffffff;
        }
        .form-control.error {
            border-color: #d32f2f;
            background-color: #ffebee;
        }
        .input-error-msg {
            color: #d32f2f;
            font-size: 0.75rem;
            margin-top: 4px;
            display: none;
        }
        .input-error-msg.show {
            display: block;
        }
        .payment-options {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 1rem;
        }
        .payment-box {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 1rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            cursor: pointer;
            transition: var(--transition);
        }
        .payment-box.selected {
            border-color: var(--primary);
            background-color: var(--primary-light);
        }
        .payment-box input {
            display: none;
        }
        .payment-box-icon {
            width: 40px;
            height: 40px;
            border-radius: 6px;
            background-color: #ffffff;
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--primary);
        }
        .payment-box-title {
            font-size: 0.85rem;
            font-weight: 600;
        }
        .payment-box-desc {
            font-size: 0.72rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        /* QRIS Modal overlay */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.6);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 24px;
        }
        .modal-overlay.show {
            display: flex;
        }
        .modal-card {
            background-color: var(--card-bg);
            border-radius: 16px;
            padding: 2rem 1.5rem;
            width: 100%;
            max-width: 360px;
            text-align: center;
            box-shadow: var(--shadow-md);
            position: relative;
        }
        .modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--text-muted);
            cursor: pointer;
        }
        .qris-img {
            width: 220px;
            height: 220px;
            object-fit: contain;
            border: 1px solid var(--border);
            border-radius: 8px;
            margin: 1rem auto;
            display: block;
        }
        .qris-placeholder {
            width: 220px;
            height: 220px;
            background-color: #F8F9FA;
            border: 1px dashed var(--border);
            border-radius: 8px;
            margin: 1rem auto;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 0.8rem;
        }

        /* ── STATUS VIEW ── */
        .status-hero {
            text-align: center;
            padding: 1.5rem 0;
        }
        .status-badge-lg {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background-color: var(--primary);
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 1rem;
            box-shadow: 0 6px 16px rgba(26,58,42,0.2);
        }
        .status-timeline {
            display: flex;
            flex-direction: column;
            gap: 24px;
            margin: 1.5rem 0;
            position: relative;
            padding-left: 36px;
        }
        .status-timeline::before {
            content: '';
            position: absolute;
            left: 11px;
            top: 12px;
            bottom: 12px;
            width: 2px;
            background-color: var(--border);
            z-index: 1;
        }
        .timeline-step {
            position: relative;
        }
        .timeline-dot {
            position: absolute;
            left: -36px;
            top: 2px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: var(--border);
            border: 4px solid var(--card-bg);
            z-index: 2;
            transition: var(--transition);
        }
        .timeline-step.active .timeline-dot {
            background-color: var(--primary);
            box-shadow: 0 0 0 4px var(--primary-light);
        }
        .timeline-step.done .timeline-dot {
            background-color: var(--primary);
        }
        .timeline-step-title {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--text-muted);
        }
        .timeline-step.active .timeline-step-title {
            color: var(--primary);
        }
        .timeline-step.done .timeline-step-title {
            color: var(--text);
        }
        .timeline-step-desc {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        /* ── ADMIN APP SHELL (Desktop-First Dashboard) ── */
        .admin-shell {
            min-height: 100vh;
            display: flex;
            background-color: #F4F6F5;
        }

        .admin-sidebar {
            width: 260px;
            background-color: var(--primary);
            color: rgba(255,255,255,0.7);
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            z-index: 500;
            transition: var(--transition);
        }
        .admin-sidebar-brand {
            padding: 2rem 1.5rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .admin-sidebar-brand h2 {
            font-family: 'Cormorant Garamond', serif;
            font-weight: 600;
            color: #ffffff;
            font-size: 1.4rem;
            letter-spacing: 0.04em;
        }
        .admin-sidebar-brand p {
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--accent);
            margin-top: 2px;
        }
        .admin-nav {
            list-style: none;
            padding: 1.5rem 0;
            flex: 1;
        }
        .admin-nav-item a {
            display: flex;
            align-items: center;
            padding: 0.85rem 1.5rem;
            color: rgba(255,255,255,0.7);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            gap: 12px;
            transition: var(--transition);
            border-left: 4px solid transparent;
        }
        .admin-nav-item a:hover {
            color: #ffffff;
            background-color: rgba(255,255,255,0.04);
        }
        .admin-nav-item.active a {
            color: #ffffff;
            background-color: rgba(255,255,255,0.08);
            border-left-color: var(--accent);
        }
        .admin-sidebar-footer {
            padding: 1.5rem;
            border-top: 1px solid rgba(255,255,255,0.08);
        }
        .admin-sidebar-footer a {
            color: rgba(255,255,255,0.4);
            font-size: 0.8rem;
            text-decoration: none;
        }
        .admin-sidebar-footer a:hover {
            color: #ffffff;
        }

        .admin-main {
            flex: 1;
            margin-left: 260px;
            padding: 2rem 2.5rem;
            transition: var(--transition);
        }
        
        .admin-view-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
        }
        .admin-view-header h1 {
            font-family: 'Cormorant Garamond', serif;
            font-size: 2.2rem;
            font-weight: 600;
            color: var(--primary);
        }

        /* Mobile drawer toggle */
        .menu-toggle-btn {
            display: none;
            background-color: var(--primary);
            color: #ffffff;
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 8px;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            position: fixed;
            top: 16px;
            left: 16px;
            z-index: 600;
        }
        .admin-mobile-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background-color: rgba(0,0,0,0.5);
            z-index: 450;
        }

        /* ── ADMIN LOGIN ── */
        .login-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 80vh;
            width: 100%;
        }
        .login-card {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 3rem 2.5rem;
            border: 1px solid var(--border);
            max-width: 380px;
            width: 100%;
            text-align: center;
            box-shadow: var(--shadow-md);
        }
        .login-card svg {
            width: 48px;
            height: 48px;
            margin-bottom: 1.5rem;
            stroke: var(--primary);
        }
        .login-card h2 {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.8rem;
            color: var(--primary);
            margin-bottom: 4px;
        }
        .login-card p {
            font-size: 0.78rem;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.1em;
            margin-bottom: 2rem;
        }

        /* ── ADMIN DASHBOARD ── */
        .admin-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 2rem;
        }
        .stat-card {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 16px;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--border);
        }
        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 1.2rem;
        }
        .stat-icon.green { background-color: var(--success); }
        .stat-icon.teal { background-color: #00796b; }
        .stat-icon.slate { background-color: #455a64; }
        .stat-info {
            display: flex;
            flex-direction: column;
        }
        .stat-label {
            font-size: 0.78rem;
            color: var(--text-muted);
            text-transform: uppercase;
            font-weight: 600;
        }
        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text);
            margin-top: 2px;
        }

        .admin-card {
            background-color: #ffffff;
            border-radius: 12px;
            border: 1px solid var(--border);
            padding: 1.8rem;
            box-shadow: var(--shadow-sm);
        }
        .admin-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.2rem;
        }
        .admin-card-header h2 {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.4rem;
            font-weight: 600;
            color: var(--primary);
        }

        /* ── TABLES ── */
        .table-responsive {
            overflow-x: auto;
            width: 100%;
        }
        .admin-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 0.875rem;
        }
        .admin-table th {
            padding: 12px 16px;
            border-bottom: 2px solid var(--border);
            font-weight: 600;
            color: var(--text-muted);
        }
        .admin-table td {
            padding: 16px;
            border-bottom: 1px solid var(--border);
            color: var(--text);
        }
        .admin-table tr:hover td {
            background-color: #F8F9FA;
        }

        /* ── BADGES ── */
        .badge {
            display: inline-flex;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.72rem;
            font-weight: 600;
        }
        .badge-baru { background-color: #e3f2fd; color: #0d47a1; }
        .badge-diproses { background-color: var(--warning-light); color: var(--warning); }
        .badge-selesai { background-color: var(--success-light); color: var(--success); }
        .badge-menunggu { background-color: var(--warning-light); color: var(--warning); }
        .badge-lunas { background-color: var(--success-light); color: var(--success); }

        /* ── ADMIN KITCHEN QUEUE (KANBAN) ── */
        .kanban-board {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
        }
        .kanban-column {
            background-color: #ebedeb;
            border-radius: 12px;
            padding: 1.2rem;
            min-height: 500px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .kanban-column-header {
            font-size: 0.9rem;
            font-weight: 600;
            text-transform: uppercase;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(0,0,0,0.06);
            letter-spacing: 0.05em;
            margin-bottom: 8px;
        }
        .kanban-column-header.baru { color: #0d47a1; }
        .kanban-column-header.diproses { color: var(--warning); }
        .kanban-column-header.selesai { color: var(--success); }

        .kanban-card {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 1rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            gap: 8px;
            border-left: 4px solid var(--border);
            position: relative;
        }
        .kanban-card.baru { border-left-color: #0d47a1; }
        .kanban-card.diproses { border-left-color: var(--warning); }
        .kanban-card.selesai { border-left-color: var(--success); }
        
        .kanban-card-title {
            font-weight: 600;
            font-size: 0.9rem;
        }
        .kanban-card-meta {
            font-size: 0.75rem;
            color: var(--text-muted);
        }
        .kanban-card-items {
            list-style: none;
            padding: 4px 0;
            font-size: 0.8rem;
        }
        .kanban-card-items li {
            padding: 2px 0;
        }
        .kanban-card-items span {
            color: var(--text-muted);
            margin-left: 4px;
        }
        .kanban-card-notes {
            font-size: 0.72rem;
            background-color: #f5f5f5;
            padding: 6px 8px;
            border-radius: 4px;
            font-style: italic;
            color: #666;
        }
        .kanban-time-badge {
            font-size: 0.65rem;
            color: var(--text-muted);
            margin-top: 4px;
            text-align: right;
        }

        /* ── ADMIN PAYMENTS ── */
        .filter-header {
            display: flex;
            gap: 8px;
            margin-bottom: 1.5rem;
        }
        .payment-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
        }
        .payment-card {
            background-color: #ffffff;
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
        }

        /* ── ADMIN MENU ── */
        .menu-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 20px;
        }
        .admin-menu-card {
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
            display: flex;
            flex-direction: column;
            transition: var(--transition);
        }
        .admin-menu-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }
        .admin-menu-card img {
            width: 100%;
            height: 160px;
            object-fit: cover;
            border-bottom: 1px solid var(--border);
        }
        .admin-menu-placeholder {
            width: 100%;
            height: 160px;
            background-color: #EAF2EE;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--primary);
            font-size: 2.5rem;
            border-bottom: 1px solid var(--border);
        }
        .admin-menu-card-body {
            padding: 1.2rem;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .admin-menu-name {
            font-weight: 600;
            font-size: 0.95rem;
            margin-bottom: 4px;
        }
        .admin-menu-category {
            font-size: 0.72rem;
            background-color: #f0f0f0;
            padding: 2px 6px;
            border-radius: 10px;
            color: #666;
            display: inline-block;
            margin-bottom: 8px;
            align-self: flex-start;
        }
        .admin-menu-price {
            font-weight: 700;
            color: var(--primary);
            font-size: 1rem;
            margin-bottom: 8px;
        }
        .admin-menu-desc {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 12px;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .admin-menu-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #f5f5f5;
            padding-top: 8px;
            margin-top: auto;
        }
        .menu-status-badge {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 12px;
        }
        .menu-status-badge.tersedia { background-color: var(--success-light); color: var(--success); }
        .menu-status-badge.habis { background-color: #ffebee; color: #c62828; }

        /* ── MODALS (FORM ADD/EDIT) ── */
        .admin-modal-overlay {
            position: fixed;
            inset: 0;
            background-color: rgba(0,0,0,0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 24px;
        }
        .admin-modal-overlay.show { display: flex; }
        .admin-modal-box {
            background-color: #ffffff;
            border-radius: 12px;
            width: 100%;
            max-width: 480px;
            padding: 1.8rem;
            box-shadow: var(--shadow-md);
            max-height: 90vh;
            overflow-y: auto;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 1rem;
        }
        .form-group-admin {
            margin-bottom: 1rem;
        }
        .form-group-admin label {
            display: block;
            font-size: 0.8rem;
            font-weight: 500;
            margin-bottom: 6px;
            color: #444;
        }
        .form-control-admin {
            width: 100%;
            padding: 0.7rem 0.9rem;
            border: 1px solid var(--border);
            border-radius: 6px;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            outline: none;
        }
        .form-control-admin:focus {
            border-color: var(--primary);
        }
        
        /* ── STRUK STYLE (FOR PRINT) ── */
        .receipt-container {
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            color: #000;
        }
        .receipt-header {
            text-align: center;
            margin-bottom: 1.2rem;
            border-bottom: 1px dashed #ccc;
            padding-bottom: 12px;
        }
        .receipt-header h3 {
            font-family: 'Poppins', sans-serif;
            font-weight: 700;
            font-size: 1.1rem;
        }
        .receipt-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        .receipt-row.total {
            border-top: 1px dashed #ccc;
            margin-top: 8px;
            padding-top: 8px;
            font-weight: bold;
        }

        /* ── RESPONSIVE DESIGN ── */
        @media (max-width: 991px) {
            .admin-sidebar {
                transform: translateX(-100%);
            }
            .admin-sidebar.open {
                transform: translateX(0);
            }
            .admin-main {
                margin-left: 0;
                padding-top: 5rem;
            }
            .menu-toggle-btn {
                display: flex;
            }
            .admin-sidebar.open ~ .admin-mobile-overlay {
                display: block;
            }
            .kanban-board {
                grid-template-columns: 1fr;
            }
        }

        /* ── TOAST NOTIFICATION ── */
        .toast-notify {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(40px);
            background-color: #111111;
            color: #ffffff;
            padding: 0.75rem 1.8rem;
            border-radius: 30px;
            font-size: 0.825rem;
            font-weight: 500;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            opacity: 0;
            pointer-events: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 2000;
            white-space: nowrap;
        }
        .toast-notify.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* Print media styles */
        @media print {
            body * { visibility: hidden; }
            #receipt-modal-content, #receipt-modal-content * { visibility: visible; }
            #receipt-modal-content {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
            }
            .modal-close, button { display: none !important; }
        }
    </style>
</head>
<body>

    <!-- ==================== CUSTOMER APP SHELL ==================== -->
    <div id="customer-shell" class="customer-shell">
        <header class="customer-header">
            <div>
                <h1 onclick="window.location.hash='#/'" style="cursor:pointer;">Resto Nusantara</h1>
                <p class="subtitle" id="header-meja-subtitle">Selamat Datang</p>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
                <a href="#/admin" class="circle-btn" title="Admin Panel">
                    <!-- Lock Icon SVG -->
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                </a>
                
                <a href="#/cart" class="circle-btn" style="position: relative;" id="header-cart-btn">
                    <!-- Shopping Bag SVG -->
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <path d="M16 10a4 4 0 0 1-8 0"/>
                    </svg>
                    <span id="header-cart-badge" style="position: absolute; top: -4px; right: -4px; background: var(--primary); color: #fff; font-size: 9px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">0</span>
                </a>
            </div>
        </header>

        <!-- 1. Customer Home View -->
        <div id="view-home" class="view-container">
            <div class="search-container">
                <input type="text" id="home-search" placeholder="Cari menu lezat..." oninput="handleSearch(this.value)">
            </div>
            
            <div class="category-tabs" id="home-category-tabs">
                <!-- Tabs render dynamically -->
            </div>
            
            <p class="section-title">Menu Kami</p>
            <div class="menu-list" id="home-menu-list">
                <!-- Menu list renders dynamically -->
            </div>
        </div>

        <!-- 2. Customer Detail View -->
        <div id="view-detail" class="view-container">
            <div style="margin-bottom: 1.2rem;">
                <button class="circle-btn" onclick="history.back()">←</button>
            </div>
            
            <div id="detail-item-content">
                <!-- Details render dynamically -->
            </div>
        </div>

        <!-- 3. Customer Cart View -->
        <div id="view-cart" class="view-container">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <button class="circle-btn" onclick="history.back()">←</button>
                <h2 class="section-title" style="margin-bottom:0;">Keranjang Belanja</h2>
                <div style="width: 40px;"></div>
            </div>

            <div id="cart-item-list" class="cart-list">
                <!-- Cart items list renders dynamically -->
            </div>

            <div id="cart-empty-state" style="text-align:center; padding: 4rem 2rem; color:var(--text-muted); display:none;">
                <div style="font-size:3rem; margin-bottom: 1rem;">🛒</div>
                <h3 style="margin-bottom:0.5rem; color:var(--primary);">Keranjang Kosong</h3>
                <p style="font-size:0.85rem; margin-bottom:1.5rem;">Silakan tambahkan hidangan menu kesukaan Anda terlebih dahulu.</p>
                <a href="#/" class="btn btn-primary">Lihat Menu</a>
            </div>

            <div id="cart-summary-block">
                <div class="form-group-admin" style="margin-bottom: 1.2rem;">
                    <label class="form-label" style="font-weight: 500;">Catatan Tambahan</label>
                    <input type="text" class="form-control" id="cart-notes" placeholder="Contoh: Tanpa pedas, saus dipisah..." oninput="saveCartNotes(this.value)">
                </div>

                <div class="summary-card">
                    <div class="summary-row">
                        <span>Subtotal</span>
                        <span id="cart-subtotal">Rp 0</span>
                    </div>
                    <div class="summary-row">
                        <span id="cart-tax-label">PPN 11%</span>
                        <span id="cart-tax">Rp 0</span>
                    </div>
                    <div class="summary-row total">
                        <span>Total Bayar</span>
                        <span id="cart-total">Rp 0</span>
                    </div>
                </div>
                
                <button class="btn btn-primary" style="width: 100%;" onclick="window.location.hash='#/checkout'">Lanjut ke Checkout</button>
            </div>
        </div>

        <!-- 4. Customer Checkout View -->
        <div id="view-checkout" class="view-container">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <button class="circle-btn" onclick="history.back()">←</button>
                <h2 class="section-title" style="margin-bottom:0;">Konfirmasi Pesanan</h2>
                <div style="width: 40px;"></div>
            </div>

            <div class="card-form">
                <p class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 12px;">Identitas Pemesan</p>
                
                <div class="form-group-admin" style="margin-bottom: 1rem;">
                    <label class="form-label">Nama Pemesan <span class="required-star">*</span></label>
                    <input type="text" id="checkout-nama" class="form-control" placeholder="Masukkan nama Anda" oninput="clearFormError('checkout-nama')">
                    <div id="err-checkout-nama" class="input-error-msg">⚠ Nama pemesan wajib diisi</div>
                </div>

                <div class="form-group-admin" style="margin-bottom: 0.5rem;">
                    <label class="form-label">Nomor Meja <span class="required-star">*</span></label>
                    <input type="number" id="checkout-meja" class="form-control" placeholder="Contoh: 5" min="1" oninput="clearFormError('checkout-meja')">
                    <div id="err-checkout-meja" class="input-error-msg">⚠ Nomor meja wajib diisi</div>
                </div>
            </div>

            <div class="card-form">
                <p class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 12px;">Ringkasan Belanja</p>
                <div id="checkout-items-summary" style="font-size:0.85rem; color:#555; display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                    <!-- items summary -->
                </div>
                <div class="divider" style="margin: 8px 0;"></div>
                <div class="summary-row">
                    <span>Subtotal</span>
                    <span id="checkout-subtotal">Rp 0</span>
                </div>
                <div class="summary-row">
                    <span id="checkout-tax-label">PPN</span>
                    <span id="checkout-tax">Rp 0</span>
                </div>
                <div class="summary-row" style="font-weight: 700; color: var(--primary); font-size: 0.95rem; margin-top:4px;">
                    <span>Total Pembayaran</span>
                    <span id="checkout-total">Rp 0</span>
                </div>
            </div>

            <div class="card-form">
                <p class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 12px;">Metode Pembayaran</p>
                
                <div class="payment-options">
                    <label class="payment-box selected" id="payment-opt-tunai" onclick="selectPaymentMethod('tunai')">
                        <input type="radio" name="payment-method" value="tunai" checked>
                        <div class="payment-box-icon">💵</div>
                        <div>
                            <div class="payment-box-title">Bayar ke Kasir</div>
                            <div class="payment-box-desc">Selesaikan pembayaran secara tunai di kasir</div>
                        </div>
                    </label>

                    <label class="payment-box" id="payment-opt-qris" onclick="selectPaymentMethod('qris')">
                        <input type="radio" name="payment-method" value="qris">
                        <div class="payment-box-icon">📱</div>
                        <div>
                            <div class="payment-box-title">QRIS</div>
                            <div class="payment-box-desc">Scan kode QR untuk pembayaran instan</div>
                        </div>
                    </label>
                    
                    <label class="payment-box" id="payment-opt-va" onclick="selectPaymentMethod('va')">
                        <input type="radio" name="payment-method" value="va">
                        <div class="payment-box-icon">🏦</div>
                        <div>
                            <div class="payment-box-title">Virtual Account (Bank Transfer)</div>
                            <div class="payment-box-desc">Bayar menggunakan transfer VA bank</div>
                        </div>
                    </label>
                </div>
            </div>
            
            <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="submitOrder()">Pesan Sekarang</button>
        </div>

        <!-- 5. Customer Status View -->
        <div id="view-status" class="view-container">
            <div id="status-view-content">
                <!-- Status page content dynamic -->
            </div>
        </div>

        <!-- Sticky Floating bottom action button for cart -->
        <div class="customer-bottom-bar" id="cart-float-bar" style="display:none;">
            <a href="#/cart" class="btn btn-primary" style="width: 100%;" id="cart-float-btn">Lihat Keranjang (0)</a>
        </div>
    </div>


    <!-- ==================== ADMIN APP SHELL ==================== -->
    <button class="menu-toggle-btn" id="admin-menu-toggle" onclick="toggleAdminSidebar()">☰</button>
    <div class="admin-mobile-overlay" id="admin-mobile-overlay" onclick="toggleAdminSidebar()"></div>

    <div id="admin-shell" class="admin-shell" style="display: none;">
        <aside class="admin-sidebar" id="admin-sidebar">
            <div class="admin-sidebar-brand">
                <h2>Resto Nusantara</h2>
                <p>Panel Admin</p>
            </div>
            <ul class="admin-nav">
                <li class="admin-nav-item" id="nav-admin-dashboard">
                    <a href="#/admin/dashboard" onclick="closeAdminSidebarOnMobile()">
                        <span>📊</span> Dashboard
                    </a>
                </li>
                <li class="admin-nav-item" id="nav-admin-dapur">
                    <a href="#/admin/dapur" onclick="closeAdminSidebarOnMobile()">
                        <span>🍳</span> Antrian Dapur
                    </a>
                </li>
                <li class="admin-nav-item" id="nav-admin-pembayaran">
                    <a href="#/admin/pembayaran" onclick="closeAdminSidebarOnMobile()">
                        <span>💳</span> Pembayaran
                    </a>
                </li>
                <li class="admin-nav-item" id="nav-admin-menu">
                    <a href="#/admin/menu" onclick="closeAdminSidebarOnMobile()">
                        <span>🍔</span> Kelola Menu
                    </a>
                </li>
                <li class="admin-nav-item" id="nav-admin-settings">
                    <a href="#/admin/settings" onclick="closeAdminSidebarOnMobile()">
                        <span>⚙️</span> Pengaturan
                    </a>
                </li>
            </ul>
            <div class="admin-sidebar-footer">
                <a href="#/" onclick="logoutAdmin()">🚪 Keluar Panel Admin</a>
            </div>
        </aside>

        <main class="admin-main">
            <!-- 1. Admin Login View -->
            <div id="view-admin-login" class="view-container">
                <div class="login-wrapper">
                    <div class="login-card">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M22 12h-4c0 1.66-1.34 3-3 3s-3-1.34-3-3H2"/>
                        </svg>
                        <h2>Resto Nusantara</h2>
                        <p>Panel Keamanan Admin</p>
                        
                        <div class="form-group-admin" style="text-align: left; margin-bottom: 1.5rem;">
                            <label class="form-label">Password Masuk</label>
                            <input type="password" id="admin-password-input" class="form-control-admin" placeholder="Masukkan password (default: admin)">
                            <div id="admin-login-error" class="input-error-msg">⚠ Password salah! silakan coba lagi.</div>
                        </div>

                        <button class="btn btn-primary" style="width: 100%;" onclick="loginAdmin()">Masuk ke Dashboard</button>
                        <a href="#/" class="btn btn-secondary" style="width: 100%; margin-top: 10px;">Kembali ke Beranda</a>
                    </div>
                </div>
            </div>

            <!-- 2. Admin Dashboard View -->
            <div id="view-admin-dashboard" class="view-container">
                <div class="admin-view-header">
                    <h1>Dashboard</h1>
                    <div style="font-size: 0.85rem; color:#888;" id="dashboard-date">Hari ini</div>
                </div>
                
                <div class="admin-stats-grid" id="dashboard-stats-grid">
                    <!-- stats render dynamically -->
                </div>
                
                <div class="admin-card">
                    <div class="admin-card-header">
                        <h2>Pesanan Terbaru (Hari Ini)</h2>
                        <a href="#/admin/dapur" style="font-size: 0.8rem; color:var(--primary); font-weight: 500; text-decoration: none;">Lihat Dapur →</a>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Meja</th>
                                    <th>Pelanggan</th>
                                    <th>Waktu</th>
                                    <th>Status</th>
                                    <th>Metode</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody id="dashboard-recent-orders-list">
                                <!-- lists -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 3. Admin Kitchen Queue View -->
            <div id="view-admin-dapur" class="view-container">
                <div class="admin-view-header">
                    <h1>Antrian Dapur</h1>
                    <div style="font-size: 0.75rem; color:#888;" id="dapur-last-updated">Terakhir update: -</div>
                </div>
                
                <div class="kanban-board">
                    <div class="kanban-column">
                        <div class="kanban-column-header baru">Baru (Belum Diproses)</div>
                        <div id="kanban-baru" style="display:flex; flex-direction:column; gap:12px;"></div>
                    </div>
                    <div class="kanban-column">
                        <div class="kanban-column-header diproses">Sedang Diproses</div>
                        <div id="kanban-diproses" style="display:flex; flex-direction:column; gap:12px;"></div>
                    </div>
                    <div class="kanban-column">
                        <div class="kanban-column-header selesai">Siap Saji / Selesai</div>
                        <div id="kanban-selesai" style="display:flex; flex-direction:column; gap:12px;"></div>
                    </div>
                </div>
            </div>

            <!-- 4. Admin Payments View -->
            <div id="view-admin-pembayaran" class="view-container">
                <div class="admin-view-header">
                    <h1>Verifikasi Pembayaran</h1>
                </div>
                
                <div class="filter-header">
                    <button class="category-tab active" id="pay-filter-waiting" onclick="setPaymentFilter('Menunggu')">Menunggu Konfirmasi</button>
                    <button class="category-tab" id="pay-filter-done" onclick="setPaymentFilter('Lunas')">Sudah Lunas</button>
                </div>
                
                <div class="payment-grid" id="admin-payment-grid">
                    <!-- cards rendering dynamically -->
                </div>
            </div>

            <!-- 5. Admin Menu View -->
            <div id="view-admin-menu" class="view-container">
                <div class="admin-view-header">
                    <h1>Kelola Menu</h1>
                    <button class="btn btn-primary" onclick="openMenuFormModal()">+ Tambah Menu Baru</button>
                </div>
                
                <div class="menu-grid" id="admin-menu-grid">
                    <!-- items dynamic -->
                </div>
            </div>

            <!-- 6. Admin Settings View -->
            <div id="view-admin-settings" class="view-container">
                <div class="admin-view-header">
                    <h1>Pengaturan Resto</h1>
                </div>

                <div class="admin-card" style="margin-bottom: 20px;">
                    <h2 class="section-title" style="color:var(--primary); font-size:1.15rem; margin-bottom: 1.2rem; border-bottom:1px solid #eee; padding-bottom:8px;">Informasi Restoran</h2>
                    
                    <div class="form-row">
                        <div class="form-group-admin">
                            <label class="form-label">Nama Restoran</label>
                            <input type="text" id="set-resto-nama" class="form-control-admin" placeholder="Nama Resto">
                        </div>
                        <div class="form-group-admin">
                            <label class="form-label">Telepon</label>
                            <input type="text" id="set-resto-telepon" class="form-control-admin" placeholder="Nomor Telepon">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group-admin" style="grid-column: span 2;">
                            <label class="form-label">Alamat Lengkap</label>
                            <input type="text" id="set-resto-alamat" class="form-control-admin" placeholder="Alamat Resto">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group-admin">
                            <label class="form-label">PPN (%)</label>
                            <input type="number" id="set-resto-ppn" class="form-control-admin" placeholder="11" min="0" max="100">
                        </div>
                        <div class="form-group-admin">
                            <label class="form-label">Prefix Virtual Account</label>
                            <input type="text" id="set-resto-va" class="form-control-admin" placeholder="888001">
                        </div>
                    </div>
                </div>

                <div class="admin-card" style="margin-bottom: 20px;">
                    <h2 class="section-title" style="color:var(--primary); font-size:1.15rem; margin-bottom: 1.2rem; border-bottom:1px solid #eee; padding-bottom:8px;">Metode Pembayaran QRIS</h2>
                    <div class="form-group-admin">
                        <label class="form-label">QRIS Image URL (atau gunakan gambar base64)</label>
                        <input type="text" id="set-qris-url" class="form-control-admin" placeholder="https://example.com/qris.png" style="margin-bottom:12px;">
                        <input type="file" id="set-qris-file" accept="image/*" onchange="uploadQRISFile()" style="font-family:'Poppins', sans-serif; font-size:0.8rem; cursor:pointer;">
                    </div>
                    <div id="qris-preview-settings" style="width: 150px; height: 150px; border: 1px solid var(--border); border-radius: 8px; margin-top: 10px; display:flex; align-items:center; justify-content:center; overflow:hidden; background-color:#FAFAFA;">
                        <span style="color:#999; font-size:0.75rem;">Preview QRIS</span>
                    </div>
                </div>

                <div class="admin-card" style="margin-bottom: 30px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.2rem; border-bottom:1px solid #eee; padding-bottom:8px;">
                        <h2 class="section-title" style="color:var(--primary); font-size:1.15rem; margin-bottom: 0;">Rekening Virtual Bank Transfer</h2>
                        <button class="btn btn-secondary" style="padding: 4px 10px; font-size:0.75rem;" onclick="addBankAccountRow()">+ Tambah Bank</button>
                    </div>

                    <div id="bank-accounts-settings-container">
                        <!-- rows of banks dynamically -->
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end;">
                    <button class="btn btn-primary" onclick="saveAllSettings()">Simpan Semua Pengaturan</button>
                </div>
            </div>
        </main>
    </div>


    <!-- ==================== DIALOGS & OVERLAYS ==================== -->

    <!-- QRIS Modal (Customer view) -->
    <div id="customer-qris-modal" class="modal-overlay">
        <div class="modal-card">
            <button class="modal-close" onclick="closeQRISModal()">×</button>
            <h2 style="font-family: 'Cormorant Garamond', serif; color: var(--primary); font-size: 1.4rem;">Scan QRIS Pembayaran</h2>
            <div id="customer-qris-modal-amount" style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin: 0.5rem 0;">Rp 0</div>
            <div id="customer-qris-img-container">
                <!-- QRIS img -->
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.5; margin: 12px 0 24px;">Silakan scan kode QRIS di atas dengan e-wallet (GoPay, OVO, Dana, LinkAja) atau Mobile Banking Anda. Tunjukkan layar sukses pembayaran ke kasir.</p>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" style="flex:1;" onclick="closeQRISModal()">Batal</button>
                <button class="btn btn-primary" style="flex:1;" onclick="confirmQRISPayment()">Sudah Bayar</button>
            </div>
        </div>
    </div>

    <!-- Admin Menu Form Modal -->
    <div id="admin-menu-modal" class="admin-modal-overlay">
        <div class="admin-modal-box">
            <h3 id="menu-modal-title" style="font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: var(--primary); margin-bottom: 1.2rem;">Tambah Menu</h3>
            
            <div id="admin-menu-form-preview" style="width: 100%; height: 180px; background-color: #f5f5f5; border-radius: 8px; margin-bottom: 12px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                <span style="color:#999; font-size:0.8rem;">📷 Preview Foto Menu</span>
            </div>

            <form id="admin-menu-form" onsubmit="submitMenuForm(event)">
                <input type="hidden" id="form-menu-id">
                
                <div class="form-group-admin">
                    <label>Upload Foto</label>
                    <input type="file" id="form-menu-file" accept="image/*" onchange="previewMenuImageFile()" style="font-family:'Poppins', sans-serif; font-size:0.8rem; border: 1px dashed #ccc; padding: 8px; width: 100%; border-radius: 6px; cursor: pointer;">
                </div>

                <div class="form-group-admin">
                    <label>Nama Menu</label>
                    <input type="text" id="form-menu-nama" class="form-control-admin" placeholder="Nama masakan/minuman" required>
                </div>

                <div class="form-row">
                    <div class="form-group-admin">
                        <label>Kategori</label>
                        <select id="form-menu-kategori" class="form-control-admin">
                            <option value="Makanan">Makanan</option>
                            <option value="Minuman">Minuman</option>
                            <option value="Dessert">Dessert</option>
                        </select>
                    </div>
                    <div class="form-group-admin">
                        <label>Harga (Rupiah)</label>
                        <input type="number" id="form-menu-harga" class="form-control-admin" placeholder="Harga" min="0" required>
                    </div>
                </div>

                <div class="form-group-admin">
                    <label>Deskripsi Hidangan</label>
                    <textarea id="form-menu-deskripsi" class="form-control-admin" rows="3" placeholder="Tulis deskripsi atau komposisi hidangan..."></textarea>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeMenuFormModal()">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan Menu</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Admin Payment Cash Confirmation Modal -->
    <div id="admin-pay-confirm-modal" class="modal-overlay">
        <div class="modal-card">
            <div style="font-size: 3rem; margin-bottom: 12px;">💸</div>
            <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; color: var(--primary);">Konfirmasi Pembayaran Kasir</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 8px 0 16px;">
                Apakah Anda memverifikasi bahwa pesanan <b id="pay-confirm-order-id">#0000</b> telah dibayar lunas?
            </p>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--primary); margin-bottom: 24px;" id="pay-confirm-amount">Rp 0</div>
            <div style="display: flex; gap: 12px;">
                <button class="btn btn-secondary" style="flex: 1;" onclick="closePaymentConfirmModal()">Batal</button>
                <button class="btn btn-primary" style="flex: 1;" onclick="executePaymentConfirm()">Lunas</button>
            </div>
        </div>
    </div>

    <!-- Admin Receipt Struk Modal -->
    <div id="admin-receipt-modal" class="modal-overlay">
        <div class="modal-card" style="max-width: 400px; text-align: left;">
            <button class="modal-close" onclick="closeReceiptModal()">×</button>
            <div id="receipt-modal-content">
                <!-- Struk content dynamic -->
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn btn-primary" style="flex:1;" onclick="window.print()">🖨 Cetak Struk</button>
                <button class="btn btn-secondary" style="flex:1;" onclick="closeReceiptModal()">Tutup</button>
            </div>
        </div>
    </div>

    <!-- Toast Notification Element -->
    <div id="toast-notify" class="toast-notify">Notifikasi</div>


    <!-- ==================== FRONTEND CONTROLLERS ==================== -->
    <script>
        // State Management
        const state = {
            cart: JSON.parse(localStorage.getItem('rn_cart')) || [],
            menu: [],
            orders: [],
            settings: {
                restoInfo: { nama: 'Resto Nusantara', alamat: '', telepon: '', ppn: 11 },
                bankAccounts: [],
                vaNumber: '888001',
                qrisUrl: ''
            },
            currentCategory: 'Semua',
            searchQuery: '',
            paymentMethod: 'tunai',
            paymentFilter: 'Menunggu',
            adminLoggedIn: sessionStorage.getItem('adminLoggedIn') === 'true',
            menuImageBase64: '',
            qrisImageBase64: '',
            activeIntervals: []
        };

        // Fetch utilities
        async function apiFetch(path, options = {}) {
            try {
                const res = await fetch(path, {
                    headers: { 'Content-Type': 'application/json' },
                    ...options
                });
                if (!res.ok) throw new Error(\`HTTP error! status: \${res.status}\`);
                return await res.json();
            } catch (err) {
                console.error(\`Failed to fetch \${path}:\`, err);
                showToast('Koneksi server gagal');
            }
        }

        // Initialize App
        async function init() {
            // Load base data
            await refreshData();

            // Setup Router
            window.addEventListener('hashchange', handleRoute);
            handleRoute();

            // Run status background refresh loop
            state.activeIntervals.push(setInterval(() => {
                const hash = window.location.hash || '#/';
                // Polling for live status page
                if (hash.startsWith('#/status/')) {
                    const orderId = decodeURIComponent(hash.split('/').pop());
                    pollOrderStatus(orderId);
                }
                // Polling for admin screens
                if (hash.startsWith('#/admin/')) {
                    pollAdminData();
                }
            }, 3000));
        }

        async function refreshData() {
            const [menu, settings, orders] = await Promise.all([
                apiFetch('/api/menu'),
                apiFetch('/api/settings'),
                state.adminLoggedIn ? apiFetch('/api/orders') : Promise.resolve([])
            ]);
            
            if (menu) state.menu = menu;
            if (settings && Object.keys(settings).length) state.settings = settings;
            if (orders) state.orders = orders;

            updateCartHeaderBadge();
        }

        async function pollOrderStatus(orderId) {
            const orders = await apiFetch('/api/orders');
            if (orders) {
                const found = orders.find(o => o.id === orderId);
                if (found) {
                    const hash = window.location.hash;
                    // Render status directly if state changed
                    const currentView = document.getElementById('view-status');
                    if (currentView.classList.contains('active')) {
                        const statusBadge = document.getElementById('order-timeline-block');
                        if (statusBadge) {
                            renderStatus(orderId, found);
                        }
                    }
                }
            }
        }

        async function pollAdminData() {
            if (!state.adminLoggedIn) return;
            const orders = await apiFetch('/api/orders');
            if (orders) {
                state.orders = orders;
                const hash = window.location.hash;
                if (hash === '#/admin/dashboard') renderAdminDashboard();
                else if (hash === '#/admin/dapur') renderAdminDapur();
                else if (hash === '#/admin/pembayaran') renderAdminPembayaran();
            }
        }

        // Clean router logic
        function handleRoute() {
            const hash = window.location.hash || '#/';
            
            // Hide admin menu button by default
            document.getElementById('admin-menu-toggle').style.display = 'none';

            // Check view layouts
            const customerShell = document.getElementById('customer-shell');
            const adminShell = document.getElementById('admin-shell');

            if (hash.startsWith('#/admin')) {
                // Admin Area Layout
                customerShell.style.display = 'none';
                adminShell.style.display = 'flex';

                if (!hash.startsWith('#/admin') || hash === '#/admin') {
                    if (state.adminLoggedIn) {
                        window.location.hash = '#/admin/dashboard';
                        return;
                    } else {
                        showView('view-admin-login');
                        renderAdminLogin();
                    }
                } else {
                    if (!state.adminLoggedIn) {
                        window.location.hash = '#/admin';
                        return;
                    }
                    
                    document.getElementById('admin-menu-toggle').style.display = 'flex';
                    
                    // Route Subpages
                    const subRoute = hash.replace('#/admin/', '');
                    
                    // Nav active highlighting
                    document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
                    const navId = 'nav-admin-' + subRoute;
                    const navEl = document.getElementById(navId);
                    if (navEl) navEl.classList.add('active');

                    if (subRoute === 'dashboard') {
                        showView('view-admin-dashboard');
                        renderAdminDashboard();
                    } else if (subRoute === 'dapur') {
                        showView('view-admin-dapur');
                        renderAdminDapur();
                    } else if (subRoute === 'pembayaran') {
                        showView('view-admin-pembayaran');
                        renderAdminPembayaran();
                    } else if (subRoute === 'menu') {
                        showView('view-admin-menu');
                        renderAdminMenu();
                    } else if (subRoute === 'settings') {
                        showView('view-admin-settings');
                        renderAdminSettings();
                    }
                }
            } else {
                // Customer Area Layout
                customerShell.style.display = 'flex';
                adminShell.style.display = 'none';

                // Display/hide cart floating bottom bar
                const bar = document.getElementById('cart-float-bar');
                if (hash === '#/' && getCartCount() > 0) {
                    bar.style.display = 'flex';
                } else {
                    bar.style.display = 'none';
                }

                // Header subtitle update
                const subEl = document.getElementById('header-meja-subtitle');
                const table = localStorage.getItem('tableNumber');
                subEl.textContent = table ? \`Selamat Datang · Meja \${table}\` : 'Selamat Datang';

                if (hash === '#/' || hash === '') {
                    showView('view-home');
                    renderHome();
                } else if (hash.startsWith('#/detail/')) {
                    const id = hash.split('/').pop();
                    showView('view-detail');
                    renderDetail(id);
                } else if (hash === '#/cart') {
                    showView('view-cart');
                    renderCart();
                } else if (hash === '#/checkout') {
                    showView('view-checkout');
                    renderCheckout();
                } else if (hash.startsWith('#/status/')) {
                    const id = decodeURIComponent(hash.split('/').pop());
                    showView('view-status');
                    renderStatus(id);
                }
            }
        }

        function showView(viewId) {
            document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
            const container = document.getElementById(viewId);
            if (container) container.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'instant' });
        }


        // ==================== CUSTOMER HOME CONTROLLER ====================
        function renderHome() {
            // Render category tabs
            const categories = ['Semua', 'Makanan', 'Minuman', 'Dessert'];
            const tabContainer = document.getElementById('home-category-tabs');
            tabContainer.innerHTML = categories.map(cat => \`
                <button class="category-tab \${state.currentCategory === cat ? 'active' : ''}" onclick="setCategory('\${cat}')">
                    \${cat}
                </button>
            \`).join('');

            // Render list
            const menuContainer = document.getElementById('home-menu-list');
            let filteredMenu = state.menu;

            if (state.currentCategory !== 'Semua') {
                filteredMenu = filteredMenu.filter(m => m.kategori === state.currentCategory);
            }
            if (state.searchQuery.trim() !== '') {
                const query = state.searchQuery.toLowerCase();
                filteredMenu = filteredMenu.filter(m => 
                    m.nama.toLowerCase().includes(query) || 
                    (m.deskripsi && m.deskripsi.toLowerCase().includes(query))
                );
            }

            if (filteredMenu.length === 0) {
                menuContainer.innerHTML = \`
                    <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                        <div style="font-size:2.5rem; margin-bottom:0.5rem;">🍽️</div>
                        <p style="font-size:0.875rem;">Menu tidak ditemukan. Coba cari kata kunci lain.</p>
                    </div>\`;
                return;
            }

            menuContainer.innerHTML = filteredMenu.map(m => \`
                <div class="menu-item-row" onclick="window.location.hash='#/detail/\${m.id}'">
                    \${m.gambar ? 
                        \`<img src="\${m.gambar}" alt="\${m.nama}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150&h=150&fit=crop'">\` : 
                        \`<div style="width:80px; height:80px; border-radius:8px; background-color:var(--primary-light); color:var(--primary); font-size:2rem; display:flex; align-items:center; justify-content:center; flex-shrink:0;">🍽️</div>\`
                    }
                    <div class="menu-item-content">
                        <div class="menu-item-title">\${m.nama}</div>
                        <div class="menu-item-description">\${m.deskripsi || '-'}</div>
                        <div class="menu-item-bottom">
                            <span class="menu-item-price">\${formatRupiah(m.harga)}</span>
                            \${m.tersedia ? 
                                \`<button class="add-cart-btn" onclick="quickAddToCart(event, '\${m.id}')">+</button>\` :
                                \`<span class="menu-item-badge-habis">Habis</span>\`
                            }
                        </div>
                    </div>
                </div>
            \`).join('');
            
            // Cart float bar handle
            const bar = document.getElementById('cart-float-bar');
            if (getCartCount() > 0) {
                bar.style.display = 'flex';
                document.getElementById('cart-float-btn').textContent = \`Lihat Keranjang (\${getCartCount()})\`;
            } else {
                bar.style.display = 'none';
            }
        }

        function setCategory(cat) {
            state.currentCategory = cat;
            renderHome();
        }

        function handleSearch(val) {
            state.searchQuery = val;
            renderHome();
        }

        function quickAddToCart(e, id) {
            e.stopPropagation();
            addCartItem(id, 1, '');
            showToast('Ditambahkan ke keranjang');
            renderHome();
        }


        // ==================== CUSTOMER DETAIL CONTROLLER ====================
        let detailQty = 1;
        function renderDetail(id) {
            const item = state.menu.find(m => m.id === id);
            const container = document.getElementById('detail-item-content');
            
            if (!item) {
                container.innerHTML = \`<p style="color:var(--text-muted); text-align:center; padding: 2rem;">Item tidak ditemukan.</p>\`;
                return;
            }

            detailQty = 1;

            container.innerHTML = \`
                \${item.gambar ? 
                    \`<img src="\${item.gambar}" alt="\${item.nama}" class="detail-img" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=480&h=300&fit=crop'">\` :
                    \`<div style="width:100%; height:200px; border-radius:12px; background-color:var(--primary-light); color:var(--primary); font-size:4rem; display:flex; align-items:center; justify-content:center; margin-bottom:1.5rem;">🍽️</div>\`
                }
                
                <h1 class="detail-title">\${item.nama}</h1>
                <div class="detail-price">\${formatRupiah(item.harga)}</div>
                <div class="detail-desc">\${item.deskripsi || 'Tidak ada deskripsi hidangan.'}</div>

                \${item.tersedia ? \`
                    <div class="control-group">
                        <div class="qty-picker">
                            <span style="font-size:0.875rem; font-weight:600;">Jumlah</span>
                            <div class="qty-selectors">
                                <button class="qty-btn-large" onclick="changeDetailQty(-1)">−</button>
                                <span class="qty-val-large" id="detail-qty-val">1</span>
                                <button class="qty-btn-large" onclick="changeDetailQty(1)">+</button>
                            </div>
                        </div>
                        
                        <div class="form-group-admin" style="margin-bottom:0;">
                            <label class="form-label" style="font-weight:500;">Catatan Tambahan</label>
                            <input type="text" id="detail-note" class="note-input" placeholder="Contoh: Sangat pedas, tanpa seledri...">
                        </div>
                    </div>
                    
                    <button class="btn btn-primary" style="width: 100%;" onclick="addDetailToCart('\${item.id}')">Tambah ke Keranjang</button>
                \` : \`
                    <div style="background-color:#ffebee; color:#c62828; text-align:center; padding: 1rem; border-radius:8px; font-weight:600; font-size:0.9rem;">
                        Maaf, hidangan menu ini sedang habis
                    </div>
                \`}
            \`;
        }

        function changeDetailQty(delta) {
            detailQty += delta;
            if (detailQty < 1) detailQty = 1;
            const el = document.getElementById('detail-qty-val');
            if (el) el.textContent = detailQty;
        }

        function addDetailToCart(id) {
            const note = document.getElementById('detail-note').value.trim();
            addCartItem(id, detailQty, note);
            showToast('Ditambahkan ke keranjang');
            window.location.hash = '#/';
        }


        // ==================== CUSTOMER CART CONTROLLER ====================
        function renderCart() {
            const listEl = document.getElementById('cart-item-list');
            const summaryEl = document.getElementById('cart-summary-block');
            const emptyEl = document.getElementById('cart-empty-state');
            
            if (state.cart.length === 0) {
                listEl.style.display = 'none';
                summaryEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }

            listEl.style.display = 'block';
            summaryEl.style.display = 'block';
            emptyEl.style.display = 'none';

            // Set dynamic note value if saved
            document.getElementById('cart-notes').value = localStorage.getItem('rn_catatan_pesanan') || '';

            listEl.innerHTML = state.cart.map(item => {
                const menuItem = state.menu.find(m => m.id === item.id);
                if (!menuItem) return '';
                return \`
                    <div class="cart-item-card">
                        \${menuItem.gambar ? 
                            \`<img src="\${menuItem.gambar}" alt="\${menuItem.nama}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop'">\` :
                            \`<div style="width:60px; height:60px; border-radius:6px; background-color:var(--primary-light); color:var(--primary); font-size:1.5rem; display:flex; align-items:center; justify-content:center;">🍽️</div>\`
                        }
                        <div class="cart-item-info">
                            <div class="cart-item-title">\${menuItem.nama}</div>
                            \${item.catatan ? \`<div class="cart-item-note">"\${item.catatan}"</div>\` : ''}
                            <div class="cart-item-price">\${formatRupiah(menuItem.harga * item.qty)}</div>
                        </div>
                        <div class="cart-qty-ctrl">
                            <button class="cart-qty-btn" onclick="updateCartItemQty('\${item.id}', -1)">−</button>
                            <span class="cart-qty-val">\${item.qty}</span>
                            <button class="cart-qty-btn" onclick="updateCartItemQty('\${item.id}', 1)">+</button>
                        </div>
                    </div>
                \`;
            }).join('');

            // Calculate Totals
            const subtotal = getCartTotalAmount();
            const taxPercent = state.settings.restoInfo.ppn || 0;
            const tax = Math.round(subtotal * (taxPercent / 100));
            const total = subtotal + tax;

            document.getElementById('cart-subtotal').textContent = formatRupiah(subtotal);
            document.getElementById('cart-tax-label').textContent = \`PPN \${taxPercent}%\`;
            document.getElementById('cart-tax').textContent = formatRupiah(tax);
            document.getElementById('cart-total').textContent = formatRupiah(total);
        }

        function updateCartItemQty(id, delta) {
            const index = state.cart.findIndex(i => i.id === id);
            if (index !== -1) {
                state.cart[index].qty += delta;
                if (state.cart[index].qty <= 0) {
                    state.cart.splice(index, 1);
                    showToast('Item dihapus');
                }
                saveCartState();
                renderCart();
            }
        }

        function saveCartNotes(notes) {
            localStorage.setItem('rn_catatan_pesanan', notes);
        }


        // ==================== CUSTOMER CHECKOUT CONTROLLER ====================
        function renderCheckout() {
            if (state.cart.length === 0) {
                window.location.hash = '#/';
                return;
            }

            // Restore name & table
            document.getElementById('checkout-nama').value = localStorage.getItem('customerName') || '';
            document.getElementById('checkout-meja').value = localStorage.getItem('tableNumber') || '';

            // Summary of items
            const sumEl = document.getElementById('checkout-items-summary');
            sumEl.innerHTML = state.cart.map(item => {
                const m = state.menu.find(x => x.id === item.id);
                if (!m) return '';
                return \`
                    <div style="display:flex; justify-content:space-between;">
                        <span>\${m.nama} (x\${item.qty})</span>
                        <span>\${formatRupiah(m.harga * item.qty)}</span>
                    </div>
                \`;
            }).join('');

            const subtotal = getCartTotalAmount();
            const taxPercent = state.settings.restoInfo.ppn || 0;
            const tax = Math.round(subtotal * (taxPercent / 100));
            const total = subtotal + tax;

            document.getElementById('checkout-subtotal').textContent = formatRupiah(subtotal);
            document.getElementById('checkout-tax-label').textContent = \`PPN (\${taxPercent}%)\`;
            document.getElementById('checkout-tax').textContent = formatRupiah(tax);
            document.getElementById('checkout-total').textContent = formatRupiah(total);

            // Set default payment
            selectPaymentMethod('tunai');
        }

        function selectPaymentMethod(method) {
            state.paymentMethod = method;
            
            // UI select state update
            document.querySelectorAll('.payment-box').forEach(el => el.classList.remove('selected'));
            const box = document.getElementById('payment-opt-' + method);
            if (box) {
                box.classList.add('selected');
                const radio = box.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
            }
        }

        function clearFormError(id) {
            document.getElementById(id).classList.remove('error');
            document.getElementById('err-' + id).classList.remove('show');
        }

        async function submitOrder() {
            const nameEl = document.getElementById('checkout-nama');
            const tableEl = document.getElementById('checkout-meja');
            const name = nameEl.value.trim();
            const table = tableEl.value.trim();

            let hasError = false;
            if (!name) {
                nameEl.classList.add('error');
                document.getElementById('err-checkout-nama').classList.add('show');
                hasError = true;
            }
            if (!table) {
                tableEl.classList.add('error');
                document.getElementById('err-checkout-meja').classList.add('show');
                hasError = true;
            }

            if (hasError) return;

            // Save identities
            localStorage.setItem('customerName', name);
            localStorage.setItem('tableNumber', table);

            const items = state.cart.map(item => {
                const m = state.menu.find(x => x.id === item.id);
                return {
                    menuId: item.id,
                    nama: m ? m.nama : 'Unknown',
                    harga: m ? m.harga : 0,
                    jumlah: item.qty,
                    catatan: item.catatan || ''
                };
            });

            const subtotal = getCartTotalAmount();
            const taxPercent = state.settings.restoInfo.ppn || 0;
            const tax = Math.round(subtotal * (taxPercent / 100));
            const total = subtotal + tax;
            const catatan = localStorage.getItem('rn_catatan_pesanan') || '';

            const orderPayload = {
                namaPelanggan: name,
                meja: table,
                items: items,
                subtotal: subtotal,
                ppn: tax,
                total: total,
                catatan: catatan,
                pembayaran: state.paymentMethod,
                pembayaranStatus: 'Menunggu' // Default
            };

            if (state.paymentMethod === 'qris') {
                // Show QRIS Modal instead of instant checkout
                openQRISModal(total, orderPayload);
            } else {
                // Bank transfer / Kasir
                await executeOrderSubmission(orderPayload);
            }
        }

        function openQRISModal(amount, payload) {
            document.getElementById('customer-qris-modal-amount').textContent = formatRupiah(amount);
            const container = document.getElementById('customer-qris-img-container');
            const qrisUrl = state.settings.qrisUrl;

            if (qrisUrl && qrisUrl.trim() !== '') {
                container.innerHTML = \`<img src="\${qrisUrl}" alt="QRIS" class="qris-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="qris-placeholder" style="display:none;">QRIS tidak valid</div>\`;
            } else {
                container.innerHTML = \`<div class="qris-placeholder">QRIS belum diset admin</div>\`;
            }

            document.getElementById('customer-qris-modal').classList.add('show');
            
            // Cache active order payload on modal
            window.activeOrderPayload = payload;
        }

        function closeQRISModal() {
            document.getElementById('customer-qris-modal').classList.remove('show');
            window.activeOrderPayload = null;
        }

        async function confirmQRISPayment() {
            if (window.activeOrderPayload) {
                const payload = { ...window.activeOrderPayload, pembayaranStatus: 'Lunas' }; // QRIS is automatically marked paid on confirmation (mock checkout)
                closeQRISModal();
                await executeOrderSubmission(payload);
            }
        }

        async function executeOrderSubmission(payload) {
            showToast('Mengirim pesanan...');
            const orderResult = await apiFetch('/api/orders', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (orderResult) {
                // Clear cart locally
                state.cart = [];
                saveCartState();
                localStorage.removeItem('rn_catatan_pesanan');
                showToast('Pesanan berhasil dibuat!');
                
                // Go to confirmation page
                window.location.hash = '#/status/' + encodeURIComponent(orderResult.id);
            }
        }


        // ==================== CUSTOMER STATUS CONTROLLER ====================
        async function renderStatus(orderId, cachedOrder = null) {
            const container = document.getElementById('status-view-content');
            let order = cachedOrder;

            if (!order) {
                // Fetch orders directly
                const orders = await apiFetch('/api/orders');
                if (orders) {
                    order = orders.find(o => o.id === orderId);
                    // Match alternative formats
                    if (!order && !orderId.startsWith('#')) order = orders.find(o => o.id === '#' + orderId);
                    if (!order && orderId.startsWith('#')) order = orders.find(o => o.id === orderId.substring(1));
                }
            }

            if (!order) {
                container.innerHTML = \`
                    <div style="text-align:center; padding: 4rem 1.5rem; color:var(--text-muted);">
                        <h3 style="color:var(--primary); font-family:'Cormorant Garamond'; font-size:1.3rem; margin-bottom:0.5rem;">Pesanan Tidak Ditemukan</h3>
                        <p style="font-size:0.85rem; margin-bottom:1.5rem;">Pesanan dengan nomor \${orderId} tidak terdaftar di database kami.</p>
                        <a href="#/" class="btn btn-primary">Kembali ke Beranda</a>
                    </div>\`;
                return;
            }

            const itemsHtml = order.items.map(item => \`
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding: 4px 0;">
                    <span>\${item.nama} x\${item.jumlah}</span>
                    <span>\${formatRupiah(item.harga * item.jumlah)}</span>
                </div>
            \`).join('');

            // Steps classes based on status
            // Baru -> Diproses -> Selesai
            let step1Class = 'done';
            let step2Class = '';
            let step3Class = '';
            let step2Desc = 'Menunggu koki dapur memproses pesanan';
            let step3Desc = 'Menunggu selesai disiapkan';

            if (order.status === 'Diproses') {
                step2Class = 'active';
                step2Desc = 'Pesanan Anda sedang dimasak di dapur';
            } else if (order.status === 'Selesai' || order.status === 'Siap') {
                step2Class = 'done';
                step3Class = 'done active';
                step2Desc = 'Pesanan selesai dimasak';
                step3Desc = 'Pesanan telah siap saji di meja Anda!';
            }

            const isLunas = order.pembayaranStatus === 'Lunas';
            const payBadge = isLunas ? 
                \`<span class="badge badge-selesai" style="font-size: 0.75rem;">Lunas</span>\` :
                \`<span class="badge badge-menunggu" style="font-size: 0.75rem;">Menunggu Pembayaran</span>\`;

            // Bank details for VA
            let vaBlock = '';
            if (order.pembayaran === 'va' && !isLunas) {
                const bankAccountsList = state.settings.bankAccounts.map(b => \`
                    <div style="background-color:#F8F9FA; padding:8px 12px; border-radius:6px; border:1px solid var(--border); font-size:0.8rem; margin-top:6px;">
                        <div><b>Bank \${b.bank}</b>: \${b.nomor}</div>
                        <div style="font-size:0.75rem; color:#666;">A/N: \${b.atasNama}</div>
                    </div>
                \`).join('');

                vaBlock = \`
                    <div style="margin-top: 10px; border-top:1px dashed var(--border); padding-top:10px;">
                        <span style="font-size:0.8rem; font-weight:600; color:var(--primary);">Nomor Virtual Account:</span>
                        <div style="background-color:var(--primary-light); color:var(--primary); font-size:1.1rem; font-weight:700; padding:6px 12px; text-align:center; border-radius:6px; margin: 6px 0; letter-spacing:0.05em;">
                            \${order.vaNumber || '888001'}
                        </div>
                        <p style="font-size:0.7rem; color:var(--text-muted); line-height:1.4;">Transfer tepat sesuai total tagihan ke rekening bank di bawah ini untuk diverifikasi otomatis:</p>
                        \${bankAccountsList}
                    </div>
                \`;
            }

            container.innerHTML = \`
                <div class="status-hero">
                    <div class="status-badge-lg">✓</div>
                    <h2 style="font-family:'Cormorant Garamond', serif; color:var(--primary); font-size:1.8rem; font-weight:600; margin-bottom:4px;">Pesanan Berhasil!</h2>
                    <p style="font-size:0.825rem; color:var(--text-muted);">Silakan catat nomor pesanan Anda untuk keperluan konfirmasi di kasir.</p>
                </div>

                <div class="status-timeline" id="order-timeline-block">
                    <div class="timeline-step \${step1Class}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-step-title">Pesanan Diterima</div>
                        <div class="timeline-step-desc">Diterima oleh sistem kami</div>
                    </div>
                    <div class="timeline-step \${step2Class} \${order.status === 'Selesai' ? 'done' : ''}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-step-title">Sedang Diproses</div>
                        <div class="timeline-step-desc">\${step2Desc}</div>
                    </div>
                    <div class="timeline-step \${step3Class}">
                        <div class="timeline-dot"></div>
                        <div class="timeline-step-title">Siap Saji</div>
                        <div class="timeline-step-desc">\${step3Desc}</div>
                    </div>
                </div>

                <div class="card-form" style="margin-bottom: 1.5rem;">
                    <p class="form-label" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 12px; color:var(--primary);">Detail Transaksi</p>
                    
                    <div class="summary-row"><span>No. Pesanan</span><span style="font-weight:600;">\${order.id}</span></div>
                    <div class="summary-row"><span>Nama Pelanggan</span><span>\${order.namaPelanggan}</span></div>
                    <div class="summary-row"><span>Nomor Meja</span><span>Meja \${order.meja}</span></div>
                    <div class="summary-row"><span>Waktu Pesan</span><span>\${formatWaktu(order.waktu)} · \${formatTanggal(order.waktu)}</span></div>
                    <div class="summary-row"><span>Metode Pembayaran</span><span style="text-transform:uppercase;">\${order.pembayaran === 'va' ? 'Virtual Account' : order.pembayaran}</span></div>
                    <div class="summary-row"><span>Status Pembayaran</span><span>\${payBadge}</span></div>
                    
                    \${vaBlock}

                    <div class="divider" style="margin:10px 0;"></div>
                    
                    <span style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">Daftar Pembelian:</span>
                    <div style="margin: 6px 0 10px;">
                        \${itemsHtml}
                    </div>

                    <div class="summary-row total" style="margin-bottom:0;">
                        <span>Total Tagihan</span>
                        <span>\${formatRupiah(order.total)}</span>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; margin-top:1rem;">
                    <a href="#/" class="btn btn-primary">Pesan Hidangan Lain</a>
                    <button class="btn btn-secondary" onclick="showToast('Struk berhasil diunduh')">Unduh Struk PDF</button>
                </div>
            \`;
        }


        // ==================== ADMIN SYSTEM CONTROLLER ====================
        function loginAdmin() {
            const password = document.getElementById('admin-password-input').value;
            const errEl = document.getElementById('admin-login-error');

            if (password.toLowerCase() === 'admin') {
                sessionStorage.setItem('adminLoggedIn', 'true');
                state.adminLoggedIn = true;
                errEl.classList.remove('show');
                
                // Fetch dynamic admin orders & configurations
                refreshData().then(() => {
                    window.location.hash = '#/admin/dashboard';
                });
            } else {
                errEl.classList.add('show');
            }
        }

        function logoutAdmin() {
            sessionStorage.removeItem('adminLoggedIn');
            state.adminLoggedIn = false;
            window.location.hash = '#/';
        }

        function toggleAdminSidebar() {
            const sidebar = document.getElementById('admin-sidebar');
            const overlay = document.getElementById('admin-mobile-overlay');
            sidebar.classList.toggle('open');
            if (sidebar.classList.contains('open')) {
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        }

        function closeAdminSidebarOnMobile() {
            document.getElementById('admin-sidebar').classList.remove('open');
            document.getElementById('admin-mobile-overlay').style.display = 'none';
        }


        // ==================== ADMIN DASHBOARD ====================
        function renderAdminDashboard() {
            // Stats Calculations
            const today = new Date().toDateString();
            const todayOrders = state.orders.filter(o => new Date(o.waktu).toDateString() === today);
            
            const activeOrders = state.orders.filter(o => o.status === 'Baru' || o.status === 'Diproses').length;
            const completedToday = todayOrders.filter(o => o.status === 'Selesai' || o.status === 'Siap').length;
            const totalRevenueToday = todayOrders.filter(o => o.pembayaranStatus === 'Lunas').reduce((sum, o) => sum + o.total, 0);

            document.getElementById('dashboard-date').textContent = new Date().toLocaleDateString('id-ID', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });

            const grid = document.getElementById('dashboard-stats-grid');
            grid.innerHTML = \`
                <div class="stat-card">
                    <div class="stat-icon green">🥘</div>
                    <div class="stat-info">
                        <div class="stat-label">Pesanan Aktif</div>
                        <div class="stat-value">\${activeOrders}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon teal">✓</div>
                    <div class="stat-info">
                        <div class="stat-label">Selesai Hari Ini</div>
                        <div class="stat-value">\${completedToday}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon slate">💰</div>
                    <div class="stat-info">
                        <div class="stat-label">Pendapatan Hari Ini</div>
                        <div class="stat-value" style="color:var(--primary);">\${formatRupiah(totalRevenueToday)}</div>
                    </div>
                </div>
            \`;

            // Recent Orders List (Max 8)
            const listEl = document.getElementById('dashboard-recent-orders-list');
            const recent = state.orders.slice(0, 8);

            if (recent.length === 0) {
                listEl.innerHTML = \`<tr><td colspan="7" style="text-align:center; color:#999; padding: 2rem;">Belum ada pesanan masuk hari ini.</td></tr>\`;
                return;
            }

            listEl.innerHTML = recent.map(o => \`
                <tr>
                    <td style="font-weight:600; color:var(--primary);">\${o.id}</td>
                    <td>Meja \${o.meja}</td>
                    <td>\${o.namaPelanggan}</td>
                    <td style="color:#666;">\${timeAgo(o.waktu)}</td>
                    <td><span class="badge badge-\${o.status.toLowerCase()}">\${o.status}</span></td>
                    <td style="text-transform:uppercase; font-size:0.75rem;">\${o.pembayaran}</td>
                    <td style="font-weight:700;">\${formatRupiah(o.total)}</td>
                </tr>
            \`).join('');
        }


        // ==================== ADMIN KITCHEN QUEUE ====================
        function renderAdminDapur() {
            document.getElementById('dapur-last-updated').textContent = 'Terakhir update: ' + new Date().toLocaleTimeString('id-ID');

            const baruContainer = document.getElementById('kanban-baru');
            const diprosesContainer = document.getElementById('kanban-diproses');
            const selesaiContainer = document.getElementById('kanban-selesai');

            const baru = state.orders.filter(o => o.status === 'Baru');
            const diproses = state.orders.filter(o => o.status === 'Diproses');
            const selesai = state.orders.filter(o => o.status === 'Selesai' || o.status === 'Siap');

            renderKanbanColumn(baruContainer, baru, 'Baru');
            renderKanbanColumn(diprosesContainer, diproses, 'Diproses');
            renderKanbanColumn(selesaiContainer, selesai, 'Selesai');
        }

        function renderKanbanColumn(container, list, columnType) {
            if (list.length === 0) {
                container.innerHTML = \`<div style="text-align:center; padding:2rem; color:#999; font-size:0.8rem;">Antrian Kosong</div>\`;
                return;
            }

            container.innerHTML = list.map(order => {
                const itemsHtml = order.items.map(i => \`
                    <li>\${i.nama} <span>x\${i.jumlah}</span> \${i.catatan ? \`<div style="font-size:0.7rem; color:#e65100; font-style:italic;">* \${i.catatan}</div>\` : ''}</li>
                \`).join('');

                let buttonHtml = '';
                if (columnType === 'Baru') {
                    buttonHtml = \`<button class="btn btn-primary" style="padding: 6px 12px; font-size:0.75rem; width:100%;" onclick="updateOrderStatus('\${order.id}', 'Diproses')">Proses Memasak ➡️</button>\`;
                } else if (columnType === 'Diproses') {
                    buttonHtml = \`<button class="btn btn-primary" style="padding: 6px 12px; font-size:0.75rem; width:100%; background-color:var(--success);" onclick="updateOrderStatus('\${order.id}', 'Selesai')">✓ Siap Saji</button>\`;
                } else {
                    buttonHtml = \`<button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.75rem; width:100%;" disabled>✓ Selesai</button>\`;
                }

                return \`
                    <div class="kanban-card \${columnType.toLowerCase()}">
                        <div class="kanban-card-title" style="color:var(--primary);">\${order.id}</div>
                        <div class="kanban-card-meta">Meja \${order.meja} · <b>\${order.namaPelanggan}</b></div>
                        <ul class="kanban-card-items">
                            \${itemsHtml}
                        </ul>
                        \${order.catatan ? \`<div class="kanban-card-notes">"\${order.catatan}"</div>\` : ''}
                        
                        <div style="margin-top:4px;">
                            \${buttonHtml}
                        </div>
                        <div class="kanban-time-badge">\${timeAgo(order.waktu)}</div>
                    </div>
                \`;
            }).join('');
        }

        async function updateOrderStatus(orderId, nextStatus) {
            const res = await apiFetch('/api/orders/update-status', {
                method: 'POST',
                body: JSON.stringify({ id: orderId, status: nextStatus })
            });
            if (res) {
                showToast(\`Pesanan \${orderId} diperbarui ke \${nextStatus}\`);
                await pollAdminData();
            }
        }


        // ==================== ADMIN PAYMENTS VERIFICATION ====================
        function setPaymentFilter(filter) {
            state.paymentFilter = filter;
            document.getElementById('pay-filter-waiting').classList.toggle('active', filter === 'Menunggu');
            document.getElementById('pay-filter-done').classList.toggle('active', filter === 'Lunas');
            renderAdminPembayaran();
        }

        function renderAdminPembayaran() {
            const container = document.getElementById('admin-payment-grid');
            const filteredOrders = state.orders.filter(o => o.pembayaranStatus === state.paymentFilter);

            if (filteredOrders.length === 0) {
                container.innerHTML = \`<div style="grid-column:1/-1; text-align:center; padding:4rem; color:#999; font-size:0.875rem;">Tidak ada transaksi dengan filter ini.</div>\`;
                return;
            }

            container.innerHTML = filteredOrders.map(order => {
                const itemsList = order.items.map(i => \`
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#444;">
                        <span>\${i.nama} x\${i.jumlah}</span>
                        <span>\${formatRupiah(i.harga * i.jumlah)}</span>
                    </div>
                \`).join('');

                let actionBlock = '';
                if (order.pembayaranStatus === 'Menunggu') {
                    actionBlock = \`<button class="btn btn-primary" style="width:100%; margin-top:12px;" onclick="openPaymentConfirmModal('\${order.id}', \${order.total})">Verifikasi Lunas</button>\`;
                } else {
                    actionBlock = \`<button class="btn btn-secondary" style="width:100%; margin-top:12px; font-size:0.8rem;" onclick="viewReceipt('\${order.id}')">🖨 Lihat & Cetak Struk</button>\`;
                }

                return \`
                    <div class="payment-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-weight:600; color:var(--primary); font-size:1.1rem;">\${order.id}</span>
                            <span class="badge badge-\${order.pembayaranStatus.toLowerCase()}">\${order.pembayaranStatus}</span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">
                            Meja \${order.meja} · \${order.namaPelanggan} · \${timeAgo(order.waktu)}
                        </div>
                        
                        <div style="background-color:#F8F9FA; padding:10px; border-radius:6px; margin-bottom:10px;">
                            \${itemsList}
                            <div class="divider" style="margin:8px 0;"></div>
                            <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.9rem; color:var(--primary);">
                                <span>Total Tagihan</span>
                                <span>\${formatRupiah(order.total)}</span>
                            </div>
                        </div>

                        <div style="font-size:0.75rem; color:#666;">Metode Bayar: <span style="text-transform:uppercase; font-weight:600;">\${order.pembayaran}</span></div>

                        \${actionBlock}
                    </div>
                \`;
            }).join('');
        }

        // Cash Confirm overlay modal
        let pendingConfirmOrderId = '';
        function openPaymentConfirmModal(orderId, total) {
            pendingConfirmOrderId = orderId;
            document.getElementById('pay-confirm-order-id').textContent = orderId;
            document.getElementById('pay-confirm-amount').textContent = formatRupiah(total);
            document.getElementById('admin-pay-confirm-modal').classList.add('show');
        }

        function closePaymentConfirmModal() {
            document.getElementById('admin-pay-confirm-modal').classList.remove('show');
            pendingConfirmOrderId = '';
        }

        async function executePaymentConfirm() {
            if (pendingConfirmOrderId) {
                const res = await apiFetch('/api/orders/update-pembayaran', {
                    method: 'POST',
                    body: JSON.stringify({ id: pendingConfirmOrderId, pembayaranStatus: 'Lunas' })
                });
                if (res) {
                    showToast(\`Pesanan \${pendingConfirmOrderId} telah lunas\`);
                    closePaymentConfirmModal();
                    await pollAdminData();
                    // Auto view receipt on verification success
                    viewReceipt(res.id);
                }
            }
        }


        // ==================== RECEIPT VIEWING (STRUK PRINT) ====================
        function viewReceipt(orderId) {
            const order = state.orders.find(o => o.id === orderId);
            if (!order) return;

            const modalContent = document.getElementById('receipt-modal-content');
            const info = state.settings.restoInfo;

            const itemsHtml = order.items.map(item => \`
                <div class="receipt-row">
                    <span>\${item.nama}</span>
                    <span>\${item.jumlah} x \${formatRupiah(item.harga)}</span>
                </div>
                <div class="receipt-row" style="margin-bottom: 4px; color:#555;">
                    <span></span>
                    <span>\${formatRupiah(item.harga * item.jumlah)}</span>
                </div>
            \`).join('');

            modalContent.innerHTML = \`
                <div class="receipt-container">
                    <div class="receipt-header">
                        <h3>\${info.nama || 'Resto Nusantara'}</h3>
                        <p style="font-size:0.75rem; margin-top:2px;">\${info.alamat || ''}</p>
                        <p style="font-size:0.75rem;">Tel: \${info.telepon || ''}</p>
                        <p style="font-size:0.7rem; color:#666; margin-top:6px;">
                            \${new Date(order.waktuBayar || order.waktu).toLocaleString('id-ID')}
                        </p>
                    </div>

                    <div style="margin-bottom: 10px; font-size:0.8rem;">
                        <div>No Pesanan: \${order.id}</div>
                        <div>Nomor Meja: \${order.meja}</div>
                        <div>Pelanggan : \${order.namaPelanggan}</div>
                    </div>

                    <div style="border-top: 1px dashed #ccc; padding-top: 8px;">
                        \${itemsHtml}
                    </div>

                    <div class="receipt-row total">
                        <span>Subtotal</span>
                        <span>\${formatRupiah(order.subtotal)}</span>
                    </div>
                    <div class="receipt-row">
                        <span>PPN (\${info.ppn || 11}%)</span>
                        <span>\${formatRupiah(order.ppn)}</span>
                    </div>
                    <div class="receipt-row" style="font-weight:bold; font-size:0.95rem; border-top:1px dashed #ccc; margin-top:4px; padding-top:4px;">
                        <span>TOTAL</span>
                        <span>\${formatRupiah(order.total)}</span>
                    </div>

                    <div style="border-top:1px dashed #ccc; margin-top:16px; padding-top:12px; text-align:center; font-size:0.72rem; color:#666;">
                        Terima kasih telah berkunjung!<br>
                        Selamat menikmati hidangan kami
                    </div>
                </div>
            \`;

            document.getElementById('admin-receipt-modal').classList.add('show');
        }

        function closeReceiptModal() {
            document.getElementById('admin-receipt-modal').classList.remove('show');
        }


        // ==================== ADMIN MENU MANAGEMENT ====================
        function renderAdminMenu() {
            const grid = document.getElementById('admin-menu-grid');
            
            if (state.menu.length === 0) {
                grid.innerHTML = \`<div style="grid-column:1/-1; text-align:center; padding:4rem; color:#999; font-size:0.875rem;">Menu kosong. Tambahkan menu baru.</div>\`;
                return;
            }

            grid.innerHTML = state.menu.map(m => \`
                <div class="admin-menu-card">
                    \${m.gambar ? 
                        \`<img src="\${m.gambar}" alt="\${m.nama}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="admin-menu-placeholder" style="display:none;">🍽️</div>\` :
                        \`<div class="admin-menu-placeholder">🍽️</div>\`
                    }
                    <div class="admin-menu-card-body">
                        <div>
                            <div class="admin-menu-name">\${m.nama}</div>
                            <span class="admin-menu-category">\${m.kategori}</span>
                            <div class="admin-menu-price">\${formatRupiah(m.harga)}</div>
                            <p class="admin-menu-desc">\${m.deskripsi || '-'}</p>
                        </div>
                        <div class="admin-menu-footer">
                            <span class="menu-status-badge \${m.tersedia ? 'tersedia' : 'habis'}">
                                \${m.tersedia ? '✓ Tersedia' : '✗ Habis'}
                            </span>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-secondary" style="padding: 4px 8px; font-size:0.72rem;" onclick="openMenuFormModal('\${m.id}')">Edit</button>
                                <button class="btn \${m.tersedia ? 'btn-danger' : 'btn-primary'}" style="padding: 4px 8px; font-size:0.72rem; background-color:\${m.tersedia ? '' : 'var(--success)'}; color:\${m.tersedia ? '' : '#fff'}" onclick="toggleMenuStatus('\${m.id}')">
                                    \${m.tersedia ? 'Set Habis' : 'Set Aktif'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            \`).join('');
        }

        async function toggleMenuStatus(id) {
            const res = await apiFetch('/api/menu/toggle-status', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (res) {
                showToast(\`Status menu \${res.nama} diperbarui\`);
                await refreshData();
                renderAdminMenu();
            }
        }

        function openMenuFormModal(id = null) {
            const form = document.getElementById('admin-menu-form');
            form.reset();
            state.menuImageBase64 = '';

            const preview = document.getElementById('admin-menu-form-preview');
            const title = document.getElementById('menu-modal-title');
            
            if (id) {
                // Edit
                title.textContent = 'Edit Menu Hidangan';
                const m = state.menu.find(x => x.id === id);
                if (m) {
                    document.getElementById('form-menu-id').value = m.id;
                    document.getElementById('form-menu-nama').value = m.nama;
                    document.getElementById('form-menu-kategori').value = m.kategori;
                    document.getElementById('form-menu-harga').value = m.harga;
                    document.getElementById('form-menu-deskripsi').value = m.deskripsi || '';
                    
                    state.menuImageBase64 = m.gambar || '';
                    if (m.gambar) {
                        preview.innerHTML = \`<img src="\${m.gambar}" style="width:100%; height:100%; object-fit:cover;">\`;
                    } else {
                        preview.innerHTML = \`<span style="color:#999; font-size:0.8rem;">📷 Preview Foto Menu</span>\`;
                    }
                }
            } else {
                // New
                title.textContent = 'Tambah Menu Baru';
                document.getElementById('form-menu-id').value = '';
                preview.innerHTML = \`<span style="color:#999; font-size:0.8rem;">📷 Preview Foto Menu</span>\`;
            }

            document.getElementById('admin-menu-modal').classList.add('show');
        }

        function closeMenuFormModal() {
            document.getElementById('admin-menu-modal').classList.remove('show');
        }

        function previewMenuImageFile() {
            const file = document.getElementById('form-menu-file').files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                state.menuImageBase64 = e.target.result;
                document.getElementById('admin-menu-form-preview').innerHTML = \`<img src="\${state.menuImageBase64}" style="width:100%; height:100%; object-fit:cover;">\`;
            };
            reader.readAsDataURL(file);
        }

        async function submitMenuForm(e) {
            e.preventDefault();
            const id = document.getElementById('form-menu-id').value;
            const nama = document.getElementById('form-menu-nama').value.trim();
            const kategori = document.getElementById('form-menu-kategori').value;
            const harga = parseInt(document.getElementById('form-menu-harga').value);
            const deskripsi = document.getElementById('form-menu-deskripsi').value.trim();

            const payload = {
                nama,
                kategori,
                harga,
                deskripsi,
                gambar: state.menuImageBase64
            };

            if (id) payload.id = id;

            const res = await apiFetch('/api/menu', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res) {
                showToast(id ? 'Menu berhasil diperbarui' : 'Menu baru berhasil ditambahkan');
                closeMenuFormModal();
                await refreshData();
                renderAdminMenu();
            }
        }


        // ==================== ADMIN SETTINGS ====================
        function renderAdminSettings() {
            const info = state.settings.restoInfo || {};
            document.getElementById('set-resto-nama').value = info.nama || '';
            document.getElementById('set-resto-alamat').value = info.alamat || '';
            document.getElementById('set-resto-telepon').value = info.telepon || '';
            document.getElementById('set-resto-ppn').value = info.ppn !== undefined ? info.ppn : 11;
            document.getElementById('set-resto-va').value = state.settings.vaNumber || '888001';

            // QRIS URL
            document.getElementById('set-qris-url').value = state.settings.qrisUrl || '';
            state.qrisImageBase64 = state.settings.qrisUrl || '';
            
            const qrisPreview = document.getElementById('qris-preview-settings');
            if (state.settings.qrisUrl) {
                qrisPreview.innerHTML = \`<img src="\${state.settings.qrisUrl}" style="width:100%; height:100%; object-fit:contain;">\`;
            } else {
                qrisPreview.innerHTML = \`<span style="color:#999; font-size:0.75rem;">Preview QRIS</span>\`;
            }

            // Bank Accounts
            const container = document.getElementById('bank-accounts-settings-container');
            const banks = state.settings.bankAccounts || [];
            
            container.innerHTML = '';
            banks.forEach((b, index) => {
                addBankAccountRow(b.bank, b.nomor, b.atasNama);
            });
            if (banks.length === 0) {
                // Add one empty row
                addBankAccountRow('', '', '');
            }
        }

        function addBankAccountRow(bank = '', nomor = '', atasNama = '') {
            const container = document.getElementById('bank-accounts-settings-container');
            const row = document.createElement('div');
            row.className = 'form-row bank-account-row';
            row.style.marginBottom = '10px';
            row.style.alignItems = 'end';
            row.innerHTML = \`
                <div class="form-group-admin" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.75rem;">Nama Bank</label>
                    <input type="text" class="form-control-admin bank-name-input" value="\${bank}" placeholder="BCA / Mandiri">
                </div>
                <div class="form-group-admin" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.75rem;">Nomor Rekening</label>
                    <input type="text" class="form-control-admin bank-num-input" value="\text{\${nomor}}" placeholder="12345678">
                </div>
                <div class="form-group-admin" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.75rem;">Atas Nama</label>
                    <input type="text" class="form-control-admin bank-owner-input" value="\${atasNama}" placeholder="Resto Nusantara">
                </div>
                <button class="btn btn-danger" style="padding: 10px; font-size: 0.8rem; height: 38px;" onclick="this.parentElement.remove()">Hapus</button>
            \`;
            container.appendChild(row);
        }

        function uploadQRISFile() {
            const file = document.getElementById('set-qris-file').files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                state.qrisImageBase64 = e.target.result;
                document.getElementById('set-qris-url').value = 'Base64 Uploaded';
                document.getElementById('qris-preview-settings').innerHTML = \`<img src="\${state.qrisImageBase64}" style="width:100%; height:100%; object-fit:contain;">\`;
            };
            reader.readAsDataURL(file);
        }

        async function saveAllSettings() {
            const restoInfo = {
                nama: document.getElementById('set-resto-nama').value.trim() || 'Resto Nusantara',
                alamat: document.getElementById('set-resto-alamat').value.trim(),
                telepon: document.getElementById('set-resto-telepon').value.trim(),
                ppn: parseInt(document.getElementById('set-resto-ppn').value) || 0
            };
            const vaNumber = document.getElementById('set-resto-va').value.trim() || '888001';

            // QRIS URL
            let qrisUrl = document.getElementById('set-qris-url').value.trim();
            if (qrisUrl === 'Base64 Uploaded') {
                qrisUrl = state.qrisImageBase64;
            }

            // Gather Bank Accounts
            const bankAccounts = [];
            document.querySelectorAll('.bank-account-row').forEach(row => {
                const bank = row.querySelector('.bank-name-input').value.trim();
                const nomor = row.querySelector('.bank-num-input').value.trim();
                const atasNama = row.querySelector('.bank-owner-input').value.trim();
                
                if (bank && nomor) {
                    bankAccounts.push({ bank, nomor, atasNama });
                }
            });

            const payload = {
                restoInfo,
                vaNumber,
                qrisUrl,
                bankAccounts
            };

            const res = await apiFetch('/api/settings', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res) {
                showToast('Pengaturan berhasil disimpan');
                await refreshData();
            }
        }


        // ==================== STATE CLIENT HELPERS ====================
        function getCartCount() {
            return state.cart.reduce((sum, item) => sum + item.qty, 0);
        }

        function getCartTotalAmount() {
            return state.cart.reduce((sum, item) => {
                const m = state.menu.find(x => x.id === item.id);
                return sum + (m ? m.harga * item.qty : 0);
            }, 0);
        }

        function addCartItem(id, qty, catatan) {
            const index = state.cart.findIndex(i => i.id === id);
            if (index !== -1) {
                state.cart[index].qty += qty;
                state.cart[index].catatan = catatan || state.cart[index].catatan;
            } else {
                state.cart.push({ id, qty, catatan });
            }
            saveCartState();
        }

        function saveCartState() {
            localStorage.setItem('rn_cart', JSON.stringify(state.cart));
            updateCartHeaderBadge();
        }

        function updateCartHeaderBadge() {
            const count = getCartCount();
            document.getElementById('header-cart-badge').textContent = count;
        }


        // ==================== COMMON GENERAL FORMATTERS ====================
        function formatRupiah(angka) {
            return 'Rp ' + Number(angka).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
        }

        function formatWaktu(isoString) {
            if (!isoString) return '-';
            const date = new Date(isoString);
            return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        }

        function formatTanggal(isoString) {
            if (!isoString) return '-';
            const date = new Date(isoString);
            return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        function timeAgo(isoString) {
            if (!isoString) return '-';
            const date = new Date(isoString);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000 / 60); // minutes
            if (diff < 1) return 'Baru saja';
            if (diff < 60) return diff + ' menit lalu';
            const hours = Math.floor(diff / 60);
            if (hours < 24) return hours + ' jam lalu';
            return Math.floor(hours / 24) + ' hari lalu';
        }

        function showToast(msg) {
            const el = document.getElementById('toast-notify');
            el.textContent = msg;
            el.classList.add('show');
            setTimeout(() => {
                el.classList.remove('show');
            }, 2500);
        }

        // Boot
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` RESTO NUSANTARA - APLIKASI TERCETAK DALAM SATU FILE`);
    console.log(` Server berjalan di http://localhost:${PORT}`);
    console.log(` Database tersimpan di: ${DB_PATH}`);
    console.log(`==================================================`);
});
