// Alt hjelpeinnhold på ett sted: de korte verktøyforklaringene som dukker opp når man
// holder pekeren over et verktøy (HelpHover), og den fulle brukerveiledningen
// (HelpDialog). Samme tekster brukes begge steder, så de aldri kan si to ulike ting.

export interface ToolHelp {
  title: string;
  /** Hurtigtast, hvis verktøyet har en. */
  shortcut?: string;
  /** Én setning: hva verktøyet er til. */
  summary: string;
  /** Slik gjør du – korte steg. */
  steps: string[];
  /** Valgfritt tips. */
  tip?: string;
}

/** Nøkkel = `data-help`-verdien på knappen (som regel verktøyets ToolMode). */
export const TOOL_HELP: Record<string, ToolHelp> = {
  select: {
    title: 'Velg',
    shortcut: 'V',
    summary: 'Merk det du har tegnet for å endre, flytte eller slette det.',
    steps: [
      'Klikk på et rør, en kanal eller et utstyr for å merke det.',
      'Shift-klikk for å merke flere, eller dra en ramme rundt dem.',
      'Dobbeltklikk på en kanal for å merke hele den sammenhengende strekningen.',
      'Høyreklikk på et rør eller en kanal for meny: ny avgrening, klammer, flytt eller slett.',
      'Flytt det merkede med piltastene (Shift = lengre hopp), og slett med Delete.',
    ],
    tip: 'Egenskapene til det du har merket, vises nederst til høyre og kan endres der.',
  },
  pan: {
    title: 'Panorer',
    summary: 'Flytt utsnittet av tegningen.',
    steps: ['Dra i tegningen for å flytte den.', 'Rull med musehjulet for å zoome inn og ut.'],
    tip: 'Du kan også holde mellomrom nede og dra, uansett hvilket verktøy som er valgt.',
  },
  move: {
    title: 'Flytt',
    shortcut: 'F',
    summary: 'Flytt det som er merket til et nytt sted.',
    steps: [
      'Merk det som skal flyttes (med Velg).',
      'Klikk et basispunkt, f.eks. et endepunkt.',
      'Klikk der basispunktet skal havne.',
      'Skriv et tall for eksakt avstand i mm, og trykk Enter.',
    ],
    tip: 'Shift låser retningen til 45°-trinn. Kanaler som er koblet til, strekker seg og henger sammen.',
  },
  copy: {
    title: 'Kopier',
    shortcut: 'C',
    summary: 'Lag en kopi av det som er merket.',
    steps: [
      'Merk det som skal kopieres.',
      'Klikk et basispunkt.',
      'Klikk der kopien skal havne, eller skriv avstanden i mm og trykk Enter.',
    ],
    tip: 'Kopien blir merket etterpå, så du kan kopiere videre med samme avstand.',
  },
  split: {
    title: 'Del',
    shortcut: 'D',
    summary: 'Del et rør eller en kanal i to.',
    steps: [
      'Klikk på røret eller kanalen der du vil dele.',
      'Merk den ene halvdelen og endre f.eks. dimensjonen. Overgangen settes inn automatisk.',
    ],
  },
  trimextend: {
    title: 'Trim/Forleng',
    shortcut: 'T',
    summary: 'Kutt eller forleng et rør eller en kanal fram til en annen.',
    steps: [
      'Klikk først på grensen (røret/kanalen det skal kuttes eller forlenges mot).',
      'Klikk deretter på røret/kanalen som skal kuttes eller forlenges.',
      'Grensen blir stående, så du kan gjøre flere på rad. Esc fjerner grensen.',
    ],
  },
  align: {
    title: 'Juster',
    shortcut: 'J',
    summary: 'Legg et rør, en kanal eller et utstyr på linje med noe annet.',
    steps: [
      'Klikk på referanselinja (det du vil justere mot).',
      'Klikk på det som skal flyttes. Det flyttes rett inntil referansen, uten å roteres.',
      'Referansen blir stående, så du kan justere flere. Esc fjerner den.',
    ],
  },
  line: {
    title: 'Tegn rør eller kanal',
    shortcut: 'R / K',
    summary: 'Tegn en strekning med valgt type, materiale og dimensjon.',
    steps: [
      'Klikk på typen i venstremenyen. Materiale og dimensjon velges i menyen under toppbaren.',
      'Klikk i tegningen for hvert knekkpunkt. Bend settes inn automatisk.',
      'Skriv et tall for eksakt lengde i mm (Tab bytter til vinkel).',
      'Avslutt med Enter, dobbeltklikk eller høyreklikk. Esc avbryter.',
    ],
    tip: 'Vinkellås er på som standard. Hold Shift for å tegne fritt. Backspace angrer siste punkt.',
  },
  recent: {
    title: 'Sist brukt',
    summary: 'Snarvei til typene du nylig har tegnet med, med samme materiale og dimensjon.',
    steps: ['Klikk på en brikke for å tegne videre med akkurat den typen.'],
    tip: 'R velger sist brukte rør, K sist brukte kanal. Trykk igjen for å bla.',
  },
  library: {
    title: 'Symbolbibliotek',
    summary: 'Sett inn utstyr: ventiler, spjeld, lyddempere, diffusorer, aggregat og egne komponenter.',
    steps: [
      'Åpne biblioteket og søk, eller filtrer på Rør / Ventilasjon.',
      'Velg et symbol, og sett mål i menyen under toppbaren.',
      'Klikk på et rør eller en kanal for å sette utstyret på det. Det roteres og farges automatisk.',
    ],
    tip: '«Smart dimensjon» gir utstyret samme dimensjon som røret/kanalen du klikker på.',
  },
  calibrate: {
    title: 'Kalibrer målestokk',
    summary: 'Sett målestokken ved hjelp av en kjent avstand på tegningen.',
    steps: [
      'Klikk på to punkter med kjent avstand, f.eks. en målsatt vegg.',
      'Skriv inn den virkelige avstanden i mm.',
    ],
    tip: 'Målestokken gjelder kun tegningen du står på.',
  },
  setscale: {
    title: 'Sett målestokk',
    summary: 'Velg målestokk manuelt, eller la den leses fra PDF-en.',
    steps: ['Velg f.eks. 1:50 eller 1:100, eller bruk «Auto» for å lese målestokken fra tegningens tekst.'],
  },
  tag: {
    title: 'Tag',
    summary: 'Sett en merkelapp som viser type og dimensjon.',
    steps: ['Klikk på et rør eller en kanal.', 'Dra merkelappen dit du vil ha den.'],
    tip: 'Teksten oppdateres av seg selv hvis du endrer dimensjonen senere.',
  },
  'measure:distance': {
    title: 'Avstand',
    shortcut: 'A',
    summary: 'Mål avstanden mellom to punkter.',
    steps: ['Klikk på startpunktet.', 'Klikk på sluttpunktet. Målet vises i mm.'],
    tip: 'Pekeren fester seg til endepunkter og utstyr. Shift låser til rett linje.',
  },
  'measure:area': {
    title: 'Areal',
    summary: 'Mål arealet av et rom eller en flate.',
    steps: ['Klikk punkt for punkt rundt flaten.', 'Trykk Enter, eller klikk på startpunktet, for å lukke figuren.'],
  },
  'annotation:line': {
    title: 'Linje',
    summary: 'Tegn en strek (hjelpelinje) som ikke telles i mengdelista.',
    steps: [
      'Klikk for hvert knekkpunkt.',
      'Avslutt med Enter, dobbeltklikk eller høyreklikk.',
      'Velg farge, tykkelse og strekstil i menyen under toppbaren.',
    ],
    tip: 'Vinkellås er på. Hold Shift for å tegne fritt. Backspace angrer siste punkt.',
  },
  'annotation:arrow': {
    title: 'Pil',
    summary: 'Tegn en pil som peker på noe i tegningen.',
    steps: ['Klikk der pilen skal starte.', 'Klikk der spissen skal være.'],
  },
  'annotation:ellipse': {
    title: 'Ellipse',
    summary: 'Tegn en ellipse eller sirkel rundt noe.',
    steps: ['Klikk og dra, eller klikk i ett hjørne og deretter i motsatt hjørne.'],
  },
  'annotation:rect': {
    title: 'Rektangel',
    summary: 'Tegn et rektangel.',
    steps: ['Klikk og dra, eller klikk i ett hjørne og deretter i motsatt hjørne.'],
  },
  'annotation:polygon': {
    title: 'Polygon',
    summary: 'Tegn en lukket figur med så mange hjørner du vil.',
    steps: ['Klikk for hvert hjørne.', 'Trykk Enter, eller klikk på startpunktet, for å lukke figuren.'],
  },
  'annotation:highlight': {
    title: 'Marker',
    summary: 'Legg en gjennomsiktig fargemarkering over et område.',
    steps: ['Klikk og dra over området.', 'Juster farge og styrke i menyen under toppbaren.'],
  },
  'annotation:text': {
    title: 'Tekst',
    summary: 'Skriv en fri tekst på tegningen.',
    steps: ['Klikk der teksten skal stå.', 'Dobbeltklikk på teksten for å endre den.'],
  },
  'annotation:textbox': {
    title: 'Tekstboks',
    summary: 'Tekst i en ramme med hvit bakgrunn.',
    steps: ['Klikk og dra for å lage boksen.', 'Dobbeltklikk for å skrive.'],
  },
  'annotation:callout': {
    title: 'Melding',
    summary: 'En tekstboks med strek som peker på et punkt.',
    steps: ['Klikk på det meldingen gjelder.', 'Dobbeltklikk i boksen for å skrive, og dra den dit du vil.'],
  },
  'annotation:cloud': {
    title: 'Sky',
    summary: 'Revisjonssky som markerer et område som er endret eller må sjekkes.',
    steps: ['Klikk og dra en ramme rundt området.'],
  },
};

