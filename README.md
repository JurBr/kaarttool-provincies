# Kaarttool Circulaire Specialismen – Provincies (v2)

**Wat is nieuw**
- Groepsfilters (Bedrijvigheid / R-strategie / Instrumenten) + indicatorselectie.
- KIA‑CE look: Montserrat, licht→donkergroen, strak UI.
- Geen legenda; filtering alleen.
- Klik op provincie toont popup met **alle** waarden, gegroepeerd.
- Naam-aliases: Fryslân ↔ Friesland, Brabant ↔ Noord-Brabant.
- Overlay‑hooks: voeg `data/overlays/index.json` toe om specialisatie-afbeeldingen aan/uit te zetten.

**Overlay formaat (voorbeeld `data/overlays/index.json`)**
```json
[
  {
    "id": "hoogwaardige-verwerking",
    "title": "Hoogwaardige verwerking",
    "url": "./overlays/hoogwaardige_verwerking.png",
    "bounds": [[50.75, 3.2], [53.7, 7.3]]
  }
]
```
Zorg dat de PNG dezelfde projectie (WGS84) en een nette bounding box over NL heeft.
