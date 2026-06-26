/**
 * RESTO NUSANTARA - SHARED STORE
 * Sama persis di admin dan pelanggan
 */

const STORE_KEYS = {
    MENU: 'rn_menu',
    ORDERS: 'rn_orders',
    CART: 'rn_cart',
    TABLE_NUMBER: 'rn_table_number',
    CUSTOMER_NAME: 'rn_customer_name',
    ORDER_COUNTER: 'rn_order_counter',
    RESTO_INFO: 'rn_resto_info',
    BANK_ACCOUNTS: 'rn_bank_accounts',
    VA_NUMBER: 'rn_va_number',
    QRIS_URL: 'rn_qris_url'
};

// ==================== INITIAL DATA ====================
const INITIAL_MENU = [
    {
        id: 'menu-001',
        nama: 'Mie Ayam Spesial',
        kategori: 'Makanan',
        harga: 28000,
        deskripsi: 'Mie lembut dengan topping ayam cincang, bakso, dan pangsit goreng.',
        gambar: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-002',
        nama: 'Ayam Bakar',
        kategori: 'Makanan',
        harga: 45000,
        deskripsi: 'Ayam bakar bumbu rempah khas Nusantara.',
        gambar: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-003',
        nama: 'Es Teh Manis',
        kategori: 'Minuman',
        harga: 8000,
        deskripsi: 'Teh pilihan dengan gula asli, disajikan dingin.',
        gambar: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-004',
        nama: 'Nasi Goreng Spesial',
        kategori: 'Makanan',
        harga: 35000,
        deskripsi: 'Nasi goreng dengan telur mata sapi, ayam suwir, dan acar.',
        gambar: 'https://images.unsplash.com/photo-1603133872878-684f208fb74b?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-005',
        nama: 'Sate Ayam',
        kategori: 'Makanan',
        harga: 32000,
        deskripsi: 'Sate ayam 10 tusuk dengan bumbu kacang dan lontong.',
        gambar: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-006',
        nama: 'Jus Jeruk',
        kategori: 'Minuman',
        harga: 12000,
        deskripsi: 'Jus jeruk segar tanpa gula tambahan.',
        gambar: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&h=400&fit=crop',
        tersedia: true
    },
    {
        id: 'menu-007',
        nama: 'Puding Coklat',
        kategori: 'Dessert',
        harga: 15000,
        deskripsi: 'Puding coklat lembut dengan vla vanila.',
        gambar: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&h=400&fit=crop',
        tersedia: true
    }
];

const INITIAL_RESTO_INFO = {
    nama: 'Resto Nusantara',
    alamat: 'Jl. Sejahtera No. 10, Jakarta',
    telepon: '(021) 1234 5678',
    ppn: 11
};

const INITIAL_BANK_ACCOUNTS = [
    { bank: 'BCA', nomor: '1234567890', atasNama: 'Resto Nusantara' },
    { bank: 'Mandiri', nomor: '9876543210', atasNama: 'Resto Nusantara' },
    { bank: 'BNI', nomor: '4567890123', atasNama: 'Resto Nusantara' }
];

// ==================== BROADCAST CHANNEL ====================
let broadcastChannel = null;
try {
    broadcastChannel = new BroadcastChannel('resto_nusantara_sync');
} catch (e) {
    console.log('BroadcastChannel not supported');
}

function broadcast(type, data) {
    if (broadcastChannel) {
        broadcastChannel.postMessage({ type, data, timestamp: Date.now() });
    }
    // Trigger untuk tab lain via localStorage
    localStorage.setItem('rn_sync_trigger', Date.now().toString());
}

// ==================== STORE FUNCTIONS ====================

