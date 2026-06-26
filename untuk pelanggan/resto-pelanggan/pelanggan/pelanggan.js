/* RESTO NUSANTARA PELANGGAN - Shared JS */
document.addEventListener('DOMContentLoaded', function() {
    const cartBadge = document.getElementById('cart-count');
    if (cartBadge) cartBadge.textContent = Store.getCartCount();
});