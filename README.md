# Restaurant Pizzeria Capri — Bestell- & Reservierungs-App

Eigenständige Web-App für **Restaurant Pizzeria Capri**, Kölner Str. 56, 51399
Burscheid-Hilgen — Storefront (`index.html`), Admin-Panel (`admin.html`) und
Node/Express-Backend mit SQLite (`server/`) in einem Projekt.

## Architektur

- Eine einzige Datei `index.html` (komplettes CSS und JavaScript inline, kein Build-Schritt, kein npm).
- `manifest.json` / `sw.js` für PWA-Grundfunktionen (Installierbarkeit, Offline-Fallback).
- `vercel.json` für Deployment-Header (Caching, Sicherheits-Header) — deploy-bereit.
- `robots.txt` / `sitemap.xml` — `robots.txt` blockiert aktuell bewusst die Indexierung
  (`Disallow: /`), da die Seite noch nicht öffentlich live ist. Die dort hinterlegte
  Domain (`pizzeria-capri-burscheid.de`) ist ein Platzhalter — bitte durch die echte
  Domain ersetzen, sobald sie feststeht.
- `images/` — Kategorie-Bannerfotos (aktuell aus der Vorlage übernommene Platzhalterbilder,
  siehe Abschnitt "Platzhalter" unten). `Image/Logo.png` — Platzhalter-Logo.
- `menu-data.md` — Rohtextvorlage der ERSTEN erfassten Kartenversion (gültig ab
  05/2025, ohne Allergen-Codes). Mittlerweile durch die schärferen Fotos
  `images/PG 1 - 2024.jpg`, `images/PG 2 - 2024.jpg` und `images/info.jpg` ersetzt/
  überholt (siehe unten) — `menu-data.md` bleibt nur als historische Referenz liegen,
  nicht mehr aktuell.

## Speisekarte

Die Preise, Artikelnummern, Beschreibungen UND Allergen-/Zusatzstoff-Codes in
`CATS`/`ITEMS` wurden zuletzt komplett neu aus schärferen Foto-Vorlagen
(`images/PG 1 - 2024.jpg` = Pizza-Seite, `images/PG 2 - 2024.jpg` = Auflauf-Seite)
übertragen — diese Version zeigt niedrigere Preise als die erste Erfassung und pro
Gericht echte Allergen-Zahlen (Feld `al`, z. B. `al:'5,11,15'`). **15 UI-Kategorien
(Pasta- und Salat-Unterkategorien zusammengefasst), 179 Positionen insgesamt**
(Getränke und Pizzabrötchen haben auf der Karte keine Artikelnummern und wurden daher
mit neuen Nummern 901–906 bzw. 941–948 versehen):

| Kategorie | Positionen |
|---|---|
| Pizza (inkl. Party-/Familienpizza) | 54 |
| Calzone | 8 |
| Salate (inkl. Kleine Salate als Unterabschnitt) | 14 |
| Baguettes | 11 |
| Pizzabrötchen | 8 |
| Pasta (Spaghetti/Tortellini/Penne Rigate/Tagliatelle/Nudelgerichte als Unterabschnitte) | 42 |
| Auflauf | 11 |
| Teigtaschen | 3 |
| Reisgerichte | 6 |
| Gyros | 3 |
| Fleischgerichte | 4 |
| Fischgerichte | 3 |
| Beilagen | 4 |
| Desserts | 2 |
| Getränke | 6 |
| **Summe** | **179** |

Gegenüber der ersten Erfassung entfernt: Pizza "Pollo Delizia", Gyros "Gyros überbacken",
Salate "Rucola Salat". Umbenannt/geändert: Salate 197 "Insalata di broccoli" → "Pollo"
(jetzt mit Hähnchen), Pasta 95 "Penne Primavera Rosé" → "Penne Al Forno" (mit
Champignons). Die Menüdaten liegen als `CATS` / `ITEMS` im `<script>`-Block von
`index.html`. Das 🌱-Symbol markiert vegetarische Gerichte (aus den Beschreibungen
abgeleitet, nicht explizit auf der Karte gekennzeichnet — bitte mit dem Inhaber
gegenprüfen).

### Individuelle Pizza-Zutaten (2 Preisstufen: Klein/Groß)

