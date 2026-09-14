#!/usr/bin/env node
// De brug tussen een AI-client en Tougather Browser.
//
// Waarom dit een apart bestand is en niet in de browser zelf zit: een client als
// Claude Desktop start zijn servers zélf op, als kindproces, en praat met ze over
// standaardinvoer en -uitvoer. De browser draait dan allang. Dit programmaatje is
// dus het kindproces dat de client start, en het geeft elke vraag door aan de
// browser die al open staat.
//
// Waar de sleutel vandaan komt: niet uit de configuratie van de client. Die zou
// dan blijven werken nadat jij de verbinding hebt gesloten. De browser schrijft
// bij het openen een bestandje met de poort en een verse sleutel, en haalt dat
// bij het sluiten weer weg. Staat het er niet, dan is de deur dicht, en dat is
// precies wat de client dan te horen krijgt.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const VERBINDING = path.join(
  process.env.APPDATA
    ?? (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config')),
  'tougather',
  'mcp-verbinding.json',
);

// Wij spreken deze versies. De client noemt er één; kennen we die, dan
// antwoorden we in dezelfde, anders in de onze.
const VERSIES = ['2025-06-18', '2024-11-05'];

const lees = () => {
  try {
    return JSON.parse(fs.readFileSync(VERBINDING, 'utf8'));
  } catch {
    return null;
  }
};

const stuur = (bericht) => process.stdout.write(JSON.stringify(bericht) + '\n');

const antwoord = (id, uitkomst) => stuur({ jsonrpc: '2.0', id, result: uitkomst });
const fout = (id, code, tekst) => stuur({ jsonrpc: '2.0', id, error: { code, message: tekst } });

// Eén tekstblok terug, want dat is wat een client van een gereedschap verwacht.
const tekstUit = (waarde, misgegaan = false) => ({
  content: [{ type: 'text', text: typeof waarde === 'string' ? waarde : JSON.stringify(waarde, null, 2) }],
  isError: misgegaan,
});

async function vraagDeBrowser(pad, lijf) {
  const v = lees();
  if (!v?.poort || !v?.sleutel) {
    throw new Error(
      'De verbinding staat dicht. Zet hem aan in Tougather Browser onder '
      + 'Instellingen, bij Verbinding met een AI-client.',
    );
  }
  const res = await fetch(`http://127.0.0.1:${v.poort}${pad}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${v.sleutel}` },
    body: JSON.stringify(lijf ?? {}),
  });
  if (res.status === 401) throw new Error('De browser herkent deze sleutel niet meer. Zet de verbinding opnieuw aan.');
  if (!res.ok) throw new Error(`De browser antwoordde met ${res.status}`);
  const uit = await res.json();
  if (uit.fout) throw new Error(uit.fout);
  return uit;
}

async function gereedschapslijst() {
  const { gereedschap } = await vraagDeBrowser('/gereedschap', {});
  return gereedschap.map((g) => ({
    name: g.naam,
    description: g.zegt,
    inputSchema: g.invoer,
  }));
}

const behandel = async (bericht) => {
  const { id, method, params } = bericht;

  if (method === 'initialize') {
    const gevraagd = params?.protocolVersion;
    return antwoord(id, {
      protocolVersion: VERSIES.includes(gevraagd) ? gevraagd : VERSIES[VERSIES.length - 1],
      capabilities: { tools: {} },
      serverInfo: { name: 'tougather-browser', version: '0.1.0' },
    });
  }

  // Een melding heeft geen id en verwacht geen antwoord.
  if (id === undefined) return;

  if (method === 'ping') return antwoord(id, {});

  if (method === 'tools/list') {
    try {
      return antwoord(id, { tools: await gereedschapslijst() });
    } catch (e) {
      // Geen fout terugsturen maar een lege lijst met uitleg: een client die
      // hierop een fout krijgt, verbreekt vaak de hele verbinding, en dan zie je
      // niet eens waarom.
      return antwoord(id, { tools: [], _uitleg: String(e.message) });
    }
  }

  if (method === 'tools/call') {
    try {
      const { uitkomst } = await vraagDeBrowser('/roep', {
        naam: params?.name,
        argumenten: params?.arguments ?? {},
      });
      return antwoord(id, tekstUit(uitkomst));
    } catch (e) {
      // Als gereedschap misgaat hoort dat in de uitkomst te staan, niet als
      // protocolfout: het model moet het kunnen lezen en er iets mee doen.
      return antwoord(id, tekstUit(String(e.message ?? e), true));
    }
  }

  return fout(id, -32601, `Onbekende methode: ${method}`);
};

const lijn = readline.createInterface({ input: process.stdin });
lijn.on('line', async (regel) => {
  const schoon = regel.trim();
  if (!schoon) return;
  let bericht;
  try {
    bericht = JSON.parse(schoon);
  } catch {
    return fout(null, -32700, 'Onleesbaar bericht');
  }
  try {
    await behandel(bericht);
  } catch (e) {
    if (bericht.id !== undefined) fout(bericht.id, -32603, String(e.message ?? e));
  }
});

// Stil blijven op stdout behalve echte antwoorden: alles wat daar buiten de
// afspraak om verschijnt, breekt de verbinding met de client.
process.on('uncaughtException', (e) => {
  process.stderr.write(`tougather-mcp: ${e.stack ?? e}\n`);
});
