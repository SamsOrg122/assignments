// Deze pagina draait in een sandboxed tabblad zonder preload, dus zonder de
// browser-API. Ze navigeert daarom zelf; meer rechten heeft ze niet nodig.
// De regel voor adres-of-zoekopdracht komt uit search.js, gedeeld met de rest.
//
// De taal komt in het adres mee (`#taal=en`), want zonder preload is er geen
// weg naar de voorkeuren. Dat betekent ook: een nieuw tabblad dat al openstond
// blijft in de oude taal tot je hem ververst. Dat is de prijs van geen enkele
// deur naar deze pagina, en die prijs is hier lager dan een deur.
zetTaal(new URLSearchParams(location.hash.slice(1)).get('taal') || navigator.language);

const zoek = document.getElementById('zoek');
const klok = document.getElementById('klok');

function tijd() {
  const nu = new Date();
  klok.textContent = `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`;
  const uur = nu.getHours();
  document.getElementById('groet').textContent = t(
    uur < 6 ? 'nieuw.nacht' : uur < 12 ? 'nieuw.ochtend' : uur < 18 ? 'nieuw.middag' : 'nieuw.avond',
  );
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