Restaurant Pizzeria Capri hat 2 Pizzagrößen (Klein ca. 24 cm / Groß ca. 28 cm), anders
als die Vorlage (3 Stufen). Die Extrazutat-Auswahl A–E von der Original-Speisekarte
wurde in `EXTRAS_TOPPINGS` übernommen und nach Preiskategorie sortiert (`extraPriceFor()`
richtet sich nach der Größen-Bezeichnung `Klein`/`Groß`): A) Meeresfrüchte-Extras
2,00/2,50 €, B) Käse 1,50/2,50 €, C) alle übrigen Zutaten 1,00/2,00 €. **Vereinfachung/
TODO:** Kategorie D (Tzatziki) ist auf der echten Karte NUR für Groß bepreist (1,50 €) —
hier wurde vereinfachend derselbe Preis für Klein und Groß hinterlegt. Kategorie E
(Mayo/Ketchup, nur Klein 0,50 €) ist unverändert. Vor Live-Gang mit dem Inhaber klären,
ob das so passt.

### Zusatzstoffe & Allergene

Die Legende (Zusatzstoffe 1–9, Allergene 10–18) entspricht exakt der auf der
Speisekarte gedruckten Legende (`ADDITIVES`/`ALLERGENS`). Anders als in der ersten
Erfassung angenommen, druckt die Karte SEHR WOHL Allergen-/Zusatzstoff-Zahlen direkt
neben den Gerichten (z. B. `Salami¹·³·⁴`) — diese stehen jetzt korrekt im Feld `al` pro
Artikel (94 von 179 Artikeln haben einen nicht-leeren `al`-Wert; die übrigen haben laut
Karte tatsächlich keine Kennzeichnung). Feinere Angaben laut Speisekarte telefonisch/
vor Ort erfragen.

## Design

- Warmes Creme/Parchment-Theme aus der Vorlage übernommen, Marken-Rot als `--brand`.
- **Kategorie-Akzentfarben** individuell vergeben: Grün für Pizza/Salate/Baguette/
  Pizzabrötchen, Rot-Orange-Abstufungen für die Nudelkategorien (Spaghetti/Tortellini/
  Penne/Tagliatelle), Orange für Auflauf/Beilagen/Teigtaschen/Nudelgerichte, tiefes
  Weinrot/Braun für Gyros/Fleischgerichte, Blau für Fischgerichte, Braun für
  Dessert/Getränke, Gold für Reisgerichte. Konfigurierbar als `accent`-Feld je Eintrag
  in `CATS`.
- Kategorie-Bannerfotos: **Platzhalter aus der Vorlage** (siehe Abschnitt "Platzhalter").
- Nur lateinische/deutsche Schriften.

## Geschäftsregeln

Zentral als benannte Konstanten am Anfang des `<script>`-Blocks in `index.html`:

- **Mindestbestellwert** `MINDESTBESTELLWERT = 15` € (nur Speisen ohne Getränke, nur Lieferung).
- **Liefergebühr** (`DELIVERY_ZONES`): stark vereinfacht auf **eine einzige Zone** mit
  fester Gebühr (2 €), da die Original-Speisekarte keine detaillierte Zonentabelle
  liefert, sondern nur die pauschale Aussage "über 6 km: 20 € Mindestbestellwert +
  Liefergebühr". Diese Entfernungs-Unterscheidung ist **NICHT** abgebildet — siehe
  "Vor Live-Gang klären" unten.
- **Kein Gratis-Getränk-Programm** (`FREE_DRINK_AKTIV = false`) — auf der Speisekarte
  nicht vorgesehen. Logik bleibt im Code erhalten (nicht gelöscht), nur inaktiv.
- **Kein Abhol- oder Neukundenrabatt** (`ABHOL_RABATT_AKTIV = false`,
  `NEUKUNDE_RABATT_AKTIV = false`) — ebenfalls nicht von der Speisekarte gestützt.
  Komplette Rabattlogik aus der Vorlage bleibt erhalten, nur deaktiviert, falls der
  Inhaber später ein Rabattprogramm einführen möchte.
