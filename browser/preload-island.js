const { contextBridge, ipcRenderer } = require('electron');

// De balk is een eigen laag met een eigen, kleinere API. Hij mag geen tabbladen
// openen of navigeren; hij geeft opdrachten door en toont wat er terugkomt.
contextBridge.exposeInMainWorld('eiland', {
  // De balk groeit met zijn inhoud mee. Het hoofdproces kan die hoogte niet
  // raden, dus meet de balk zichzelf en geeft het door.
  meldGrootte: (breedte, hoogte) => ipcRenderer.invoke('island:size', breedte, hoogte),

  geefOpdracht: (tekst) => ipcRenderer.invoke('island:assign', tekst),
  stop: () => ipcRenderer.invoke('island:stop'),
  // Alleen voor de stand 'actie': daar wacht hij op jouw akkoord.
  ga: () => ipcRenderer.invoke('island:resume'),

  onStand: (fn) => ipcRenderer.on('island:state', (_e, stand) => fn(stand)),
  onFocus: (fn) => ipcRenderer.on('island:focus', () => fn()),
});
