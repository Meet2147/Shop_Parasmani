// Small progressive enhancements; every page still works without JavaScript.
document.addEventListener('DOMContentLoaded', () => {
  // Product gallery thumbnails
  const main = document.getElementById('mainImg');
  document.querySelectorAll('.thumb').forEach((t) => t.addEventListener('click', () => {
    main.src = t.dataset.img;
    document.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('active', x === t));
  }));

  // Quantity steppers on the product page
  document.querySelectorAll('.qty [data-step]').forEach((b) => b.addEventListener('click', () => {
    const input = b.parentElement.querySelector('input');
    const next = Number(input.value || 1) + Number(b.dataset.step);
    input.value = Math.max(Number(input.min || 1), Math.min(Number(input.max || 99), next));
  }));

  // Filters submit as soon as they change
  document.querySelectorAll('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

  // Confirm destructive admin actions
  document.querySelectorAll('[data-confirm]').forEach((el) => el.addEventListener('submit', (e) => {
    if (!confirm(el.dataset.confirm)) e.preventDefault();
  }));
});