- **Öffnungszeiten** (`openingHours()`) — laut `images/info.jpg`, aktualisiert und
  OHNE Mittagslücke (anders als in der ersten Erfassung angenommen):
  - Mo, Di–Do, Fr, Sa: durchgehend 11:30–22:00 Uhr (ein einziges Zeitfenster).
  - Mittwoch: Ruhetag (komplett geschlossen).
  - So, Feiertage: durchgehend 12:00–22:00 Uhr.
  - `openingHours()` liefert weiterhin ein `windows`-Array (aktuell mit genau einem
    `[open,close]`-Paar je Öffnungstag), damit die Logik unverändert mehrere Fenster pro
    Tag unterstützen würde, falls sich die Zeiten künftig wieder ändern.
- **Lieferfenster** (`deliveryWindowStatus()`): Lieferung ist innerhalb des jeweiligen
  Öffnungsfensters bis 15 Minuten vor Fensterende möglich; am Ruhetag (Mittwoch) ist
  keine Bestellung möglich.
- Feiertagslogik ist **nicht implementiert** (nur TODO-Kommentar in `openingHours()`).

## Tischreservierung (neu — nicht Teil der Vorlage)

Neue Funktion "Tisch reservieren", erreichbar über Nav-Link, mobiles Menü,
Hero-Button und Footer-Link (`openReservation()`).

- **Rein clientseitig, kein Backend.** Reservierungsanfragen werden als wachsende
  Liste in `localStorage` gespeichert (`RESERVATIONS_KEY = 'pizzeriacapriReservations'`),
  analog zum bestehenden Muster von `PROFILE_KEY`/`ORDERED_PHONES_KEY`.
- **Es gibt KEINE automatische Benachrichtigung an das Restaurant.** Die UI macht das an
  mehreren Stellen explizit klar (Hinweisbox im Formular UND in der Abschluss-Anzeige):
  Die Anfrage wird nur im Browser des Gastes gespeichert, das Restaurant erfährt davon
  nichts automatisch, bis jemand manuell in den Browser-Speicher schaut. Der Text sagt
  ausdrücklich, dass es sich um eine **Anfrage** handelt und das Restaurant zur
  Bestätigung zurückruft — es wird NICHT behauptet, die Reservierung sei bereits fest.
- **Formularfelder:** Vorname, Nachname, Telefon (Pflicht), E-Mail (optional), Datum,
  Uhrzeit, Personenzahl (Stepper 1–20), Notiz/Nachricht (optional).
- **Validierung:**
  - Mittwoch ist als Ruhetag komplett gesperrt (`openingHours(day).closed`).
  - Datum/Uhrzeit müssen in ein tatsächliches Öffnungsfenster des Wochentags fallen
    (inkl. der geteilten Mo/Di/Do-Fenster).
  - Mindestvorlauf von 2 Stunden ab dem aktuellen Zeitpunkt (`RESERVATION_MIN_LEAD_MINUTES`).
  - Personenzahl 1–20; bei größeren Gruppen verweist die UI auf einen Telefonanruf.
- **Nach dem Absenden:** Bestätigungsansicht im selben Modal mit Referenznummer
  (`RES-######`), Zusammenfassung der Daten und erneutem Hinweis, dass ein Rückruf zur
  Bestätigung erfolgt.
- **Offene Frage für den Inhaber:** Reicht diese "wir rufen zurück"-Lösung, oder soll
  später ein echter Benachrichtigungsweg ergänzt werden (z. B. E-Mail-Versand über einen
  einfachen Serverless-Endpunkt, oder ein Webhook an ein Kassensystem)? Aktuell technisch
  nicht möglich, da das Projekt komplett ohne Backend läuft.

## Platzhalter — vor Live-Gang mit dem Inhaber klären

- **Logo ist bereits echt, Kategoriefotos noch nicht.** `images/logo.png` ist das
  echte Pizza-Capri-Logo (Steuerrad + Schriftzug); `icon-192.png`/`icon-512.png`
  wurden daraus generiert. Weiterhin Platzhalter aus der Vorlage: `images/hero.jpg`,
  `images/about.jpg` sowie alle Kategorie-Bannerfotos (`pizza.jpg`, `calzone.jpg`,
  `salate.jpg`, `brote.jpg`, `pasta.jpg`, `auflauf.jpg`, `gyros.jpg`, `schnitzel.jpg`
  [für Fleischgerichte/Fischgerichte]). Für Kategorien ohne passendes Vorlagenbild
  wurde das jeweils naheliegendste vorhandene Bild wiederverwendet (z. B. `auflauf.jpg`
  für Reisgerichte/Teigtaschen, `gyros.jpg` für Beilagen). Sobald der Inhaber echte
  Fotos liefert, die jeweilige Datei in `images/` ersetzen (Dateiname beibehalten).
