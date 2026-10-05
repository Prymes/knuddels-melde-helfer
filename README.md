# Melde-Helfer (für Extended Admincall)

Tampermonkey-Skript für das Knuddels-Meldesystem. Läuft zusätzlich zu
[Extended Admincall](https://github.com/inflames2k/Scripts) und ergänzt:

- AE-Helfer mit Verstoßauswahl, EMS-Kontrolle und Kommentargenerierung
- Kommentar-Vorlagen je Meldetyp und Bewertung
- Verwarntexte je Verstoß (kopieren per Klick)
- Team-Auswahl für „Weiterleiten an Nicks“ / „Übergabe an Nicks“
- Eigene Einstellungsseite im Menü unter **Melde-Helfer**

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) im Browser installieren.
2. Diesen Link öffnen – Tampermonkey zeigt dann das Installationsfenster:

   **[melde-helfer.user.js installieren](https://raw.githubusercontent.com/Prymes/knuddels-melde-helfer/main/melde-helfer.user.js)**

3. „Installieren“ klicken.

Updates kommen danach automatisch über Tampermonkey.

## Einstellungen

Im Meldesystem oben im Menü auf **Melde-Helfer** klicken. Dort lassen sich
Verstöße, Sanktionen, EMS-Werte, Teamleiter, Kommentar- und Verwarntexte
bearbeiten. Die Einstellungen liegen im Tampermonkey-Speicher und bleiben bei
Updates erhalten.

## Neue Version veröffentlichen

1. Änderungen in `melde-helfer.user.js` machen.
2. Im Kopf `@version` erhöhen (z. B. `2.2` → `2.3`) – sonst erkennt
   Tampermonkey kein Update.
3. Committen und pushen:

   ```
   git add melde-helfer.user.js
   git commit -m "Version 2.3: kurze Beschreibung"
   git push
   ```
