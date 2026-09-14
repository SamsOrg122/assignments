// Deze pagina draait in een sandboxed tabblad zonder preload, dus zonder de
// browser-API. Ze navigeert daarom zelf; meer rechten heeft ze niet nodig.
// De regel voor adres-of-zoekopdracht komt uit search.js, gedeeld met de rest.

const zoek = document.getElementById('zoek');
const klok = document.getElementById('klok');

function tijd() {
  const nu = new Date();
  klok.textContent = `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`;
  const uur = nu.getHours();
  document.getElementById('groet').textContent =
    uur < 6 ? 'Nog wakker?' : uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
}

tijd();
// Op de minuut bijwerken zonder elke seconde wakker te worden.
setTimeout(() => {
  tijd();
  setInterval(tijd, 60000);
}, (60 - new Date().getSeconds()) * 1000);

zoek.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const doel = naarZoekURL(zoek.value);
  if (doel) location.href = doel;
});

zoek.focus();
