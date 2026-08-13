import Link from "next/link";
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  FAQ,
  H3,
  JsonLd,
  RelatedPages,
  Table,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import {
  type FaqItem,
  breadcrumbJsonLd,
  counterparts,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/nl/vergelijk/excel" as const;

export const metadata = pageMetadata(SLUG);

const CONTENTS: TocItem[] = [
  { id: "waar-excel-wint", label: "Waar Excel beter is" },
  { id: "waar-dit-wint", label: "Waar deze wint" },
  { id: "nederlandse-excel", label: "Nederlandse Excel" },
  { id: "naast-elkaar", label: "Naast elkaar" },
  { id: "excel-houden", label: "Wanneer je Excel houdt" },
  { id: "vragen", label: "Vragen die het eerst komen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Ondersteunt Tougather VERT.ZOEKEN en X.ZOEKEN?",
    answer:
      "Allebei, maar onder hun Engelse naam: je typt VLOOKUP en XLOOKUP. Verder zitten INDEX, MATCH, XMATCH, HLOOKUP, SUMIF (SOM.ALS), COUNTIF (AANTAL.ALS), SUMIFS, COUNTIFS, IFERROR en IFNA (ALS.NB) erin — 167 functies in totaal, waarvan 11 financieel en 15 statistisch. Negen namen ontbreken met opzet en zeggen dat ook als je ze typt: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET en VBA.",
  },
  {
    question: "Ziet mijn xlsx-bestand er na importeren hetzelfde uit?",
    answer:
      "Nee. De import leest celwaarden, plus de datumopmaak uit styles.xml zodat datumgetallen weer datums worden. Formules leest hij niet, en voorwaardelijke opmaak, grafieken, draaitabellen en macro's evenmin. Een cel met =B2*C2 komt binnen als het getal dat er het laatst uit kwam.",
  },
  {
    question: "Hoe groot mag een spreadsheet in Tougather zijn?",
    answer:
      "Vijftigduizend rijen is gemeten en comfortabel: 3,4 MB opgeslagen, 0,56 seconde om te openen, 118 milliseconden tussen aanslag en scherm. Bij honderdduizend rijen is de werkruimte 6,8 MB en weigert de browser de opslag, en dan verschijnt er een balk die zegt dat je werk niet meer bewaard wordt. Excel doet ruim een miljoen rijen per blad.",
  },
  {
    question: "Kan ik Excel blijven gebruiken naast Tougather?",
    answer:
      "Ja, en voor sommig werk moet je dat ook. Exporteer een tabel naar .xlsx of csv zodra je iets nodig hebt dat alleen Excel kan. Eén kanttekening: een formulekolom gaat het bestand in als de getallen die eruit kwamen, dus je geeft waarden door en geen levend model.",
  },
];

const COLUMNS = ["", "Excel", "Tougather"];

const ROWS = [
  ["Functies", "Meer, en er komen er bij", "167 in één bibliotheek, Engelse namen"],
  [
    "Macro's en VBA",
    "Een complete scripttaal",
    "Niets. Er draait hier niets dat ze uitvoert",
  ],
  [
    "Overlopende matrices",
    "UNIQUE, SORT, FILTER, TRANSPOSE",
    "Geen spill-model. Gebruik een draaitabel of SUMIFS",
  ],
  [
    "Vluchtige functies",
    "Rekenen uit zichzelf opnieuw",
    "Geen enkele. NOW wordt gelezen als het blad rekent",
  ],
  [
    "INDIRECT en OFFSET",
    "Allebei",
    "Geen van beide. INDEX met een bereik dekt het meeste",
  ],
  [
    "Rijen in één blad",
    "Ruim een miljoen",
    "50.000 gemeten comfortabel; bij 100.000 weigert de opslag",
  ],
  [
    "Formules in een xlsx",
    "Gaan heen en terug mee",
    "Alleen waarden, allebei de kanten op",
  ],
  [
    "Draaitabellen",
    "Slicers, externe bronnen, momentopnames",
    "7 aggregaties, 5 datumgroepen, elke keer opnieuw afgeleid",
  ],
  [
    "Eén formule voor een kolom",
    "Doortrekken, één kopie per rij",
    "Een regel op de kolom; per cel mag ook",
  ],
  [
    "Puntkomma in een formule",
    "Standaard in een Nederlandse Excel",
    "Wordt geaccepteerd, naast de komma",
  ],
  [
    "Cel die de regel breekt",
    "Validatie weigert de invoer",
    "De waarde blijft staan en wordt gemarkeerd",
  ],
  [
    "Prijs",
    "Onderdeel van Microsoft 365, per persoon",
    "€0, €14 per maand of €24 per zetel",
  ],
];

export default function VergelijkExcelPage() {
  const entry = page(SLUG);
  const en = counterparts(SLUG).en;

  return (
    <PageShell
      lang="nl"
      eyebrow="Vergelijken"
      title={entry.h1}
      lead="Excel is de diepste spreadsheet die er is. Dit zijn 167 functies in een browsertabblad, midden in een document. Hieronder staat waar dat verschil echt zit — gemeten en niet geschat — en de kortere lijst met punten waar de ruil de andere kant op valt."
    >
      <JsonLd data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]} />
      <Breadcrumbs slug={SLUG} />

      <p className="-mt-4 mb-2 text-[12.5px] text-fg-subtle">
        <Link
          href={en.slug}
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Takeaway title="Het korte antwoord">
        Bouw je financiële modellen, dan houd je Excel. Een model draait op
        scenarioschakelaars, op matrices die zichzelf uitvouwen en op een blad
        dat uit zichzelf herrekent, en die machinerie zit hier niet. Dit vervangt
        de andere spreadsheet: de tabel die in een document thuishoort, waarvan
        de cijfers in een grafiek, een alinea en een slide belanden die uit
        elkaar gaan lopen.
      </Takeaway>

      <Contents slug={SLUG} items={CONTENTS} />

      <H2 id="waar-excel-wint">Waar Excel beter is</H2>
      <P>
        Een vergelijking waarin de ander nergens wint is geen vergelijking maar
        een advertentie. Alles hieronder komt uit de code.
      </P>

      <H3>Negen functies die er met opzet niet zijn</H3>
      <P>
        De bibliotheek telt 167 functies uit twee bestanden. Negen namen
        ontbreken bewust, en wie er eentje typt krijgt de reden te zien in plaats
        van een kaal <code>#NAME?</code> — in de formule-editor van een kolom
        voordat je hem uitvoert, en in de foutmelding zelf als je er een in een
        cel typt. RAND en RANDBETWEEN: een cel die bij elke
        weergave verandert valt niet te vergelijken met wat er een seconde eerder
        stond. UNIQUE, SORT, FILTER en TRANSPOSE: die lopen over in cellen die je
        niet geselecteerd hebt, en dat spill-model bestaat hier niet. INDIRECT en
        OFFSET: allebei bouwen ze tijdens het rekenen een verwijzing uit tekst
        op, waardoor de cyclusbewaking de afhankelijkheden niet meer ziet.
      </P>
      <P>
        Er is ook geen model voor vluchtige functies, en dat gat is groter dan
        negen namen doen vermoeden. NOW zit er wel in, maar wordt één keer
        gelezen op het moment dat het blad rekent en tikt niet door. Niets
        herrekent hier op een klok.
      </P>

      <H3>Macro&apos;s en VBA</H3>
      <P>
        Er zijn geen macro&apos;s. De reden staat in één regel code: wat een
        macro meestal automatiseert — doe dit voor elke rij — is precies wat een
        formulekolom al is. Dat klopt voor het gangbare geval en dekt verder
        niets. Een knop die een rapport opbouwt, een invoegtoepassing naar een
        intern systeem, een formulier dat iemand van de administratie jaren
        geleden bouwde: echt werk dat Excel doet, en hier draait niets het.
        Eindigt je bestand op <code>.xlsm</code>, dan hoort het niet hier.
      </P>

      <H3>Vijftigduizend rijen, en wat er daarna gebeurt</H3>
      <P>
        De grens is met een script gemeten en niet geschat. Vijftigduizend rijen
        is 3,4 MB, opent in 0,56 seconde en zet een aanslag na 118 milliseconden
        op het scherm. Bij honderdduizend rijen is de werkruimte 6,8 MB en
        weigert de browser de opslag ronduit: de ruimte die hij een pagina geeft
        is vol.
      </P>
      <P>
        Wélk onderdeel het begeeft, doet ertoe. Tekenen en scrollen gaan bij
        vijftigduizend rijen prima, en de adresparser slikt drie kolomletters en
        zeven rijcijfers, dus adressering was nooit de beperking. Opslag is dat
        wel, en dat is de prijs van werk dat in je eigen browser blijft. Wordt
        een schrijfactie geweigerd, dan komt er een balk over de app die zegt dat
        wat je ziet niet meer bewaard wordt. Excel doet ruim een miljoen rijen
        per blad.
      </P>

      <H3>Formules overleven het bestand niet</H3>
      <P>
        Dit punt kost de meeste mensen geld en wordt het vaakst gemist. De
        xlsx-import leest celwaarden, plus de datumopmaak uit{" "}
        <code>styles.xml</code> zodat datumgetallen weer datums worden. Het
        formule-element leest hij niet. De export gaat dezelfde kant op: een
        formulekolom wordt weggeschreven als de getallen die eruit kwamen. Dus{" "}
        <code>=B2*C2</code> gaat erin als 4200 en komt eruit als 4200, en wat je
        doorgeeft zijn waarden en geen werkend model.
      </P>

      <H3>Een financieel model hoort in Excel</H3>
      <P>
        Gewoon hardop: wie een financieel model bouwt, blijft bij Excel.
        Zo&apos;n model draait op scenarioschakelaars, op een herrekenlus en op
        invoegtoepassingen, en het wordt nagekeken door mensen die het in Excel
        openen en de formules erin verwachten. De elf financiële functies hier —
        PMT, FV, PV, NPER, RATE, NPV, IRR, SLN, SYD, EFFECT en NOMINAL — doen een
        aflossingsschema. Ze doen geen model.
      </P>

      <H2 id="waar-dit-wint">Waar deze wint</H2>

      <H3>Een formule is een regel over een kolom</H3>
      <P>
        In Excel is een kolom formules duizend kopieën van één idee, en de leuke
        fouten zitten in die vier rijen waar iemand een kopie aanpaste. Hier
        draagt de kolom de formule en rekent elke rij hem uit tegen zijn eigen
        waarden. Per cel werkt ook — typ <code>=B2*C2</code> in een cel en het
        rekent — en waar allebei bestaan wint de kolom, want een regel die elke
        losse cel mag overrulen is geen regel. Doortrekken werkt zoals je gewend
        bent: <code>=B$2*$C2</code> houdt overal de helften vast die jij hebt
        vastgezet, en de herschrijving gaat over je eigen brontekst, dus spaties
        en hoofdletters blijven staan.
      </P>

      <H3>Elke tabel is een blad</H3>
      <P>
        Er is geen apart werkmapbestand: elke tabel in een project is al als blad
        aanspreekbaar via zijn titel. <code>Costs!B2:B40</code> en{" "}
        <code>[Costs]![Amount]</code> werken allebei, en twee tabellen met
        dezelfde titel worden genummerd in plaats van dat er een muntje wordt
        opgegooid. Een cel die wordt opgevraagd terwijl hij al rekent geeft{" "}
        <code>#CYCLE!</code> terug in plaats van je tabblad te laten hangen.
      </P>

      <H3>Draaitabellen die niet kunnen verouderen</H3>
      <P>
        Een draaitabel is hier een tabelblok met een specificatie, dat bij elke
        weergave opnieuw uit de bron wordt afgeleid. Zeven aggregaties, vijf
        datumgroepen — dag, week, maand, kwartaal, jaar — en desgewenst
        totaalregels. Omdat het een tabel is, werken sorteren, grafieken en
        export naar .docx en .xlsx er meteen op. De keerzijde: geen slicers, geen
        externe bronnen, geen momentopname die je bevriest.
      </P>
      <P>
        Validatie werkt precies andersom dan in Excel. Verplicht, getal, datum,
        e-mail, url, grenzen, lengte, uniek en een vrije formule over de rij
        bestaan allemaal, maar een cel die de regel breekt blijft staan en wordt
        gemarkeerd — een regel die typewerk weggooit kost je werk op de dag dat
        de regel zelf niet klopt.
      </P>

      <H2 id="nederlandse-excel">Nederlandse Excel</H2>
      <P>
        Excel vertaalt zijn functienamen mee met je taalinstelling; hier gebeurt
        dat niet. Je typt SUM, IF en VLOOKUP, niet SOM, ALS en VERT.ZOEKEN — en
        SUMIF in plaats van SOM.ALS, COUNTIF in plaats van AANTAL.ALS. Om
        dezelfde reden zijn de foutcodes Engels: <code>#N/A</code> en{" "}
        <code>#DIV/0!</code>. Beide namenlijsten staan naast elkaar in{" "}
        <Link
          href="/nl/gidsen/formules"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          de 20 formules die je echt gebruikt
        </Link>
        .
      </P>
      <P>
        Twee dingen zijn wél op je toetsenbord afgestemd. De puntkomma tussen
        argumenten wordt geaccepteerd naast de komma, met die reden erbij in de
        code: dat is wat een Nederlandse of Duitse Excel schrijft. En de
        csv-lezer raadt het scheidingsteken zelf, over komma, puntkomma, tab en
        pipe — wat je meteen merkt bij een export uit een Nederlandse Excel, want
        die zet er puntkomma&apos;s in. Wat níet meebuigt is het decimaalteken:{" "}
        <code>=1.5*B2</code> rekent, <code>=1,5*B2</code> niet, want daar is de
        komma het scheidingsteken.
      </P>

      <H2 id="naast-elkaar">Naast elkaar</H2>
      <P>
        Acht van deze twaalf regels gaan naar Excel, en dat is de eerlijke vorm
        van een spreadsheetvergelijking tegen dé spreadsheet. De rest van het
        kantoorpakket staat in{" "}
        <Link
          href="/nl/vergelijk/microsoft-365"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          de volledige Microsoft 365-vergelijking
        </Link>
        , en{" "}
        <Link
          href="/nl/vergelijk/google-workspace"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          hoe Google Spreadsheets zich verhoudt
        </Link>{" "}
        is het nauwere gevecht.
      </P>
      <Table
        caption="Excel en Tougather op de twaalf punten waar je het eerst naar kijkt."
        columns={COLUMNS}
        rows={ROWS}
        minWidth={640}
      />

      <H2 id="excel-houden">Wanneer je Excel houdt</H2>
      <P>
        Blijf bij Excel als je werkmap macro&apos;s draait, als je voorbij
        vijftigduizend rijen werkt, als je modellen bouwt, als je op overlopende
        matrices of INDIRECT leunt, of als het bestand naar iemand gaat die het
        in Excel opent en de formules erin verwacht. Dat zijn geen gaten waar
        stilletjes aan gewerkt wordt: ze volgen uit een spreadsheet die in een
        document zit, in je eigen browser.
      </P>
      <P>
        Dit is voor de andere spreadsheet: de begroting, de resultatentabel, de
        antwoorden uit een enquête. Cijfers die bij een document horen en niet
        bij een werkmap, waar de echte kosten zitten in drie kopieën — tabel,
        grafiek en slide — die vanaf maart niet meer hetzelfde zeggen. Een
        grafiek bewaart hier het id van de tabel waaruit hij leest, en dat is de
        hele reden dat het blad ín het document staat. Verder kijken kan bij{" "}
        <Link
          href="/nl/vergelijk"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          alle vergelijkingen op een rij
        </Link>
        .
      </P>

      <H2 id="vragen">Vragen die het eerst komen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Open een blad">
        Geen login, niets om op te zeggen. Plak er een csv in die je al hebt, typ{" "}
        <code>=B2*C2</code> in een cel, en kijk of die 167 dekt waar jij in de
        praktijk naar grijpt.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