const Store = {
    init() {
        // Cek apakah data sudah ada (jangan timpa!)
        if (!localStorage.getItem(STORE_KEYS.MENU)) {
            localStorage.setItem(STORE_KEYS.MENU, JSON.stringify(INITIAL_MENU));
        }
        if (!localStorage.getItem(STORE_KEYS.ORDERS)) {
            localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORE_KEYS.CART)) {
            localStorage.setItem(STORE_KEYS.CART, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORE_KEYS.ORDER_COUNTER)) {
            localStorage.setItem(STORE_KEYS.ORDER_COUNTER, '0');
        }
        if (!localStorage.getItem(STORE_KEYS.RESTO_INFO)) {
            localStorage.setItem(STORE_KEYS.RESTO_INFO, JSON.stringify(INITIAL_RESTO_INFO));
        }
        if (!localStorage.getItem(STORE_KEYS.BANK_ACCOUNTS)) {
            localStorage.setItem(STORE_KEYS.BANK_ACCOUNTS, JSON.stringify(INITIAL_BANK_ACCOUNTS));
        }
        if (!localStorage.getItem(STORE_KEYS.VA_NUMBER)) {
            localStorage.setItem(STORE_KEYS.VA_NUMBER, '888001');
        }
    },

    reset() {
        Object.values(STORE_KEYS).forEach(key => localStorage.removeItem(key));
        this.init();
    },

    // ==================== MENU ====================
    getMenu() { return JSON.parse(localStorage.getItem(STORE_KEYS.MENU)) || []; },
    getMenuById(id) { return this.getMenu().find(item => item.id === id); },
    getMenuByKategori(kategori) {
        if (kategori === 'Semua') return this.getMenu();
        return this.getMenu().filter(item => item.kategori === kategori);
    },

    // ==================== CART ====================
    getCart() { return JSON.parse(localStorage.getItem(STORE_KEYS.CART)) || []; },
    addToCart(menuId, jumlah = 1, catatan = '') {
        const cart = this.getCart();
        const existing = cart.find(item => item.menuId === menuId);
        if (existing) { existing.jumlah += jumlah; existing.catatan = catatan || existing.catatan; }
        else { cart.push({ menuId, jumlah, catatan }); }
        localStorage.setItem(STORE_KEYS.CART, JSON.stringify(cart));
    },
    updateCartItem(menuId, jumlah, catatan) {
        const cart = this.getCart();
        const item = cart.find(c => c.menuId === menuId);
        if (item) {
            item.jumlah = jumlah;
            if (catatan !== undefined) item.catatan = catatan;
            localStorage.setItem(STORE_KEYS.CART, JSON.stringify(cart));
        }
    },
    removeFromCart(menuId) {
        const cart = this.getCart().filter(item => item.menuId !== menuId);
        localStorage.setItem(STORE_KEYS.CART, JSON.stringify(cart));
    },
    clearCart() { localStorage.setItem(STORE_KEYS.CART, JSON.stringify([])); },
    getCartCount() { return this.getCart().reduce((sum, item) => sum + item.jumlah, 0); },
    getCartTotal() {
        const menu = this.getMenu();
        return this.getCart().reduce((sum, item) => {
            const menuItem = menu.find(m => m.id === item.menuId);
            return sum + (menuItem ? menuItem.harga * item.jumlah : 0);
        }, 0);
    },

    // ==================== ORDERS ====================
    getOrders() { return JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS)) || []; },
    getOrderById(id) { return this.getOrders().find(order => order.id === id); },
    getNextOrderNumber() {
        const counter = parseInt(localStorage.getItem(STORE_KEYS.ORDER_COUNTER) || '0') + 1;
        localStorage.setItem(STORE_KEYS.ORDER_COUNTER, counter.toString());
        return String(counter).padStart(4, '0');
    },
    createOrder(orderData) {
        const orders = this.getOrders();
        const vaNumber = this.getVANumber();
        const order = {
            id: '#' + this.getNextOrderNumber(),
            ...orderData,
            status: 'Baru',
            pembayaranStatus: 'Menunggu',
            vaNumber: vaNumber + orders.length,
            waktu: new Date().toISOString(),
            selesaiWaktu: null
        };
        orders.unshift(order);
        localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));
        broadcast('NEW_ORDER', order);
        return order;
    },
    updateOrderStatus(id, status) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === id);
        if (order) {
            order.status = status;
            if (status === 'Selesai') order.selesaiWaktu = new Date().toISOString();
            localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));
            broadcast('ORDER_STATUS_CHANGED', { id, status });
        }
    },
    updateOrderPembayaran(id, status) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === id);
        if (order) {
            order.pembayaranStatus = status;
            if (status === 'Lunas') order.status = 'Selesai';
            localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));
            broadcast('ORDER_PAYMENT_CHANGED', { id, pembayaranStatus: status });
        }
    },

    // ==================== TABLE & CUSTOMER ====================
    setTableNumber(number) { localStorage.setItem(STORE_KEYS.TABLE_NUMBER, number); },
    getTableNumber() { return localStorage.getItem(STORE_KEYS.TABLE_NUMBER) || ''; },
    setCustomerName(name) { localStorage.setItem(STORE_KEYS.CUSTOMER_NAME, name); },
    getCustomerName() { return localStorage.getItem(STORE_KEYS.CUSTOMER_NAME) || ''; },

    // ==================== RESTO INFO ====================
    getRestoInfo() { return JSON.parse(localStorage.getItem(STORE_KEYS.RESTO_INFO)) || INITIAL_RESTO_INFO; },

    // ==================== BANK ACCOUNTS ====================
    getBankAccounts() { return JSON.parse(localStorage.getItem(STORE_KEYS.BANK_ACCOUNTS)) || INITIAL_BANK_ACCOUNTS; },
    getVANumber() { return localStorage.getItem(STORE_KEYS.VA_NUMBER) || '888001'; },
    getQRISUrl() { return localStorage.getItem(STORE_KEYS.QRIS_URL) || ''; },
    setQRISUrl(url) { localStorage.setItem(STORE_KEYS.QRIS_URL, url); },

    // ==================== STATS (untuk admin) ====================
    getStats() {
        const orders = this.getOrders();
        const today = new Date().toDateString();
        const todayOrders = orders.filter(o => new Date(o.waktu).toDateString() === today);
        return {
            totalPesanan: orders.length,
            pesananHariIni: todayOrders.length,
            selesaiHariIni: todayOrders.filter(o => o.status === 'Selesai').length,
            totalPenjualan: todayOrders.filter(o => o.status === 'Selesai').reduce((sum, o) => sum + (o.total || 0), 0)
        };
    },

    // ==================== SYNC LISTENER (untuk admin) ====================
    onSync(callback) {
        window.addEventListener('storage', (e) => {
            if (e.key === 'rn_sync_trigger' || e.key === STORE_KEYS.ORDERS || e.key === STORE_KEYS.MENU) {
                callback();
            }
        });
        if (broadcastChannel) {
            broadcastChannel.onmessage = (event) => {
                callback();
            };
        }
    }
};

// Format currency
function formatRupiah(angka) {
    return 'Rp ' + angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Format time
function formatWaktu(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatTanggal(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 1) return 'Baru saja';
    if (diff < 60) return diff + ' menit lalu';
    const hours = Math.floor(diff / 60);
    if (hours < 24) return hours + ' jam lalu';
    return Math.floor(hours / 24) + ' hari lalu';
}

// Initialize
Store.init();