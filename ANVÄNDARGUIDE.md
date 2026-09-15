# Användarguide — AiPlayground

Så här använder du AiPlayground i vardagen (duet / iPhone / valfri enhet).

## Vad det är

Skriv vad du vill bygga — Gemini bygger en komplett, fristående webb-demo direkt i chatten. Ger du feedback ("byt färg", "lägg till en timer") bygger den nästa version. Alla trådar sparas automatiskt.

## Kom igång

1. Öppna appen: `https://andersbxx.github.io/aiplayground/` (eller lokalt, se README).
2. Klicka **kugghjulet** (inställningar) och klistra in din Gemini API-nyckel.
3. Spara. Du är redo.

> Nyckeln och dina chattar ligger **bara i din webbläsare** — aldrig på en server. Ingår nyckeln inte i det du delar vidare.

## De två lägena

Knapparna **Bygga / Planera** sitter precis ovanför skrivfältet.

- **Bygga** (standard): skapa en fungerande demo direkt.
- **Planera**: AI:n svarar med text och idéer i stället. Vill du bygga sedan, klicka på **"Bygg det här"**-lappen under svaret så växlar du till Bygga.

## Bygga & iterera

1. Skriv din idé i rutan och tryck Enter.
2. Demot visas i chatten — kör bara, ingen installation.
3. Justera med vanliga ord: *"bytt till mörkt tema"*, *"gör knapparna större"*.
4. Vissa svar kan ta en stund om modellen är överbelastad — AI:n byter då automatiskt till en reservmodell och berättar det.

## Dina chattar (☰)

- Alla trådar sparas automatiskt och syns under **☰ → Mina chattar**.
- **Ny chatt** startar om från tom. Du kan ha hur många som helst.
- På iPad/Chromebook/desktop (≥ 900px): klicka på ett demo-kort så öppnas det stort i preview-panelen till höger, med knappar för ladda om / kopiera HTML / öppna i ny flik / ladda ner .html / visa kod (read-only).

## Spara och flytta (export/import)

- **Exportera hela chatten:** i Mina chattar, klicka på nedladdningsikonen → en `.md`-fil (promptar + demos som HTML-block). Perfekt för att hända vidare till en annan AI eller arkivera.
- **Ladda ner en enda demo:** på demo-kortet (eller i preview-panelen), ladda ner-ikonen → `.html` som du kan öppna direkt.
- **Importera tillbaka:** i Mina chattar: **Importera .md**. På desktop kan du också **släppa en .md-fil direkt på fönstret** (≥ 900px). Chatten återskapas exakt som den var.

## iPhone / iPad

- Lägg till på hemskärmen via **Dela → Lägg till på hemskärmen** så fungerar den som en app (PWA) och kan köras offline.
- **Varning:** i Safari raderas `localStorage` ungefär efter 7 dagars inaktivitet. Exportera viktiga chattar som `.md` om du behöver dem senare.
- Drag & drop finns inte på mobil — använd **Importera .md**-knappen.

## Felsökning

- **"Anslut en API-nyckel…"** → öppna inställningar och fyll i nyckeln.
- **AI:n svarar inte / tar lång tid** → modellen är sannolikt överbelastad; vänta eller prova igen (reservmodellen kopplas in automatiskt).
- **Demo visas inte** → prova att ladda om sidan; om det är ett kraschande demo, säg till AI:n "fixa felet i din demo" som nästa prompt.