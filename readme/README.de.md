# 2D Frame — Sprite-Frame-Animations-Viewer

Spielt einen **exportierten 2D-Charakterordner** in hoardodile ab: bildgenaue
Sprite-Animation, Aktionswechsel und das pro Frame ausgelöste Charakter-Audio.

Charaktere sind 2D-Sprite-Animationen (fünf Zeichenebenen mit Sprite-Wechsel-Kurven
plus Position/Skalierung/Rotation, 30 fps, rund 150 Sprites und 75 Aktionen pro
Charakter). Das Exportformat ist in `docs/format.md` dokumentiert; das
Exportwerkzeug selbst ist ein separates, nicht öffentliches Projekt und nicht Teil
dieses Repositorys.

## Funktionen

- Erkennt zwei Ressourcenformen: einen **in sich geschlossenen Charakterordner**
  (`character.json` im Wurzelverzeichnis — einzeln behalt- oder löschbar) und einen
  **Sammelordner** (`catalog.json`, mit Charakterauswahl).
- **Vorschau (Standard)**: Alle Aktionen des Charakters laufen gleichzeitig, eine
  Kachel pro Aktion, ohne jede Einstellung. Jede Kachel bekommt die Größe ihres
  eigenen Gesamtbild-Rahmens und wird in Originalgröße oder der empfohlenen
  reduzierten Größe angezeigt. Die Kacheln
  umbrechen per Flex, sodass unterschiedlich große Aktionen ihren eigenen Platz
  bekommen; reicht der Platz nicht, scrollt das Panel. Die Vorschau ist stumm — sie
  lädt die Audio-Zuordnung nicht und hat gar keinen Wiedergabeweg.
- **Prüfen**: eine dichte Aktionstabelle (Suche, Kategoriefilter, je Zeile Bilder /
  Millisekunden / Sound-Events), eine Bühne bis zur gewählten Anzeigegröße, die eine ganze
  Animation in die Fläche einpasst statt sie zu beschneiden, ein
  **Bildstreifen** aus echten Einzelbildern zum Scrubben; oben im rechten Panel die
  **Schalter Loop, Nächste Aktion und Sound, je eine Zeile**, danach das aktuelle Bild
  (Ebene, Sprite, Position, Skalierung, Drehung, die dort ausgelösten Sounds und die
  Sprite-/Atlas-Angaben); die Event-Zuordnung liegt hinter einem Dialog. **Nächste
  Aktion** spielt eine Aktion und geht danach direkt zur nächsten der Liste über (am
  Ende wieder von vorn); dabei wird Loop ausgeschaltet und sein Schalter deaktiviert,
  weil eine Schleife das Ende einer Aktion nie erreicht. Beide
  Seitenpanels folgen der Fensterbreite (links ab 1150 px, rechts ab 1440 px).
- **Einstellungen bleiben erhalten**: die offene Ansicht (Vorschau / Prüfen) und die
  drei Schalter beim Prüfen sind **Plugin-Einstellungen** im Einstellungsspeicher des
  Hosts — eine frische Installation öffnet die Vorschau, danach startet jeder Besuch
  dort, wo der Nutzer aufgehört hat (über Neuladen, Charaktere und Sammlungen hinweg).
- **Untere Steuerleiste (in beiden Ansichten gleich)**: Play/Pause, Neustart, eine
  Live-Anzeige (Aktionsanzahl in der Vorschau, `Bild N / M · ms` beim Prüfen) und ganz
  rechts der Ansichtswechsel; bei einer Sammlung zusätzlich eine durchsuchbare
  Charakterauswahl. „Verkleinern“ ist standardmäßig aktiv und wird gespeichert.
  Ohne empfohlene Skalierung bleibt die Originalgröße erhalten; Ausschalten stellt
  sie wieder her. Animations- und Audiotiming bleiben unverändert.
- Charakter-Audio: die Sound-Events, die der Export pro Frame auslöst, mit
  wiederhergestelltem Pegel (Werte ungleich 1.0 zeigen ein `x0.80`-Badge), abspielbar
  sobald sie auf ein Sample zeigen, inklusive vollständigem Auflösungsstatus
  (unaufgelöste werden angezeigt, nicht versteckt).
- Karte: `cover.png` als Cover; das Badge unten links kombiniert das Aktions-Icon mit
  der Aktionsanzahl und das Sound-Icon mit der Anzahl der Sound-Events (bei einer Sammlung
  stattdessen die Charakteranzahl), unten rechts steht die native Pixelgröße des Covers.

## Voraussetzungen

- hoardodile ≥ 0.2.0.
- Ein exportierter Charakter- oder Sammelordner. Das Plugin liefert keine Daten mit.
- Vertraue dem Repository, bevor du installierst — Plugin-Code läuft serverseitig in
  einer Sandbox.
