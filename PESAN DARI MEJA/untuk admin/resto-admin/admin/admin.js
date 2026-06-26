/* RESTO NUSANTARA ADMIN - Shared JS */
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.admin-nav a').forEach(link => {
        if (link.getAttribute('href') === currentPage) link.classList.add('active');
        else link.classList.remove('active');
    });
});