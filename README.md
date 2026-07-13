# Restaurant Pizzeria Capri — Bestell- & Reservierungs-App

Web-App für **Restaurant Pizzeria Capri**, Kölner Str. 56, 51399 Burscheid-Hilgen.
Basis: `E:\Web-App\Restaurant-App-Template` (wiederverwendbares Grundgerüst).
Branding, Speisekarte und Geschäftsregeln wurden vollständig auf Restaurant
Pizzeria Capri umgestellt; dieses Projekt ist eigenständig und unabhängig
vom Ursprungskunden der Vorlage.

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
- `menu-data.md` — die aus der gedruckten Speisekarte (gültig ab 05/2025) erfasste
  Rohtextvorlage, aus der `CATS`/`ITEMS` in `index.html` übertragen wurden. Bleibt als
  Referenz im Projektordner.

## Speisekarte

Vollständig aus `menu-data.md` übernommen (Preise, Artikelnummern und Beschreibungen
1:1 von der gedruckten Karte, gültig ab 05/2025). **20 UI-Kategorien, 182 Positionen
insgesamt** (Getränke und Pizzabrötchen hatten auf der Karte keine Artikelnummern und
wurden daher mit neuen Nummern 901–906 bzw. 941–948 versehen):

| Kategorie | Positionen |
|---|---|
| Pizza (inkl. Party-/Familienpizza) | 55 |
| Calzone | 8 |
| Salate | 10 |
| Kleine Salate | 5 |
| Baguettes | 11 |
| Pizzabrötchen | 8 |
| Spaghetti | 12 |
| Tortellini | 8 |
| Penne Rigate | 8 |
| Tagliatelle | 6 |
| Nudelgerichte | 8 |
| Auflauf | 11 |
| Teigtaschen | 3 |
| Reisgerichte | 6 |
| Gyros | 4 |
| Fleischgerichte | 4 |
| Fischgerichte | 3 |
| Beilagen | 4 |
| Desserts | 2 |
| Getränke | 6 |
| **Summe** | **182** |

Die Menüdaten liegen als `CATS` / `ITEMS` im `<script>`-Block von `index.html`. Das
🌱-Symbol markiert vegetarische Gerichte (aus den Beschreibungen abgeleitet, nicht
explizit auf der Karte gekennzeichnet — bitte mit dem Inhaber gegenprüfen).

### Individuelle Pizza-Zutaten (2 Preisstufen: Klein/Groß)

Restaurant Pizzeria Capri hat 2 Pizzagrößen (Klein ca. 24 cm / Groß ca. 28 cm), anders
als die Vorlage (3 Stufen). Die Extrazutat-Auswahl A–E von der Original-Speisekarte
wurde in `EXTRAS_TOPPINGS` übernommen und nach Preiskategorie sortiert (`extraPriceFor()`
richtet sich nach der Größen-Bezeichnung `Klein`/`Groß`). **Vereinfachung/TODO:** Die
Kategorien D (Tzatziki, nur Klein 1,50 €) und E (Mayo/Ketchup, nur Klein 0,50 €) sind
auf der echten Karte NUR für die kleine Größe bepreist — hier wurde vereinfachend
derselbe Preis für Klein und Groß hinterlegt. Vor Live-Gang mit dem Inhaber klären, ob
das so passt oder ob Groß einen anderen Preis erhalten soll.

### Zusatzstoffe & Allergene

Die Legende (Zusatzstoffe 1–9, Allergene 10–18) entspricht exakt der auf der
Original-Speisekarte gedruckten Legende (`ADDITIVES`/`ALLERGENS`). Auf der
Pizzeria-Capri-Karte gibt es **keine Allergen-Buchstaben direkt neben den
Gerichten** — daher bleibt das Feld `al` bei allen Artikeln leer.
Feinere Angaben laut Speisekarte telefonisch/vor Ort erfragen.

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
- **Öffnungszeiten** (`openingHours()`):
  - Mo, Di, Do: 11:30–14:00 **und** 16:00–22:00 Uhr (zwei getrennte Zeitfenster mit
    Mittagspause 14:00–16:00, in der das Lokal laut Speisekarte schlicht geschlossen ist).
  - Mittwoch: Ruhetag (komplett geschlossen).
  - Fr, Sa, So, Feiertage: durchgehend 12:00–22:00 Uhr.
  - `openingHours()` liefert jetzt zusätzlich ein `windows`-Array (ein oder zwei
    `[open,close]`-Paare je Tag), damit die geteilten Öffnungszeiten an Mo/Di/Do korrekt
    geprüft werden können (Abholzeit-Validierung, Lieferfenster, Tischreservierung).
- **Lieferfenster** (`deliveryWindowStatus()`): Lieferung ist innerhalb der jeweiligen
  Öffnungsfenster bis 15 Minuten vor Fensterende möglich; in der Mittagspause (Mo/Di/Do,
  14:00–16:00) sowie am Ruhetag (Mittwoch) ist keine Bestellung möglich.
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

- **Fotos & Logo sind noch Platzhalter aus der Vorlage.** Betroffen: `images/logo.png`,
  `images/hero.jpg`, `images/about.jpg` sowie alle Kategorie-Bannerfotos (`pizza.jpg`,
  `calzone.jpg`, `salate.jpg`, `brote.jpg`, `pasta.jpg`, `auflauf.jpg`, `gyros.jpg`,
  `schnitzel.jpg` [für Fleischgerichte], `burger.jpg` [für Beilagen/Pommes],
  `dessert.jpg`, `getraenke.jpg`). Für Kategorien ohne passendes Vorlagenbild
  (Fischgerichte, Reisgerichte, Kleine Salate, Beilagen, Teigtaschen, Pizzabrötchen,
  Nudelgerichte) wurde das jeweils naheliegendste vorhandene Bild wiederverwendet
  (z. B. `pasta.jpg` für Fischgerichte/Reisgerichte, `salate.jpg` für Kleine Salate,
  `auflauf.jpg` für Teigtaschen/Nudelgerichte, `brote.jpg` für Pizzabrötchen). Sobald der
  Inhaber echte Fotos liefert, `images/*` und `Image/Logo.png` ersetzen.
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
- **Extrazutat-Preise D/E** (Tzatziki/Mayo/Ketchup nur "Klein" laut Karte) wurden
  vereinfacht auf beide Größen gleich hinterlegt — siehe Abschnitt "Speisekarte" oben.
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

- Eigenes Vercel-Projekt anlegen und deployen (Vercel-Zugangsdaten des Betreibers nötig).
- Echte Fotos & Logo vom Inhaber einholen und `images/`/`Image/Logo.png` ersetzen.
- Mit dem Inhaber die Liefergebühr-/6-km-Regelung final klären und ggf. eine echte
  Zonentabelle nachrüsten.
- Mit dem Inhaber klären, ob die Tischreservierung so (ohne Benachrichtigung) launch-fähig
  ist oder ob vorher noch ein Benachrichtigungsweg (E-Mail/Webhook) ergänzt werden soll.
- Rechtstexte (Impressum, Datenschutz, AGB, Cookies) mit echten Geschäftsdaten befüllen.
- Bei Bedarf: Küchendruck-Backend aufbauen.
