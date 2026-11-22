# Doubleskull Tales: So funktioniert die Webseite

## Einen neuen Artikel schreiben

1. Auf GitHub in den Ordner `src/content/tales/` gehen.
2. Oben rechts "Add file" > "Create new file".
3. Dateiname: kurz, klein, mit Bindestrichen, endet auf `.md`.
   Beispiel: `galadrieth-gladiators.md`. Der Dateiname wird zur Adresse:
   doubleskulltales.com/tales/galadrieth-gladiators/
4. Diesen Kopf oben einfügen und ausfüllen:

```
---
title: "Titel des Artikels"
subtitle: "Ein Satz, der neugierig macht."
date: 2026-12-15
section: "Team Portraits"
image: "/images/dein-bild.jpg"
draft: false
---
```

- `section` muss genau eins davon sein: `The Daily Skull`, `Team Portraits`, `Orcs Illustrated`, `Coaching Corner`
- `image` ist optional (Titelbild). Weglassen, wenn es keins gibt.
- `draft: true` = Entwurf, erscheint noch nicht auf der Seite.

5. Darunter den Text schreiben:
   - `## Zwischenüberschrift`
   - `### Kleine Überschrift`
   - `**fett**` und `*kursiv*`
   - `> Zitat`
   - Bild im Text: `![Beschreibung](/images/bild.jpg)`
6. Unten "Commit changes" klicken. Nach ca. 1 Minute ist der Artikel online.

## Bilder hochladen

1. Ordner `public/images/` öffnen, "Add file" > "Upload files".
2. Bilder vorher verkleinern: max. 1600 px breit, als .jpg. Dateinamen ohne Leerzeichen und Umlaute.
3. Im Artikel verlinken mit `/images/dateiname.jpg`.

## Links und E-Mail ändern

Datei `src/site.ts`. Dort stehen E-Mail, Instagram- und YouTube-Link.

## Noch offen vor dem Launch

- Impressum: `src/pages/impressum.astro` (gelb markierte TODOs)
- Datenschutz: `src/pages/privacy.astro`
- About: `src/pages/about.astro`
- Preise: `src/pages/painting.astro`