- **Liefergebühr/Zonen:** Die "über 6 km"-Unterscheidung (höherer Mindestbestellwert
  20 € + zusätzliche Liefergebühr) ist NICHT abgebildet — aktuell gilt für jede Lieferung
  pauschal 15 € Mindestbestellwert und 2 € Liefergebühr (`DELIVERY_ZONES`). Klären: Soll
  eine echte Zonen-/Entfernungslogik eingebaut werden (z. B. PLZ-Liste oder
  Kartendienst-Abfrage), sobald der Inhaber die genaue Abgrenzung nennt?
  - `MINDESTBESTELLWERT = 15` € — laut Speisekarte, noch nicht separat vom Inhaber bestätigt.
- **Tischreservierung:** siehe Abschnitt oben — bewusst ohne Backend/Benachrichtigung
  umgesetzt; mit dem Inhaber klären, ob das reicht oder ob ein echter
  Benachrichtigungsweg (E-Mail/Webhook) folgen soll.
- **Domain** in `robots.txt`/`sitemap.xml` (`pizzeria-capri-burscheid.de`) ist ein
  Platzhalter — durch die echte Domain ersetzen, sobald sie feststeht.
- **Extrazutat-Preis D** (Tzatziki, nur "Groß" laut Karte) wurde vereinfacht auf beide
  Größen gleich hinterlegt — siehe Abschnitt "Speisekarte" oben.
- **Feiertagslogik** ist nicht implementiert (nur TODO-Kommentar in `openingHours()`).
- **Rechtliche Seiten** (Impressum, Datenschutz, AGB, Cookies) sind bewusst noch
  **nicht** mit echten Rechtstexten befüllt — nur Platzhalter ("Diese Seite wird in Kürze
  vervollständigt."). Modal-/Link-Struktur ist voll funktionsfähig; echte Texte folgen,
  sobald die Geschäftsdaten des Inhabers (Rechtsform, USt-IdNr./Kleinunternehmerregelung
  etc.) vorliegen.
- **Social-Media-Links** im Footer sind Platzhalter (`href="#"`), bis der Inhaber echte
  Profile nennt.

## Bestellung / Kassenbon

Der Kassenbon wird ausschließlich lokal im Browser gedruckt (`window.print()`). Es gibt
(noch) kein Backend und keinen automatischen Küchendruck an der Theke — identisch zur
Vorlage.

## Testen

```
cd E:\Web-App\Pizza-Capri
python -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Beim Review wurden zusätzlich geprüft:
JavaScript-Syntax (`node --check` auf den extrahierten `<script>`-Inhalt, fehlerfrei),
HTML-Tag-Balance (`<div>`/`</div>`, `<section>`/`</section>` gleich oft), alle in
`index.html` referenzierten Bilddateien vorhanden, sowie ein vollständiger
Textsuche-Durchlauf auf verbliebene Fremd-Branding-Reste aus der Vorlage
(keine Treffer mehr).

## Nächste Schritte

- Live auf Vercel (`pizza-capri.vercel.app`, mit GitHub verbunden für Auto-Deploy).
- Echte Kategorie-/Hero-Fotos vom Inhaber einholen und die verbliebenen Platzhalter in
  `images/` ersetzen (Logo ist bereits echt).
- Mit dem Inhaber die Liefergebühr-/6-km-Regelung final klären und ggf. eine echte
  Zonentabelle nachrüsten.
- Mit dem Inhaber klären, ob die Tischreservierung so (ohne Benachrichtigung) launch-fähig
  ist oder ob vorher noch ein Benachrichtigungsweg (E-Mail/Webhook) ergänzt werden soll.
- Rechtstexte (Impressum, Datenschutz, AGB, Cookies) mit echten Geschäftsdaten befüllen.
- Bei Bedarf: Küchendruck-Backend aufbauen.
