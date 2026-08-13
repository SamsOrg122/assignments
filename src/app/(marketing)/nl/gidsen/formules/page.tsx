import Link from "next/link";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  FAQ,
  JsonLd,
  RelatedPages,
  Table,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import { H2, List, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/nl/gidsen/formules" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "de-tabel", label: "De tabel waarop deze voorbeelden draaien" },
  { id: "namen", label: "Nederlandse en Engelse formulenamen naast elkaar" },
  { id: "som", label: "SOM (SUM) en GEMIDDELDE (AVERAGE)" },
  { id: "som-als", label: "SOM.ALS (SUMIF) en SOMMEN.ALS (SUMIFS)" },
  { id: "aantal-als", label: "AANTAL.ALS (COUNTIF) en AANTALLEN.ALS (COUNTIFS)" },
  { id: "als", label: "ALS (IF), ALS.VOORWAARDEN (IFS) en ALS.FOUT (IFERROR)" },
  { id: "vert-zoeken", label: "VERT.ZOEKEN (VLOOKUP) en X.ZOEKEN (XLOOKUP)" },
  { id: "index-vergelijken", label: "INDEX en VERGELIJKEN (MATCH)" },
  { id: "tekst", label: "TEKST (TEXT)" },
  { id: "datums", label: "De datumfuncties" },
  { id: "bet-nhw", label: "BET (PMT) en NHW (NPV)" },
  { id: "correlatie", label: "CORRELATIE (CORREL)" },
  { id: "ontbreekt", label: "Wat er bewust niet is" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Wat is het verschil tussen VERT.ZOEKEN en X.ZOEKEN?",
    answer:
      "X.ZOEKEN krijgt de kolom waarin je zoekt en de kolom die je terug wilt als twee losse argumenten, dus er wordt niets geteld en een ingevoegde kolom breekt niets. Het vierde argument is de waarde voor als er niets gevonden wordt. VERT.ZOEKEN telt kolommen binnen één rechthoek en kijkt alleen naar rechts. Hier zoeken ze allebei altijd exact.",
  },
  {
    question: "Waarom krijg ik #VERW! of #N/B in beeld?",
    answer:
      "#VERW! betekent dat het adres buiten de tabel valt, of naar een tabel wijst die dit project niet heeft. #N/B betekent dat een zoekopdracht wel liep maar niets vond. Let op: Tougather toont de Engelse codes, dus je ziet #REF! en #N/A staan. Zet ALS.NB — hier IFNA — om de zoekopdracht heen, of geef XLOOKUP een vierde argument.",
  },
  {
    question: "Hoe tel ik alleen bepaalde rijen op?",
    answer:
      "Met SOM.ALS voor één voorwaarde en SOMMEN.ALS voor meerdere, hier geschreven als SUMIF en SUMIFS. Let op de volgorde, want die draait om: bij SUMIF komt het bereik dat je optelt als laatste, bij SUMIFS als eerste. Voorwaarden zijn gewone tekst en werken ook op datums.",
  },
  {
    question: "Waarom heten Excel-formules in het Nederlands anders?",
    answer:
      "Excel vertaalt functienamen mee met de taalinstelling: SUM wordt SOM, IF wordt ALS, VLOOKUP wordt VERT.ZOEKEN. Het bestand verandert niet, alleen wat je ziet, dus een formule uit een Engelse handleiding werkt pas na vertaling. Tougather houdt één set namen aan, de Engelse.",
  },
  {
    question: "Werken Excel-formules ook in Tougather?",
    answer:
      "Grotendeels. Er zijn 167 functies. Je typt de Engelse naam — SOM en VERT.ZOEKEN geven #NAME? — maar de puntkomma tussen argumenten mag gewoon. De decimale komma niet: 0,06 leest de parser als twee argumenten, en dat levert een verkeerd getal op in plaats van een foutmelding. Negen functies ontbreken met opgaaf van reden: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET en macro's.",
  },
];

/** De inline link van deze repo, zodat elke tekstlink er hetzelfde uitziet. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
    >
      {children}
    </Link>
  );
}

/** Code in een zin. `children` is een string-prop, dus aanhalingstekens
 *  hoeven niet ontsnapt te worden. */
