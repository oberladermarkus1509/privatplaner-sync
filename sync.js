// Oeffnet den Privatplaner in einem unsichtbaren (headless) Browser, schaltet ihn mit dem
// Bearbeiten-Passwort frei und wartet, bis der bereits im Code eingebaute automatische
// Bookeo-Sync (laeuft sofort beim Freischalten der Seite) fertig durchgelaufen ist. Macht inhaltlich
// nichts anderes, als wenn ein Mitarbeiter die Seite kurz oeffnen wuerde - nur automatisch,
// zeitgesteuert ueber GitHub Actions, ohne dass dafuer ein Geraet/Tab offen bleiben muss.
//
// Seit Oktober 2026 liegt unter privatplaner.snowboard-zellamsee.at das Privat-Portal (Startseite
// mit Privatplaner + Privatkarten) - der Privatplaner selbst ist jetzt unter #/privatplaner.
const { chromium } = require('playwright');

const URL = process.env.PRIVATPLANER_URL || 'http://privatplaner.snowboard-zellamsee.at/#/privatplaner';
const PASSWORD = process.env.PRIVATPLANER_EDIT_PASSWORD;

(async () => {
  if (!PASSWORD) {
    throw new Error('PRIVATPLANER_EDIT_PASSWORD ist nicht gesetzt (GitHub-Secret fehlt oder falsch benannt).');
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    console.log('Oeffne', URL);
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

    // Die Seite zeigt zuerst "Lade Plan..." und erst danach die Sperrabfrage - darauf warten,
    // statt sofort nachzusehen (sonst wird die Abfrage verpasst und nichts synchronisiert).
    const passwordInput = page.locator('input[type="password"]');
    try {
      await passwordInput.waitFor({ state: 'visible', timeout: 60000 });
    } catch {
      throw new Error('Sperrabfrage des Privatplaners nicht gefunden - stimmt die Adresse (' + URL + ')?');
    }

    // Der automatische Bookeo-Sync startet direkt nach dem Freischalten: Bookeo-Daten holen
    // (bookeo-cache.php) und neue Buchungen speichern (import_participants.php). Auf genau diese
    // beiden Anfragen wird gewartet - schon jetzt mitlauschen, damit keine verpasst wird.
    const cacheResponse = page.waitForResponse(r => r.url().includes('bookeo-cache.php'), { timeout: 90000 }).catch(() => null);
    const importResponse = page.waitForResponse(r => r.url().includes('import_participants.php'), { timeout: 90000 }).catch(() => null);

    console.log('Sperrabfrage erkannt - trage Passwort ein.');
    await passwordInput.fill(PASSWORD);
    await page.getByRole('button', { name: 'Bereich freischalten' }).click();
    await page.waitForTimeout(1000);
    if (await page.getByText('Falsches Passwort').count() > 0) {
      throw new Error('Falsches Passwort - bitte das GitHub-Secret PRIVATPLANER_EDIT_PASSWORD pruefen.');
    }
    await passwordInput.waitFor({ state: 'detached', timeout: 15000 });
    console.log('Freigeschaltet.');

    console.log('Warte auf automatischen Bookeo-Sync...');
    const cache = await cacheResponse;
    if (!cache) throw new Error('Der Privatplaner hat keine Bookeo-Daten abgerufen (bookeo-cache.php).');
    if (!cache.ok()) throw new Error(`Bookeo-Cache antwortet mit HTTP ${cache.status()}.`);
    console.log('Bookeo-Daten geholt.');

    // Ohne Privat-Buchungen bei Bookeo (z.B. Nebensaison) wird nichts gespeichert - dann nicht ewig warten.
    const saved = await Promise.race([importResponse, new Promise(resolve => setTimeout(() => resolve(null), 45000))]);
    if (!saved) {
      console.log('Keine Speicherung beobachtet (z.B. keine Privat-Buchungen bei Bookeo).');
    } else if (!saved.ok()) {
      throw new Error(`Speichern der Buchungen fehlgeschlagen (HTTP ${saved.status()}).`);
    } else {
      console.log('Buchungen auf dem Server gespeichert.');
    }

    // Die Seite speichert danach noch die Tagesansicht nach - kurz Zeit dafuer lassen.
    await page.waitForTimeout(10000);
    console.log('Fertig.');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