export interface HelpTopic {
  title: string;
  /** Kort innledning (valgfri). */
  intro?: string;
  /** Nummererte steg. */
  steps?: string[];
  /** Punktliste. */
  points?: string[];
  /** Hurtigtaster/tabellrader: [tast, hva den gjør]. */
  keys?: [string, string][];
  tip?: string;
  /** Hent tittel/steg/tips fra TOOL_HELP i stedet (holder de to i synk). */
  tool?: string;
}

export interface HelpCategory {
  id: string;
  label: string;
  /** Én linje under kategorinavnet. */
  blurb: string;
  topics: HelpTopic[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'start',
    label: 'Kom i gang',
    blurb: 'Fra tom side til ferdig mengdeliste i fem steg.',
    topics: [
      {
        title: 'Slik jobber du – kort fortalt',
        steps: [
          'Last opp tegningen: «Last opp PDF» øverst til venstre. Du kan velge flere filer samtidig.',
          'Sjekk målestokken: knappen «Målestokk» øverst viser hva som er satt. Grønn = satt, gul = mangler.',
          'Tegn rør og kanaler: klikk på en type i venstremenyen og klikk deg langs strekningen på tegningen.',
          'Sett inn utstyr: åpne «Bibliotek…» og klikk utstyret inn på røret eller kanalen.',
          'Hent ut mengdene: mengdelista til høyre oppdateres mens du tegner. Eksporter til Excel eller PDF med nedlastingsknappen øverst.',
        ],
        tip: 'Alt lagres automatisk i nettleseren mens du jobber. «Lagret kl. …» øverst viser siste lagring.',
      },
      {
        title: 'Skjermen',
        points: [
          'Toppbaren: opplasting, valg av tegning, angre/gjenta, eksport, målestokk, hjelp, zoom og visning.',
          'Verktøystripen under toppbaren: måle- og markeringsverktøy, tekst og skyer.',
          'Venstremenyen: velg, rediger, og alle rør- og kanaltypene du kan tegne med.',
          'Menyen som dukker opp under toppbaren når du tegner: materiale, dimensjon og andre valg for det du holder på med.',
          'Høyre side: mengdelista øverst og egenskapene til det du har merket nederst.',
        ],
      },
      {
        title: 'Navigere i tegningen',
        points: [
          'Rull med musehjulet for å zoome inn og ut der pekeren står.',
          'Hold mellomrom nede og dra for å flytte utsnittet, eller bruk verktøyet «Panorer».',
          'Knappen med to piler øverst til høyre tilpasser tegningen til skjermen.',
        ],
      },
    ],
  },
  {
    id: 'tegne',
    label: 'Hvordan tegne',
    blurb: 'Rør og kanaler, bend, avgreininger og dimensjonsbytte.',
    topics: [
      { title: 'Tegne et rør eller en kanal', tool: 'line' },
      {
        title: 'Velge type, materiale og dimensjon',
        points: [
          'Klikk på typen i venstremenyen (f.eks. Tilluftskanal). Den husker hva du brukte sist.',
          'Mens du tegner, står materiale og dimensjon i menyen under toppbaren. Bytt der uten å avbryte tegningen.',
          'Velg «Rektangulær kanal (stål)» som materiale for firkantkanal. Dimensjonslista bytter da til firkantmål.',
          'Den lille pila til høyre for typen i venstremenyen åpner alle materialer og dimensjoner, og lar deg legge til egne mål og endre farge.',
        ],
      },
      {
        title: 'Bend, overganger og avgreininger kommer av seg selv',
        points: [
          'Bend: settes inn i hvert knekkpunkt, med riktig vinkel.',
          'Overgang: bytter du dimensjon midt i en strekning, settes en overgang inn der.',
          'Avgreining: start eller avslutt en strekning midt på et eksisterende rør eller en kanal. For kanal velger du mellom påstikk og T-kanal.',
          'Fortsette: klikk på enden av et eksisterende rør/kanal for å tegne videre fra den.',
          'Alt dette telles automatisk i mengdelista.',
        ],
        tip: 'Kobler du sammen to ulike systemer (f.eks. tilluft og avtrekk), får du et varsel først.',
      },
      {
        title: 'Presis tegning',
        points: [
          'Vinkellås er på: strekningen fester seg til rette vinkler og materialets standardvinkler. Hold Shift for fri vinkel.',
          'Skriv et tall mens du tegner for eksakt lengde i mm. Tab bytter til vinkel. Krever at målestokk er satt.',
          'Backspace angrer siste punkt. Esc avbryter hele strekningen.',
        ],
      },
      {
        title: 'Fra ventilasjonsaggregat',
        steps: [
          'Sett ned et ventilasjonsaggregat fra biblioteket, og merk det.',
          'Klikk på plusstegnet på en av kortsidene.',
          'Velg kanaltype: tilluft/avtrekk på den ene siden, avkast/inntak på den andre.',
          'Tegn kanalen. Den starter i riktig åpning på aggregatet.',
        ],
        tip: 'Flytter du aggregatet etterpå, følger kanalene med og holder seg rette.',
      },
    ],
  },
  {
    id: 'endre',
    label: 'Endre og flytte',
    blurb: 'Merk, flytt, kopier, del, trim og juster det du har tegnet.',
    topics: [
      { title: 'Velg', tool: 'select' },
      {
        title: 'Endre et rør eller en kanal direkte',
        points: [
          'Merk det, og dra i et av endepunktene for å forlenge, forkorte eller vri. Kanaler som er koblet til, følger med.',
          'Hold Shift mens du drar for å låse til 45°-trinn. Hold Alt for å koble løs fra naboen.',
          'Plusstegnet på en åpen ende fortsetter tegningen derfra. Høyreklikk plusset for å blende enden (kanal).',
          'Plusstegnet på et bend gjør det om til en T-avgreining.',
          'Bytt type, materiale og dimensjon i egenskapspanelet nederst til høyre.',
        ],
      },
      {
        title: 'Flytte med piltastene',
        points: [
          'Merk noe og bruk piltastene. Shift gir lengre hopp.',
          'Én kanal: naboene strekker seg, så alt henger sammen.',
          'Utstyr på en kanal (f.eks. spjeld): glir langs kanalen.',
          'Aggregat: kanalene som går ut fra det, følger med.',
          'Hele serien med tastetrykk angres med én Ctrl+Z.',
        ],
      },
      { title: 'Flytt', tool: 'move' },
      { title: 'Kopier', tool: 'copy' },
      { title: 'Del', tool: 'split' },
      { title: 'Trim/Forleng', tool: 'trimextend' },
      { title: 'Juster', tool: 'align' },
      {
        title: 'Angre og slette',
        points: [
          'Ctrl+Z angrer, Ctrl+Y gjør om. Pilene i toppbaren gjør det samme.',
          'Delete eller Backspace sletter det som er merket.',
          'Sletter du en kanal, ryddes bend og avgreininger som ikke lenger har noe å sitte på.',
        ],
      },
    ],
  },
  {
    id: 'utstyr',
    label: 'Utstyr og komponenter',
    blurb: 'Symbolbiblioteket, smart dimensjon og egne komponenter.',
    topics: [
      { title: 'Sette inn utstyr', tool: 'library' },
      {
        title: 'Slik oppfører utstyret seg',
        points: [
          'Settes det på et rør eller en kanal, roteres det etter retningen og får systemets farge i en mørkere tone.',
          'Lyddempere og spjeld tegnes i virkelig lengde og dimensjon når målestokk er satt.',
          'Med «Smart dimensjon» på får utstyret samme dimensjon som røret/kanalen det settes på.',
          'Klikker du utenfor et rør/kanal, får du spørsmål om du vil plassere utstyret frittstående.',
          'Merk utstyret for å endre mål og rotasjon i egenskapspanelet.',
        ],
      },
      {
        title: 'Egne komponenter',
        steps: [
          'Åpne biblioteket og gå til «Mine komponenter».',
          'Klikk «Ny komponent», og gi den navn, symbol, farge og egne felter.',
          'Komponenten ligger deretter i biblioteket og telles i mengdelista som alt annet utstyr.',
        ],
      },
      {
        title: 'Klammer og oppheng',
        points: [
          'Høyreklikk på et rør eller en kanal og velg «Sett inn klammer».',
          'I Innstillinger kan du slå på automatiske klammer med fast avstand, og velge gjengestag.',
        ],
      },
    ],
  },
  {
    id: 'verktoy',
    label: 'Verktøy-funksjoner',
    blurb: 'Måling, merkelapper, figurer, tekst og skyer.',
    topics: [
      {
        title: 'Om verktøystripen',
        intro:
          'Verktøyene i stripen under toppbaren er til måling og markering. Bortsett fra Tag påvirker de ikke mengdelista.',
        points: [
          'Klikk på et verktøy for å bruke det. Klikk på det igjen for å gå tilbake til Velg.',
          'Farge, tykkelse og andre valg står i menyen som dukker opp under toppbaren.',
          'Hold pekeren over et verktøy i 5 sekunder for en kort forklaring.',
        ],
      },
      { title: 'Tag', tool: 'tag' },
      { title: 'Avstand', tool: 'measure:distance' },
      { title: 'Areal', tool: 'measure:area' },
      { title: 'Linje', tool: 'annotation:line' },
      { title: 'Pil', tool: 'annotation:arrow' },
      { title: 'Ellipse', tool: 'annotation:ellipse' },
      { title: 'Rektangel', tool: 'annotation:rect' },
      { title: 'Polygon', tool: 'annotation:polygon' },
      { title: 'Marker', tool: 'annotation:highlight' },
      { title: 'Tekst', tool: 'annotation:text' },
      { title: 'Tekstboks', tool: 'annotation:textbox' },
      { title: 'Melding', tool: 'annotation:callout' },
      { title: 'Sky', tool: 'annotation:cloud' },
    ],
  },
  {
    id: 'tegninger',
    label: 'Tegninger og målestokk',
    blurb: 'Flere tegninger i samme tilbud, hver med sin målestokk.',
    topics: [
      {
        title: 'Flere tegninger',
        points: [
          '«Last opp PDF» legger til nye tegninger uten å fjerne de du har. Hver side i en PDF blir en egen tegning.',
          'Bytt tegning med pilene eller nedtrekkslista i toppbaren.',
          'Det du tegner, hører til tegningen du står på, og vises bare der.',
          'Blyant-knappen ved siden av lar deg gi tegningen nytt navn eller fjerne den.',
        ],
      },
      {
        title: 'Målestokk',
        intro: 'Riktig målestokk er det som gjør lengdene i mengdelista riktige. Hver tegning har sin egen.',
        points: [
          'Auto: målestokken leses fra teksten i PDF-en når du laster opp.',
          'Manuelt: klikk «Målestokk» i toppbaren og velg f.eks. 1:50.',
          'Kalibrer: klikk på to punkter med kjent avstand og skriv inn målet.',
        ],
        tip: 'Sjekk målestokken med Avstand-verktøyet mot en målsatt vegg før du begynner.',
      },
    ],
  },
  {
    id: 'mengder',
    label: 'Mengdeliste og eksport',
    blurb: 'Les av mengdene, og ta dem ut til Excel eller PDF.',
    topics: [
      {
        title: 'Mengdelista',
        points: [
          'Viser lengder, bend, overganger, avgreininger, skjøter, klammer og utstyr, og oppdateres mens du tegner.',
          'Med flere tegninger står navnene som knapper øverst. Klikk for å slå en tegning av eller på. «Alle» gir totalen.',
          'Grupper på system, dimensjon eller materiale, og sorter på navn, lengde eller antall.',
          'Klikk på en linje i lista for å utheve alt av den typen på tegningen.',
          'Pila på kanten av lista skjuler den, så tegningen får mer plass. Knappen øverst i lista viser den i full bredde.',
        ],
      },
      {
        title: 'Eksport',
        points: [
          'Nedlastingsknappen i toppbaren gir Excel eller utskrift/PDF.',
          'Excel: fanen «Mengdeliste» har totalen, og «Per tegning» har mengdene fordelt på tegning med filter.',
          'PDF: totalen først, deretter én del per tegning med bilde og mengdeliste.',
          'Eksporten bruker samme gruppering og sortering som du har valgt i mengdelista.',
        ],
      },
    ],
  },
  {
    id: 'visning',
    label: 'Visning og innstillinger',
    blurb: 'Tilpass hvordan tegningen ser ut.',
    topics: [
      {
        title: 'Visning',
        points: [
          'Øye-knappen øverst til høyre: velg rør som sylinder eller enkel strek, og lys eller mørk modus.',
          'Øye-ikonene i venstremenyen skjuler et helt system, eller alle rør/kanaler, fra tegningen. Mengdene telles fortsatt.',
          'Venstre-pilene foran «Rør» og «Kanaler» folder sammen lista.',
        ],
      },
      {
        title: 'Innstillinger',
        points: [
          'Standardlengder for rør og kanal (brukes til å regne ut antall skjøter).',
          'Automatiske klammer, klammeravstand og gjengestag.',
          'Egne systemkoder, luftpiler på ventiler og skjuling av komponentetiketter.',
        ],
      },
    ],
  },
  {
    id: 'taster',
    label: 'Hurtigtaster',
    blurb: 'De raskeste veiene rundt i programmet.',
    topics: [
      {
        title: 'Verktøy',
        keys: [
          ['V', 'Velg'],
          ['R', 'Tegn sist brukte rør (trykk igjen for å bla)'],
          ['K', 'Tegn sist brukte kanal (trykk igjen for å bla)'],
          ['F', 'Flytt'],
          ['C', 'Kopier'],
          ['D', 'Del'],
          ['T', 'Trim/Forleng'],
          ['J', 'Juster'],
          ['A', 'Mål avstand'],
        ],
      },
      {
        title: 'Mens du tegner',
        keys: [
          ['Enter', 'Avslutt strekningen'],
          ['Esc', 'Avbryt / tilbake til Velg'],
          ['Backspace', 'Angre siste punkt'],
          ['Shift', 'Tegn med fri vinkel'],
          ['0–9', 'Skriv eksakt lengde i mm'],
          ['Tab', 'Bytt mellom lengde og vinkel'],
        ],
      },
      {
        title: 'Generelt',
        keys: [
          ['Ctrl+Z', 'Angre'],
          ['Ctrl+Y', 'Gjør om'],
          ['Delete', 'Slett det som er merket'],
          ['Piltaster', 'Flytt det som er merket (Shift = lengre hopp)'],
          ['Mellomrom + dra', 'Flytt utsnittet'],
          ['Musehjul', 'Zoom'],
        ],
      },
    ],
  },
];
