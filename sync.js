// Oeffnet den Privatplaner in einem unsichtbaren (headless) Browser, schaltet ihn mit dem
// Bearbeiten-Passwort frei und wartet, bis der bereits im Code eingebaute automatische
// Bookeo-Sync (laeuft sofort beim Laden der Seite) fertig durchgelaufen ist. Macht inhaltlich
// nichts anderes, als wenn ein Mitarbeiter die Seite kurz oeffnen wuerde - nur automatisch,
// zeitgesteuert ueber GitHub Actions, ohne dass dafuer ein Geraet/Tab offen bleiben muss.
const { chromium } = require('playwright');

const URL = 'http://privatplaner.snowboard-zellamsee.at/';
const PASSWORD = process.env.PRIVATPLANER_EDIT_PASSWORD;

(async () => {
  if (!PASSWORD) {
    throw new Error('PRIVATPLANER_EDIT_PASSWORD ist nicht gesetzt (GitHub-Secret fehlt oder falsch benannt).');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Oeffne', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.count() > 0) {
    console.log('Sperrabfrage erkannt - trage Passwort ein.');
    await passwordInput.fill(PASSWORD);
    await page.getByRole('button', { name: 'Bereich freischalten' }).click();
    await page.waitForTimeout(2000);
  } else {
    console.log('Keine Sperrabfrage - vermutlich schon ein frueherer Zustand.');
  }

  // Der automatische Bookeo-Sync (siehe handleBookeoSync in App.tsx) startet von selbst, sobald
  // die Seite freigeschaltet ist - hier nur lange genug warten, bis er durchgelaufen ist (holt
  // den Bookeo-Cache, verarbeitet neue Buchungen, speichert sie serverseitig).
  console.log('Warte auf automatischen Bookeo-Sync...');
  await page.waitForTimeout(25000);

  await browser.close();
  console.log('Fertig.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
