import Link from "next/link";
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
import { H2, List, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/nl/gidsen/pitch-deck" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "volgorde", label: "De volgorde die investeerders verwachten" },
  { id: "twaalf", label: "De twaalf slides" },
  { id: "notities", label: "Wat op de slide staat en wat jij zegt" },
  { id: "cijfers", label: "De cijfers die ze als eerste vragen" },
  { id: "uit-een-document", label: "Een deck uit een document dat je al hebt" },
  { id: "repeteren", label: "Repeteren met een tweede scherm en een klok" },
  { id: "powerpoint", label: "Voor wie per se PowerPoint wil" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Hoeveel slides hoort een pitch deck te hebben?",
    answer:
      "Tien tot vijftien. Twaalf is een prettig midden, en de indeling op deze pagina telt er twaalf. Alles boven de vijftien hoort in een bijlage die je alleen stuurt als erom gevraagd wordt. De echte beperking is niet het aantal maar het uur: reken ongeveer een derde van het gesprek voor het deck en de rest voor vragen, want elke extra slide gaat van die vragen af.",
  },
  {
    question: "Wat zet je op de eerste slide?",
    answer:
      "Eén zin over wat je doet en voor wie, plus de naam van je bedrijf en één manier om je te bereiken. Geen logowand, geen missieverklaring, geen foto van een bergtop. De toets: kan iemand die alleen die slide gezien heeft je bedrijf daarna aan een collega uitleggen zonder het fout te doen?",
  },
  {
    question: "Moet ik financiële prognoses opnemen in een eerste ronde?",
    answer:
      "Ja, maar drie jaar is genoeg en je aannames wegen zwaarder dan je totalen. Niemand gelooft het getal van jaar drie. Wat ze lezen is of je weet welke drie aannames je hele model dragen, en wat er gebeurt als de middelste de helft blijkt. Zet die aannames naast de cijfers op de slide, niet in een bijlage die niemand opent.",
  },
  {
    question: "Stuur ik het deck voor of na het gesprek?",
    answer:
      "Stuur vooraf een leesbare versie, dan is het gesprek een gesprek en geen leessessie. Daarin staan de zinnen die in de live versie in je sprekersnotitie blijven. Zit je deck vol schermafbeeldingen, stuur dan het bestand in plaats van een deellink: bij een deellink zit het document in de URL zelf, en dat gaat prima tot ongeveer achtduizend tekens en daarna niet meer.",
  },
];

/** De inline link van deze repo, zodat een tekstlink overal hetzelfde is. */
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