function C({ children }: { children: string }) {
  return <code className="font-mono text-[13.5px] text-fg">{children}</code>;
}

/** Eén uitgewerkt voorbeeld: de formule, en wat er echt uit kwam. */
function Fx({ code, is }: { code: string; is: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-line bg-surface px-3.5 py-3">
      <pre className="font-mono text-[12.5px] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
      <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-fg-subtle">
        {is}
      </p>
    </div>
  );
}

export default function FormulesGidsPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Gids"
      title={page(SLUG).h1}
      lead="Twintig functies, elk met een voorbeeld dat echt gedraaid heeft: de formule, en eronder het getal dat eruit kwam. Met de Nederlandse Excel-naam erbij, en met de twee gewoontes uit het Nederlandse Excel die hier niet werken."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/guides/spreadsheet-formulas"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        De puntkomma tussen argumenten mag, de decimale komma niet:{" "}
        <C>0,06</C> wordt gelezen als twee argumenten en geeft een verkeerd
        getal zonder foutmelding. Functienamen typ je in het Engels, kolomnamen
        mogen Nederlands. En rij 1 van een adres is de eerste rij{" "}
        <em>gegevens</em>, dus acht orders zijn <C>E1:E8</C> en niet{" "}
        <C>E2:E9</C>. Zie ook <A href="/nl/gidsen">de rest van onze gidsen</A>.
      </Takeaway>

      <H2 id="de-tabel">De tabel waarop deze voorbeelden draaien</H2>
      <P>
        Eén project, twee tabellen. Elke formule hieronder is tegen precies
        deze gegevens uitgevoerd, en de regel eronder is wat er terugkwam —
        ook bij de ene die iets anders teruggeeft dan je verwacht.
      </P>
      <Table
        caption="Verkoop. Acht rijen, vijf kolommen, geadresseerd als A tot en met E."
        columns={["Rij", "Datum", "Regio", "Pakket", "Plekken", "Bedrag"]}
        minWidth={620}
        rows={[
          ["1", "2026-01-14", "NL", "Basic", "3", "120"],
          ["2", "2026-01-28", "BE", "Pro", "1", "240"],
          ["3", "2026-02-11", "NL", "Pro", "2", "480"],
          ["4", "2026-02-25", "DE", "Team", "4", "960"],
          ["5", "2026-03-09", "NL", "Basic", "5", "200"],
          ["6", "2026-03-23", "BE", "Team", "2", "480"],
          ["7", "2026-04-07", "NL", "Pro", "1", "240"],
          ["8", "2026-04-21", "DE", "Basic", "6", "240"],
        ]}
      />
      <Table
        caption="Pakketten. Een tweede tabel in hetzelfde project, aan te spreken als Pakketten."
        columns={["Rij", "Pakket", "Prijs", "Credits"]}
        minWidth={460}
        rows={[
          ["1", "Basic", "0", "200"],
          ["2", "Pro", "14", "3000"],
          ["3", "Team", "24", "6000"],
        ]}
      />
      <List
        items={[
          <>
            <strong className="font-medium text-fg">Geen kopregel.</strong> De
            naam van een kolom hoort bij de kolom en staat niet in rij 1, dus{" "}
            <C>A1</C> is de eerste order en alle acht zijn <C>A1:A8</C>.
          </>,
          <>
            <strong className="font-medium text-fg">
              Puntkomma mag, komma in een getal niet.
            </strong>{" "}
            <C>SUM(E1:E8; D1:D8)</C> werkt. Maar <C>0,06</C> wordt gelezen als
            de argumenten <C>0</C> en <C>06</C>, dus{" "}
            <C>PMT(0,06/12; 60; 12000)</C> geeft -24120 in plaats van -231.99.
            Om dezelfde reden staat er in elke uitkomst hieronder een punt: zo
            schrijft het blad ze.
          </>,
          <>
            <strong className="font-medium text-fg">
              Een kolomverwijzing betekent twee dingen.
            </strong>{" "}
            In <C>[Bedrag] * 2</C> is het de cel van deze rij, in{" "}
            <C>SUM([Bedrag])</C> de hele kolom. Kolomnamen zijn van jou, dus{" "}
            <C>[Bedrag]</C> en <C>[Regio]</C> mogen Nederlands blijven.
          </>,
          <>
            <strong className="font-medium text-fg">
              Elke tabel is een blad.
            </strong>{" "}
            <C>Pakketten!A1:C3</C> is een rechthoek in de andere tabel,{" "}
            <C>[Pakketten]![Prijs]</C> een hele kolom ervan. Geen import, geen
            kopie.
          </>,
        ]}
      />

      <H2 id="namen">Nederlandse en Engelse formulenamen naast elkaar</H2>
      <P>
        Excel vertaalt functienamen mee met je taalinstelling. Daarom kun je
        een formule van een Engelstalig forum niet zomaar plakken. Hier is er
        één set namen, de Engelse, dus de middelste kolom is wat je typt.
      </P>
      <Table
        caption="De namen die het vaakst worden opgezocht."
        columns={["Nederlands (Excel)", "Engels (hier)", "Waarvoor"]}
        minWidth={600}
        rows={[
          ["SOM", "SUM", "Optellen"],
          ["GEMIDDELDE", "AVERAGE", "Gemiddelde"],
          ["AANTAL / AANTALARG", "COUNT / COUNTA", "Tellen"],
          ["AFRONDEN", "ROUND", "Afronden"],
          ["SOM.ALS / SOMMEN.ALS", "SUMIF / SUMIFS", "Optellen met voorwaarden"],
          ["AANTAL.ALS / AANTALLEN.ALS", "COUNTIF / COUNTIFS", "Tellen met voorwaarden"],
          ["ALS", "IF", "Als dit, dan dat"],
          ["ALS.VOORWAARDEN", "IFS", "Gevallen op volgorde"],
          ["ALS.FOUT / ALS.NB", "IFERROR / IFNA", "Fout opvangen"],
          ["EN / OF / NIET", "AND / OR / NOT", "Voorwaarden combineren"],
          ["VERT.ZOEKEN", "VLOOKUP", "Verticaal zoeken"],
          ["HORIZ.ZOEKEN", "HLOOKUP", "Horizontaal zoeken"],
          ["X.ZOEKEN", "XLOOKUP", "Zoeken in elke richting"],
          ["VERGELIJKEN", "MATCH", "Positie"],
          ["INDEX", "INDEX", "Waarde op een positie"],
          ["TEKST", "TEXT", "Getal naar tekst"],
          ["LINKS / RECHTS / DEEL", "LEFT / RIGHT / MID", "Stuk tekst"],
          ["LENGTE / SPATIES.WISSEN", "LEN / TRIM", "Tekens, spaties"],
          ["VANDAAG", "TODAY", "Vandaag"],
          ["JAAR / MAAND / DAG", "YEAR / MONTH / DAY", "Delen van een datum"],
          ["DAGEN", "DAYS", "Dagen ertussen"],
          ["LAATSTE.DAG", "EOMONTH", "Laatste dag van de maand"],
          ["ZELFDE.DAG", "EDATE", "n maanden later"],
          ["NETTO.WERKDAGEN / WERKDAG", "NETWORKDAYS / WORKDAY", "Werkdagen"],
          ["ISO.WEEKNUMMER", "ISOWEEKNUM", "Weeknummer"],
          ["DATUMVERSCHIL", "DATEDIF", "Verschil in dagen of maanden"],
          ["BET", "PMT", "Termijnbedrag"],
          ["NHW / IR", "NPV / IRR", "Contante waarde, rentabiliteit"],
          ["CORRELATIE", "CORREL", "Samenhang"],
          ["SOMPRODUCT", "SUMPRODUCT", "Vermenigvuldigen en optellen"],
        ]}
      />
      <P>
        Ook de foutcodes blijven Engels: waar Excel <C>#N/B</C>,{" "}
        <C>#VERW!</C> en <C>#DEEL/0!</C> schrijft, staat hier <C>#N/A</C>,{" "}
        <C>#REF!</C> en <C>#DIV/0!</C>. Er is er één bij die Excel niet heeft,{" "}
        <C>#CYCLE!</C>, voor een formule die uiteindelijk om zichzelf vraagt.
      </P>

      <H2 id="som">SOM (SUM) en GEMIDDELDE (AVERAGE)</H2>
      <P>
        Allebei slaan ze lege cellen over en struikelen ze niet over tekst.
        Een gemiddelde over een leeg bereik geeft <C>#DIV/0!</C> en geen nul:
        &ldquo;nog niets&rdquo; en &ldquo;niets verkocht&rdquo; zijn twee
        verschillende uitspraken.
      </P>
      <Fx code={"SUM(E1:E8)"} is={"→ 2960"} />
      <Fx code={"SUM([Bedrag])"} is={"→ 2960 — dezelfde acht cellen, bij naam"} />
      <Fx code={"AVERAGE(E1:E8)"} is={"→ 370"} />

      <H2 id="som-als">SOM.ALS (SUMIF) en SOMMEN.ALS (SUMIFS)</H2>
      <P>
        <C>SUMIF</C> krijgt eerst het bereik dat je toetst, dan de voorwaarde,
        en als laatste het bereik dat je optelt. Bij <C>SUMIFS</C> draait die
        volgorde om: het bereik dat je optelt komt <em>eerst</em>. Die
        omkering is de meest voorkomende reden dat een formule die als{" "}
        <C>SUMIF</C> klopte, als <C>SUMIFS</C> onzin teruggeeft.
      </P>
      <Fx code={'SUMIF(B1:B8; "NL"; E1:E8)'} is={"→ 1040"} />
      <Fx
        code={'SUMIFS(E1:E8; B1:B8; "NL"; C1:C8; "Pro")'}
        is={"→ 720 — de twee Nederlandse Pro-orders"}
      />
      <P>
        Voorwaarden zijn gewone tekst en werken ook op datums, omdat een datum
        als ISO-tekst is opgeslagen en die goed sorteert.
      </P>
      <Fx
        code={'SUMIFS(E1:E8; A1:A8; ">=2026-03-01"; B1:B8; "NL")'}
        is={"→ 440 — vanaf maart, alleen Nederland"}
      />

      <H2 id="aantal-als">AANTAL.ALS (COUNTIF) en AANTALLEN.ALS (COUNTIFS)</H2>
      <P>
        Dezelfde taal voor voorwaarden, maar tellend. <C>*</C> staat voor een
        willekeurig aantal tekens en <C>?</C> voor één; hoofdletters maken niet
        uit.
      </P>
      <Fx code={'COUNTIF(C1:C8; "B*")'} is={"→ 3 — elk pakket dat met een B begint"} />
      <Fx code={'COUNTIFS(B1:B8; "NL"; E1:E8; ">200")'} is={"→ 2"} />

      <H2 id="als">ALS (IF), ALS.VOORWAARDEN (IFS) en ALS.FOUT (IFERROR)</H2>
      <P>
        Argumenten worden lui berekend: een tak die je niet neemt wordt niet
        uitgerekend. Daardoor kan <C>IFERROR</C> een fout opvangen zonder dat
        de hele cel omvalt.
      </P>
      <Fx
        code={'IF([Regio]="NL"; [Bedrag]*21%; 0)'}
        is={"→ 100.8 op rij 3 — een procentteken achteraan deelt door honderd"}
      />
      <P>
        <C>IFS</C> is een rij paren van voorwaarde en antwoord, eerste treffer
        wint. Sluit af met een losse <C>TRUE</C>; zonder dat krijgt een rij die
        nergens op past <C>#N/A</C> in plaats van een lege cel.
      </P>
      <Fx
        code={'IFS([Bedrag]>=500; "groot"; [Bedrag]>=200; "middel"; TRUE; "klein")'}
        is={"→ groot op rij 4, klein op rij 1"}
      />
      <Fx
        code={'IFERROR(VLOOKUP("Goud"; Pakketten!A1:C3; 2); 0)'}
        is={"→ 0 — er is geen pakket Goud"}
      />

      <H2 id="vert-zoeken">VERT.ZOEKEN (VLOOKUP) en X.ZOEKEN (XLOOKUP)</H2>
      <P>
        <C>VLOOKUP</C> zoekt in de eerste kolom van een rechthoek en geeft de
        n-de kolom van de gevonden rij terug. Eén verschil om te onthouden:{" "}
        <strong className="font-medium text-fg">
          het vierde argument wordt aangenomen en genegeerd, en er wordt altijd
          exact gezocht.
        </strong>{" "}
        De truc met een gesorteerde tabel met ondergrenzen, waarmee je in Excel
        een cijfer in een categorie stopt, doet hier dus niets. Gebruik{" "}
        <C>IFS</C>, wat sowieso beter leest.
      </P>
      <Fx
        code={"VLOOKUP([Pakket]; Pakketten!A1:C3; 2)"}
        is={"→ 14 op rij 3 — de prijs van Pro"}
      />
      <P>
        <C>XLOOKUP</C> krijgt de kolom waarin je zoekt en de kolom die je terug
        wilt als twee losse argumenten. Er wordt niets geteld, dus een
        ingevoegde kolom breekt niets, en het vierde argument is de waarde voor
        als er niets gevonden wordt. Dat scheelt de <C>IFNA</C> eromheen.
      </P>
      <Fx
        code={'XLOOKUP("Goud"; Pakketten!A1:A3; Pakketten!B1:B3; 0)'}
        is={"→ 0 — geen treffer, geen #N/A, geen IFNA nodig"}
      />

      <H2 id="index-vergelijken">INDEX en VERGELIJKEN (MATCH)</H2>
      <P>
        <C>MATCH</C> geeft de positie van een waarde, <C>INDEX</C> de waarde op
        een positie. Samen doen ze wat <C>XLOOKUP</C> doet, in de vorm van voor
        <C>XLOOKUP</C>.
      </P>
      <Fx
        code={'INDEX(Pakketten!C1:C3; MATCH("Pro"; Pakketten!A1:A3))'}
        is={"→ 3000 — de credits bij het Pro-pakket"}
      />
      <P>
        Hier zit het enige voorbeeld op deze pagina dat een geloofwaardig
        verkeerd getal teruggeeft in plaats van een foutmelding.{" "}
        <C>INDEX</C> neemt één positie over een bereik dat rij voor rij wordt
        gelezen; de tweedimensionale vorm van Excel bestaat niet.
      </P>
      <Fx
        code={"INDEX(Pakketten!A1:C3; 2; 2)"}
        is={"→ 0 — en niet 14, want positie 2 van de platgeslagen rechthoek"}
      />
      <P>
        Geef <C>INDEX</C> dus één kolom en één positie. <C>MATCH</C> neemt
        eveneens twee argumenten en zoekt altijd exact, dus een geplakte{" "}
        <C>MATCH(x; bereik; 0)</C> klopt en een geplakte{" "}
        <C>MATCH(x; bereik; 1)</C> is stilletjes niet meer benaderend.
      </P>

      <H2 id="tekst">TEKST (TEXT)</H2>
      <P>
        <C>TEXT</C> maakt van een getal tekst in een opgegeven opmaak. Dit is
        de tweede plek waar je Nederlandse gewoonte niet werkt:{" "}
        <strong className="font-medium text-fg">
          TEXT rekent altijd met de Engelse schrijfwijze
        </strong>{" "}
        — punt als decimaalteken, komma voor duizendtallen. Een Nederlands
        patroon als <C>&quot;#.##0,00&quot;</C> wordt gelezen alsof je nul
        decimalen vraagt en geeft <C>2,960</C>.
      </P>
      <Fx code={'TEXT(SUM(E1:E8); "#,##0.00")'} is={"→ 2,960.00"} />
      <P>
        Wil je het toch Nederlands, draai de twee tekens dan zelf om — via een
        derde teken, anders overschrijf je je eigen resultaat. Verder dekt het
        patroon drie dingen: decimalen, duizendtalscheiding en procenten. Geen
        datumopmaak, geen valutatekens, geen kleuren.
      </P>
      <Fx
        code={
          'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(TEXT(SUM(E1:E8); "#,##0.00"); ","; "|"); "."; ","); "|"; ".")'
        }
        is={"→ 2.960,00"}
      />

      <H2 id="datums">De datumfuncties</H2>
      <P>
        Datums zijn ISO-tekst — <C>2026-01-14</C> — omdat een datumkolom dat
        opslaat, het als tekst goed sorteert, en een rondje door JSON de dag
        niet verschuift door een tijdzone. Een dubbelzinnige datum wordt
        geweigerd in plaats van geraden, en dat raakt je hier direct:{" "}
        <C>DATEVALUE(&quot;14-01-2026&quot;)</C> geeft <C>#VALUE!</C> met de
        reden erbij, want die tekst kan dag-eerst of maand-eerst zijn. Schrijf{" "}
        <C>2026-01-14</C>.
      </P>
      <Table
        caption="Gedraaid op de tabel Verkoop. A1 is 2026-01-14, A8 is 2026-04-21."
        columns={["Formule", "Resultaat"]}
        minWidth={520}
        rows={[
          ["DAYS(A8; A1)", "97 kalenderdagen"],
          ["NETWORKDAYS(A1; A8)", "70 werkdagen, weekenden eruit"],
          [
            'NETWORKDAYS("2026-01-01"; "2026-01-31"; "2026-01-01")',
            "21 — het derde argument zijn feestdagen",
          ],
          ["WORKDAY(A1; 10)", "2026-01-28"],
          [
            "EOMONTH(A1; 0)",
            "2026-01-31 — en het klemt af: 31 januari plus een maand is 2026-02-28",
          ],
          ["EDATE(A1; 3)", "2026-04-14"],
          ['DATEDIF(A1; A8; "M")', "3 hele maanden. Alleen D, M of Y"],
          ["ISOWEEKNUM(A1)", "3 — het weeknummer dat de salarisadministratie bedoelt"],
          ["YEAR(A1)", "2026. MONTH en DAY werken net zo"],
          ["TODAY()", "De dag waarop het blad is doorgerekend, geen tikkende klok"],
        ]}
      />

      <H2 id="bet-nhw">BET (PMT) en NHW (NPV)</H2>
      <P>
        <C>PMT</C> is het termijnbedrag van een lening. De rente is per periode
        en niet per jaar, dus 6% per jaar bij maandbetaling is{" "}
        <C>0.06/12</C> — met een punt, want een komma splitst het argument. De
        uitkomst is negatief omdat het geld dat weggaat.
      </P>
      <Fx
        code={"ROUND(PMT(0.06/12; 60; 12000); 2)"}
        is={"→ -231.99 per maand op 12.000 in vijf jaar; -230.84 bij vooruitbetaling"}
      />
      <P>
        <C>NPV</C> verdisconteert een reeks kasstromen, en{" "}
        <strong className="font-medium text-fg">
          de eerste stroom die je meegeeft wordt één periode verdisconteerd
        </strong>
        , dus een bedrag dat je vandaag betaalt hoort er buiten. Doe je dat
        niet, dan verdisconteer je een investering een periode te veel en ziet
        elk project er beter uit dan het is. Elf financiële functies in totaal,
        waaronder <C>FV</C>, <C>PV</C>, <C>NPER</C>, <C>RATE</C> en{" "}
        <C>IRR</C>.
      </P>
      <Fx
        code={"ROUND(NPV(0.1; 3000; 4200; 6800) - 10000; 2)"}
        is={"→ 1307.29 — de 10.000 van vandaag staat erbuiten"}
      />

      <H2 id="correlatie">CORRELATIE (CORREL)</H2>
      <P>
        <C>CORREL</C> geeft de samenhang tussen twee reeksen, van -1 tot 1. Er
        zijn minstens twee paren nodig, het langere bereik wordt afgekapt op
        het kortere, en je krijgt <C>#DIV/0!</C> als een van beide nooit
        verandert. <C>SLOPE</C>, <C>INTERCEPT</C>, <C>FORECAST</C> en{" "}
        <C>RSQ</C> nemen hetzelfde paar bereiken.
      </P>
      <Fx
        code={"ROUND(CORREL(D1:D8; E1:E8); 3)"}
        is={"→ 0.046 — plekken en omzet bewegen nauwelijks samen"}
      />
      <Fx
        code={"ROUND(CORREL(Pakketten!B1:B3; Pakketten!C1:C3); 3)"}
        is={"→ 0.993 — prijs en inbegrepen credits lopen bijna gelijk op"}
      />
      <P>
        Dat eerste getal is het nuttigst juist omdat het saai is: het aantal
        plekken zegt bijna niets over het bedrag, want het pakket bepaalt de
        prijs. Eén formule, en een grafiek die je later niet hoeft uit te
        leggen.
      </P>

      <H2 id="ontbreekt">Wat er bewust niet is</H2>
      <P>
        Er zijn 167 functies. Negen ontbreken met opzet, en je hoort welke:
        de formule-editor van een kolom zegt het voordat je iets uitvoert, en
        een naam die je in een cel typt komt terug met de reden in plaats van
        een kaal <C>#NAME?</C> — horen dat iets bewust is weggelaten leest
        anders dan vermoeden dat je het verkeerd spelde.
      </P>
      <Table
        caption="Waar Excel iets doet wat dit niet doet. Excel wint elke rij."
        columns={["Excel", "Hier", "Waarom"]}
        minWidth={640}
        rows={[
          [
            "ASELECT, ASELECTTUSSEN",
            "Afwezig.",
            "Een cel die bij elke weergave verandert, valt niet te vergelijken met wat hij een seconde eerder zei.",
          ],
          [
            "UNIEK, SORTEREN, FILTEREN, TRANSPONEREN",
            "Afwezig.",
            "Ze schrijven in cellen die je niet selecteerde. Dat vraagt een overloopmodel, en een half model is erger dan geen.",
          ],
          [
            "INDIRECT, VERSCHUIVING",
            "Afwezig.",
            "Ze bouwen een verwijzing uit tekst tijdens het rekenen, dus de cyclusbewaking ziet de afhankelijkheden niet vooraf.",
          ],
          [
            "Macro's en VBA",
            "Afwezig.",
            "Wat een macro automatiseert — herhaal dit over elke rij — is wat een formulekolom al is.",
          ],
          [
            "INDEX met rij en kolom",
            "Eén positie.",
            "Staat er niet bij. Je krijgt de verkeerde cel in plaats van een fout.",
          ],
          [
            "Benaderend VERT.ZOEKEN en VERGELIJKEN",
            "Altijd exact.",
            "Staat er niet bij. Het extra argument wordt genegeerd.",
          ],
          [
            "Nederlandse namen, decimale komma",
            "Engelse namen, punt.",
            "Staat er niet bij. De puntkomma tussen argumenten mag wel.",
          ],
          [
            "Een miljoen rijen per blad",
            "Ongeveer 50.000 comfortabel.",
            "Bij 100.000 weigert de browseropslag de schrijfactie.",
          ],
        ]}
      />
      <P>
        Een formulekolom mag naar een andere verwijzen; een cel waar om
        gevraagd wordt terwijl hij al berekend wordt geeft <C>#CYCLE!</C> in
        plaats van je tabblad te laten hangen, en die bewaking kan alleen
        eerlijk zijn omdat <C>INDIRECT</C> ontbreekt. De volledige vergelijking
        staat op{" "}
        <A href="/nl/vergelijk/excel">hoe dit zich verhoudt tot Excel</A>, en
        verder staan{" "}
        <A href="/nl/gidsen/scriptie-schrijven">
          formules in je scriptieresultaten
        </A>{" "}
        en <A href="/nl/gidsen/pitch-deck">de cijfers achter een pitch deck</A>{" "}
        klaar.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Een spreadsheet openen">
        Plak een CSV of een xlsx-bestand erin, zet een van deze formules op de
        kolom in plaats van in een cel, en dezelfde uitdrukking loopt over elke
        rij. Daar had je anders een macro voor nodig gehad.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
