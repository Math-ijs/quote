/* =====================================================================
   VERMOGENSMETER – data.js
   Alle statistische gegevens en rekenparameters staan hier.
   Nieuwe CBS-cijfers? Pas alleen dit bestand aan (zie README-stappen
   onderaan dit bestand) en de rest van de website rekent vanzelf mee.

   Bedragen zijn in euro's. Aantallen huishoudens zijn in HUISHOUDENS
   (CBS publiceert "x 1 000", hieronder omgerekend en met commentaar).
   ===================================================================== */

window.VERMOGEN_DATA = {

  /* ---------- Meetjaar en bronnen ---------- */
  meta: {
    meetjaar: 2025,
    peildatum: "1 januari 2025",
    status: "voorlopige cijfers",
    gepubliceerd: "27 oktober 2026",
    volgendeCijfers: "najaar 2027 (cijfers over 2026)",
    bronnen: [
      {
        naam: "CBS StatLine 83834NED – Vermogen van huishoudens; vermogensbestanddelen",
        url: "https://www.cbs.nl/nl-nl/cijfers/detail/83834NED",
        gebruiktVoor: "aantal huishoudens, mediaan en gemiddeld vermogen"
      },
      {
        naam: "CBS StatLine 83835NED – Vermogen van huishoudens; vermogensklassen",
        url: "https://www.cbs.nl/nl-nl/cijfers/detail/83835NED",
        gebruiktVoor: "aantal huishoudens per vermogensklasse"
      },
      {
        naam: "CBS StatLine 83934NED – Welvaart; grenzen van 10%-groepen",
        url: "https://www.cbs.nl/nl-nl/cijfers/detail/83934NED",
        gebruiktVoor: "vermogenspercentielen (10e t/m 90e)"
      },
      {
        naam: "CBS-nieuwsbericht: Aantal miljonairs stijgt opnieuw (27-10-2026)",
        url: "https://www.cbs.nl/nl-nl/nieuws/2026/44/aantal-miljonairs-stijgt-opnieuw-81-duizend-meer-dan-in-2024",
        gebruiktVoor: "miljonairshuishoudens en verdeling boven € 1 miljoen"
      },
      {
        naam: "CBS-begrip: Vermogen",
        url: "https://www.cbs.nl/nl-nl/onze-diensten/methoden/begrippen/vermogen",
        gebruiktVoor: "definitie van vermogen"
      }
    ]
  },

  /* ---------- Kerncijfers (StatLine 83834NED, 2025*) ---------- */
  kern: {
    huishoudens: 8318600,        // 8.318,6 x 1 000 particuliere huishoudens
    mediaan: 169100,             // mediaan vermogen: 169,1 x 1 000 euro
    gemiddeld: 378600,           // gemiddeld vermogen: 378,6 x 1 000 euro
    totaalVermogenMld: 3149.1,   // totaal vermogen in miljarden euro
    miljonairs: 547100,          // 547,1 x 1 000 huishoudens met >= € 1 miljoen (CBS-nieuwsbericht)
    miljonairsAandeelPct: 6.6    // 6,6 procent van de huishoudens
  },

  /* ---------- Vermogensklassen (StatLine 83835NED, 2025*) ----------
     aantal = aantal huishoudens in de klasse (CBS: x 1 000, hier x 1 000 uitgeschreven).
     De klasse 500.000-1.000.000 is door ons AFGELEID:
       totaal - som van alle andere klassen - miljonairshuishoudens
       = 8.318,6 - 6.590,4 - 547,1 = 1.181,1 (x 1 000)
     Controle: het 80e percentiel (513.000) ligt net boven € 500.000 en het 90e
     percentiel (784.300) ligt onder € 1 miljoen. Dat klopt met deze aantallen. */
  klassen: [
    { van: null,    tot: -5000,   aantal: 621900,  mediaan: -24700 },  // tot -5.000 (CBS-klassemediaan -24,7)
    { van: -5000,   tot: 0,       aantal: 348500 },
    { van: 0,       tot: 1000,    aantal: 357800 },
    { van: 1000,    tot: 5000,    aantal: 607000 },
    { van: 5000,    tot: 10000,   aantal: 348000 },
    { van: 10000,   tot: 20000,   aantal: 399200 },
    { van: 20000,   tot: 50000,   aantal: 583500 },
    { van: 50000,   tot: 100000,  aantal: 410300 },
    { van: 100000,  tot: 200000,  aantal: 726700 },
    { van: 200000,  tot: 500000,  aantal: 2187500 },
    { van: 500000,  tot: 1000000, aantal: 1181100, afgeleid: true }
  ],

  /* ---------- Gepubliceerde vermogenspercentielen (StatLine 83934NED, 2025*) ----------
     Dit zijn echte CBS-waarden. p = percentiel (aandeel huishoudens met MINDER vermogen). */
  percentielen: [
    { p: 10, vermogen: -1100 },
    { p: 20, vermogen: 2600 },
    { p: 30, vermogen: 14600 },
    { p: 40, vermogen: 55700 },
    { p: 50, vermogen: 169100 },
    { p: 60, vermogen: 270700 },
    { p: 70, vermogen: 375700 },
    { p: 80, vermogen: 513000 },
    { p: 90, vermogen: 784300 }
  ],

  /* ---------- Bovenstaart (vanaf € 1 miljoen) ----------
     CBS publiceert geen percentielen boven het 90e. Voor de hoogste vermogens
     gebruiken we daarom een Pareto-achtige staart (scheve verdeling):
     het aantal huishoudens boven een grens daalt als een machtsfunctie van de grens.

     Ankerpunten: 'boven' = aantal huishoudens met MEER vermogen dan 'vermogen'.
       - € 1 miljoen:  547.100  (CBS)
       - € 1,5 miljoen: 273.550 (CBS: doorsnee/mediaan van miljonairs is 1,5 miljoen -> helft
                                  van 547.100; afgerond door CBS, dus bij benadering)
       - € 2 miljoen:  182.367  (CBS: twee derde van de miljonairs heeft 1-2 miljoen, dus een
                                  derde heeft meer; afgerond, dus bij benadering)
       - € 10 miljoen: 16.413   (CBS: 3 procent van de miljonairs heeft >= 10 miljoen)
     Tussen de ankers: lineaire interpolatie in log-log (dus Pareto per segment).
     Boven het laatste anker: Pareto met exponent 'alfaBoven'.
     AANNAME: alfaBoven = 1,5. Dat is de gemeten helling tussen 2 en 10 miljoen
     (ln(182.367/16.413) / ln(5) = 1,50). Er is geen CBS-cijfer voor de allerhoogste vermogens. */
  staart: {
    ankers: [
      { vermogen: 1000000,  boven: 547100 },
      { vermogen: 1500000,  boven: 273550 },
      { vermogen: 2000000,  boven: 182367 },
      { vermogen: 10000000, boven: 16413 }
    ],
    alfaBoven: 1.5
  },

  /* ---------- Onderstaart (vermogens onder -€ 5.000) ----------
     CBS geeft voor de laagste klasse (tot -5.000, 621.900 huishoudens) alleen een
     klassemediaan (-24.700). Daaronder lopen we lineair uit naar 0 huishoudens bij
     -€ 250.000. AANNAME, alleen relevant voor zeer grote negatieve vermogens. */
  onderstaart: {
    vermogenNul: -250000
  },

  /* ---------- Rekeninstellingen ---------- */
  rekenen: {
    // Schaal voor de asinh-transformatie waarmee we interpoleren. asinh gedraagt zich
    // lineair rond 0 (ook voor negatieve bedragen) en logaritmisch bij grote bedragen.
    asinhSchaal: 10000,
    maxBedrag: 1e12,             // bovengrens per invoerveld (€ 1 biljoen)
    onzekerheidMarge: 0.10       // "als je vermogen 10% lager/hoger is" in de resultaten
  },

  /* ---------- Wat telt wel/niet mee in de CBS-definitie? ----------
     CBS-vermogen = bank- en spaartegoeden + effecten + eigen woning + overig onroerend goed
                    + ondernemingsvermogen + aanmerkelijk belang + overige bezittingen
                    - hypotheekschuld - studieschulden - overige schulden.
     Pensioenaanspraken tellen NIET mee.
     Auto's, inboedel en spullen staan niet als aparte post in de CBS-definitie.
     'inCbs: false' betekent: standaard niet meegeteld in de vergelijking (de gebruiker kan
     het wel aanzetten). Tweede woning, verhuurd pand of eigen bedrijf vallen wel binnen
     de CBS-definitie, maar hebben in dit formulier geen eigen veld; zie uitleg in de interface. */
  velden: {
    woning:      { inCbs: true  },
    hypotheek:   { inCbs: true  },
    spaargeld:   { inCbs: true  },
    beleggingen: { inCbs: true  },
    auto:        { inCbs: false },
    overig:      { inCbs: false },
    schulden:    { inCbs: true  }
  }
};

/* =====================================================================
   NIEUWE CBS-CIJFERS TOEVOEGEN (elk najaar):
   1. Open StatLine tabel 83834NED (kern), 83835NED (klassen) en 83934NED (percentielen).
   2. Werk 'meta', 'kern', 'klassen' en 'percentielen' bij met het nieuwe meetjaar.
   3. Bereken de klasse 500.000-1.000.000 opnieuw (zie commentaar hierboven)
      of vul de CBS-waarde in als CBS die klasse publiceert, en haal dan 'afgeleid' weg.
   4. Werk de bovenstaart bij op basis van het nieuwe CBS-nieuwsbericht over miljonairs.
   5. Open index.html in je browser: de console meldt als de gegevens niet kloppen
      (bijvoorbeeld als de aantallen niet oplopen).
   ===================================================================== */