export default function PitchDeckGidsPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Gids"
      title={page(SLUG).h1}
      lead="De meeste adviezen over een pitch deck gaan over verhalen vertellen. Dit gaat over de mechaniek: waarom de slides in die volgorde staan, welke zin je afdrukt en welke je zelf uitspreekt, en hoe je het geheel één keer met een lopende klok doorloopt voordat je aan de woorden begint."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/guides/pitch-deck"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        Twaalf slides, in de volgorde die elk bezwaar beantwoordt op het moment
        dat het opkomt. Eén bewering per slide, één cijfer dat je kunt
        verdedigen, en de rest in je sprekersnotitie. Repeteer eerst tegen de
        klok op een tweede scherm en pas daarna op woordkeus. En exporteer{" "}
        <code>.pptx</code> voor wie om het bestand vraagt. Net als bij{" "}
        <A href="/nl/gidsen">alle gidsen stap voor stap</A> hoef je hier niets
        voor aan te schaffen.
      </Takeaway>

      <H2 id="volgorde">De volgorde die investeerders verwachten</H2>
      <P>
        Die volgorde is geen gewoonte maar een bewijsketen: elke slide
        beantwoordt het bezwaar dat de vorige oproept. Zeg dat er een probleem
        is en de vraag is van wie. Laat een oplossing zien en de vraag is of
        die werkt. Laat zien dat die werkt en de vraag is waarom niemand dit
        vijf jaar geleden deed. Pas daarna zegt een marktgetal iets.
      </P>
      <P>
        Daar volgen twee dingen uit. Schuiven breekt de keten: een marktslide
        vóór je probleemslide is een groot getal zonder iets eronder. En een
        slide die geen bezwaar beantwoordt is niet een korte slide, maar een
        slide die eruit moet. Doe die toets vóór je aan de vormgeving begint.
      </P>

      <H3 id="verkeerde-plek">Twee slides die bijna iedereen verkeerd zet</H3>
      <P>
        <strong className="font-medium text-fg">Waarom nu</strong> staat vijfde,
        na de demo. Zolang niemand het product heeft gezien is &ldquo;de wereld
        is veranderd&rdquo; een bewering; daarna is het het antwoord op de vraag
        die al gesteld wordt, namelijk waarom dit er in 2019 nog niet was.
      </P>
      <P>
        <strong className="font-medium text-fg">Concurrentie</strong> staat
        negende, en de versie die werkt benoemt waar je verliest. Investeerders
        hebben je concurrenten gesproken, soms in dezelfde week. Een schema
        waarin je elke rij wint zegt dat je niet gekeken hebt, of dat je het
        niet vertelt.
      </P>

      <H2 id="twaalf">
        De twaalf slides: een pitchdeck template om over te nemen
      </H2>
      <P>
        Twaalf is een midden, geen wet. Waar het om gaat is dat elke slide één
        taak heeft, en dat de derde kolom bestaat: dat is de helft van je deck
        die je uitspreekt in plaats van afdrukt.
      </P>
      <Table
        caption="Twaalf slides, wat er op elke slide staat en wat in je sprekersnotitie hoort."
        columns={["Slide", "Wat erop staat", "Wat in je notitie blijft"]}
        minWidth={720}
        rows={[
          [
            "1. Titel",
            "Eén zin: wat je doet en voor wie. Bedrijfsnaam, jouw naam, één contactgegeven.",
            "Hoe je geïntroduceerd wilt worden, en je openingszin.",
          ],
          [
            "2. Probleem",
            "Wie het heeft, hoe vaak het gebeurt, wat het diegene nu kost.",
            "Het verhaal van één van hen, en waar je getal vandaan komt.",
          ],
          [
            "3. Oplossing",
            "Wat je hebt gebouwd, in een zin die iemand foutloos kan navertellen.",
            "De twee dingen die het bewust niet doet.",
          ],
          [
            "4. Hoe het werkt",
            "Drie stappen, of één schermafbeelding. Niet je architectuur.",
            "De demo die je zou draaien als er tijd was, en wat daarin stukgaat.",
          ],
          [
            "5. Waarom nu",
            "Wat er veranderde — een prijs, een wet, een gewoonte — met een jaartal erbij.",
            "Wat er vóór die verandering is geprobeerd, en waarom dat mislukte.",
          ],
          [
            "6. Markt",
            "Van onderop: hoeveel kopers, keer wat ze per jaar betalen.",
            "Waar dat aantal kopers vandaan komt en wie je eruit hebt gelaten.",
          ],
          [
            "7. Verdienmodel",
            "Wat je rekent, aan wie, hoe vaak. Brutomarge als je die kent.",
            "Welke prijzen je hebt getest en waar mensen nee op zeiden.",
          ],
          [
            "8. Tractie",
            "Eén grafiek of vier getallen, met maanden op de as. Geen cumulatieve curve.",
            "Wat elke sprong was, en welke daarvan je niet kunt herhalen.",
          ],
          [
            "9. Concurrentie",
            "Concurrenten bij naam op de twee assen die deals beslissen, plus een rij die je verliest.",
            "Van wie je de laatste deal verloor, en welke reden ze gaven.",
          ],
          [
            "10. Team",
            "Wie, wat ze hiervoor deden, waarom dat hier telt. Het gat waarvoor je werft.",
            "De geschiedenis waardoor je hier ooit aan begon.",
          ],
          [
            "11. Cijfers",
            "Drie jaar, en de drie aannames waar het model op rust.",
            "Wat het model doet als de middelste aanname de helft blijkt.",
          ],
          [
            "12. Wat je ophaalt",
            "Hoeveel, voor hoeveel maanden, en waar het aan opgaat.",
            "Je ondergrens, je voorwaarden, en wie er al in de ronde zit.",
          ],
        ]}
      />

      <H2 id="notities">Wat op de slide staat en wat jij zegt</H2>
      <P>
        Eén regel houdt stand in een echte zaal: de slide draagt de bewering,
        jij draagt het argument. Een slide met het argument erop is een slide
        die de zaal leest terwijl jij praat, en lezen wint. Druk dus de zin af
        die je nog op het scherm zou willen hebben als je je stem kwijt was, en
        zet alles wat uitlegt of nuanceert in de notitie.
      </P>
      <P>
        Het notitieveld hier is één regel monospace onder de slide, en dat is
        een keuze en geen half werk. Een notitie die je in één oogopslag leest
        is een geheugensteun; een alinea is een script waaruit je gaat
        voorlezen. Notities uit een geïmporteerd <code>.pptx</code>-bestand
        worden ook tot één regel platgeslagen: de importfunctie plakt de
        alinea&apos;s met spaties aan elkaar. Mik op zes woorden per slide.
      </P>
      <P>
        Draagt een slide echt drie punten, laat ze dan één voor één komen. Er
        zijn vier standen en geen vijfde: opbouwen per opsommingsteken, per
        object, allebei, of helemaal niet. Een opbouw per opsommingsteken
        nummert je punten van één tot <em>n</em>, een opbouw per object gebruikt
        het stapnummer dat je aan elk object hebt gegeven, en de slide kost
        zoveel drukken als de langste van die twee. Eén stap terug komt uit aan
        het <em>eind</em> van de opbouw van de vorige slide, niet aan het
        begin — dat is het verschil tussen één punt herlezen en die hele slide
        opnieuw opvoeren.
      </P>

      <H2 id="cijfers">De cijfers die ze als eerste vragen</H2>
      <P>
        Reken bij Nederlandse investeerders op nuchtere vragen, en op cijfers
        vóór grote woorden. De vragen komen bovendien in een vaste volgorde, en
        niet in de volgorde waarin jij je model hebt gebouwd. Zorg dat deze zes
        als zinnen klaarliggen en niet als opzoekwerk:
      </P>
      <List
        items={[
          "Omzet of gebruik per maand, met de maanden erbij. Een cumulatieve curve gaat alleen maar omhoog, en iedereen in de zaal weet waar die voor dient.",
          "Groei over een benoemde periode — “3,1× over de afgelopen zes maanden” in plaats van “hard”.",
          "Burn en runway in maanden, met de datum waarop het geld op is.",
          "Brutomarge, of de reden waarom je die nog niet zinvol kunt geven.",
          "Wat een klant kost om binnen te halen en hoe lang die erover doet dat terug te verdienen — als je er genoeg verkocht hebt om dat te weten.",
          "Wat je ophaalt: het bedrag, het aantal maanden dat het je geeft, en de mijlpaal die je ermee wilt halen.",
        ]}
      />
      <P>
        Zet elke aanname naast het getal dat eruit rolt, niet in een bijlage.
        Gebruik je WBSO of praat je met een regionale
        ontwikkelingsmaatschappij, benoem dan wat al toegezegd is en wat nog een
        aanvraag is — daar wordt op doorgevraagd.
      </P>
      <P>
        Het model eronder is een gewone spreadsheet: 167 functies, waaronder de
        elf financiële (<code>PMT</code>, <code>FV</code>, <code>PV</code>,{" "}
        <code>NPER</code>, <code>RATE</code>, <code>NPV</code>, <code>IRR</code>
        , <code>SLN</code>, <code>SYD</code>, <code>EFFECT</code>,{" "}
        <code>NOMINAL</code>). Een grafiek leest de tabel waar hij uit komt in
        plaats van er een kopie van te zijn, dus een prognose die je aanpast
        laat geen verouderde grafiek achter. Wat níét kan: een grafiek op een
        slide zetten. Een object op een slide is tekst, een rechthoek, een
        ellips, een lijn of een afbeelding. In de praktijk is dat de juiste
        beperking — het model hoort in het document dat je náást het deck
        stuurt, en op de slide staat het ene getal waar die grafiek over gaat.
        Voor de formules zelf:{" "}
        <A href="/nl/gidsen/formules">je financiële prognose opbouwen</A>.
      </P>

      <H2 id="uit-een-document">
        Een deck uit een document dat je al geschreven hebt
      </H2>
      <P>
        Een deck is zelden het eerste dat je schrijft. Meestal ligt er al een
        memo, een ondernemingsplan of een subsidieaanvraag, en het overtypen
        daarvan kost je het weekend. Vraag je om een deck uit het open document,
        dan gebruikt dat de structuur die er al is: elke paragraaf van meer dan
        vijftien woorden wordt een slide, je koppen worden de titels, en de
        opsommingstekens zijn de openingszinnen van die paragraaf, afgekapt op
        lengte. Vraag je om twaalf slides, dan krijg je er twaalf: het aantal
        wordt uit je zin gelezen en tussen drie en twintig gehouden. Die regels
        zijn van de lokale stub; met een model ingesteld is de indeling die van
        het model, en ook dan krijg je hem eerst als voorstel te zien.
      </P>
      <P>
        Het maakt een <em>nieuw</em> deckproject aan en laat je document met
        rust, en er verandert niets tot je op Accepteren drukt. Is er geen model
        ingesteld, dan doet een lokale stub hetzelfde werk op je koppen en zegt
        er ook bij dat hij dat is.
      </P>
      <P>
        Inkorten gaat net zo. Vraag je om een deck terug te brengen naar
        twaalf, dan gaan de dunste slides eruit, blijven de eerste en de laatste
        staan wat ze ook wegen, wordt er niets samengevoegd, en krijg je te
        horen wélke eruit gingen. Staat je tekst in een tool die helemaal geen
        slides maakt, dan legt{" "}
        <A href="/nl/vergelijk/notion">
          waarom Notion geen slides-editor heeft
        </A>{" "}
        die afweging uit.
      </P>

      <H2 id="repeteren">Repeteren met een tweede scherm en een klok</H2>
      <P>
        Repeteer eerst de klok en pas daarna de woorden. De
        presentatorweergave opent als tweede venster: je notities krijgen het
        grootste vlak, de punten van de huidige slide staan ernaast met de nog
        niet onthulde gedimd, de volgende slide toont zijn titel en maximaal
        vier punten, en de teller staat op <code>4 / 12 · step 2/3</code>. Eén knop
        start de klok en zet hem daarna terug op nul; hij telt in{" "}
        <code>mm:ss</code> tot een praatje een uur nodig heeft. Pijltjestoetsen,
        spatiebalk en Page Down werken vanuit beide vensters.
      </P>
      <P>
        Het venster dat de zaal ziet bepaalt waar het deck staat; de
        presentatorweergave vraagt alleen of het mag opschuiven. Daarom kun je
        die weergave halverwege sluiten en weer openen: hij loopt bij in plaats
        van tegen te sputteren. De beperking is concreet, en dit is er één om
        vóór een echte pitch te controleren:{" "}
        <strong className="font-medium text-fg">
          de twee vensters praten via een kanaal binnen de browser, dus het
          moeten twee vensters van dezelfde browser op één machine zijn.
        </strong>{" "}
        Laptop plus beamer werkt. Je telefoon die je laptop aanstuurt niet. En
        staan pop-ups uit, dan gaat dat tweede venster nooit open — zet ze van
        tevoren aan voor deze site, niet in de zaal.
      </P>

      <H2 id="powerpoint">Voor wie per se PowerPoint wil</H2>
      <P>
        Iemand in het traject vraagt om het bestand. De export schrijft een echt{" "}
        <code>.pptx</code>: een zip met OOXML-onderdelen, 16:9, afbeeldingen als
        media erin, de voettekst en het slidenummer van je stramien op elke
        slide die daar niet van afziet, en een notitie-onderdeel voor elke slide
        die een notitie heeft. Importeren kan ook: dat zet het deck áchter wat
        er al staat, met een melding die noemt wat niet is meegekomen.
        PowerPoint wint hieronder de meeste rijen.
      </P>
      <Table
        caption="Wat de overstap naar PowerPoint overleeft, en wat PowerPoint gewoon beter doet."
        columns={["", "PowerPoint", "Dit deck"]}
        minWidth={700}
        rows={[
          [
            "Opbouw en overgangen",
            "Een volledige animatietijdlijn, per vorm.",
            "Vier standen, en geen daarvan komt in het geëxporteerde bestand terecht — in PowerPoint verschijnt alles tegelijk.",
          ],
          [
            "Grafieken op een slide",
            "Ingebouwd, bewerkbaar, gekoppeld aan een werkmap.",
            "Geen grafiekobject. Alleen tekst, rechthoeken, ellipsen, lijnen en afbeeldingen.",
          ],
          [
            "Thema's en sjablonen",
            "Honderden, plus wat je huisstijlsjabloon afdwingt.",
            "Vijf thema's, en vier indelingen plus een automatische, met opzet. Je kiest een indeling, geen lettergrootte.",
          ],
          [
            "Opmerkingen bij één slide",
            "Aan een slide, of aan een vorm daarop.",
            "Aan het blok, dus een opmerking hangt aan het deck en niet aan slide 7.",
          ],
          [
            "Een .pptx weer inlezen",
            "Alles, uiteraard.",
            "Titels, punten en sprekersnotities. Afbeeldingen, ingesloten objecten, grafieken en het oorspronkelijke thema vallen af, en dat wordt benoemd.",
          ],
          [
            "Sprekersnotities in het bestand",
            "Ja.",
            "Ja — een echt notitie-onderdeel per slide die er een heeft.",
          ],
          [
            "Een pdf van je slides",
            "Schrijft er een.",
            "Geen pdf-schrijver. Een deck naar pdf exporteren geeft per slide een kop met de punten eronder: een handout, zonder notities.",
          ],
          [
            "Presenteren op een tweede scherm",
            "Een desktopprogramma dat een beamer als tweede scherm aanstuurt.",
            "Twee vensters van één browser op één machine, met een klok die je vanuit het tweede venster start.",
          ],
        ]}
      />
      <P>
        Moet het bestand maandenlang in andermans omgeving blijven leven in
        plaats van één gesprek mee te gaan, bouw het dan waar zij al zitten
        —{" "}
        <A href="/nl/vergelijk/google-workspace">
          hoe Google Presentaties zich verhoudt
        </A>{" "}
        zet die kant op een rij.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Begin een deck">
        Zet één bewering op elk van twaalf slides en verplaats elke zin die
        iets uitlegt naar de notitie. Open dan het tweede scherm en loop het één
        keer door met de klok aan. Die doorloop vertelt je meer dan de drie
        bewerkingen erna.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
