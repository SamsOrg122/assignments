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

const SLUG = "/nl/vergelijk/notion" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "waar-notion-wint", label: "Waar Notion wint" },
  { id: "formules", label: "Een formulemotor, geen formule-eigenschappen" },
  { id: "slides", label: "Slides, en een tweede scherm" },
  { id: "papier", label: "Een pagina die je kunt inleveren" },
  { id: "geen-account", label: "Geen account, geen server" },
  { id: "naast-elkaar", label: "Naast elkaar" },
  { id: "vervangen", label: "Wanneer is Notion vervangen zinnig?" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Heeft Tougather databases zoals Notion?",
    answer:
      "Nee. Een tabel is hier een spreadsheettabel met acht kolomtypes — tekst, getal, bedrag, percentage, datum, vinkje, keuzelijst en formule — plus sorteren, filters, voorwaardelijke opmaak en validatie. Er is geen relatie-eigenschap, geen rollup, en geen tweede weergave van dezelfde rijen als bord of agenda. Zijn gekoppelde databases de reden dat je Notion gebruikt, dan weegt de rest van deze pagina daar niet tegenop.",
  },
  {
    question: "Kan ik in Tougather echte spreadsheetformules gebruiken?",
    answer:
      "Ja. Er zitten 167 functies in één bibliotheek: rekenen, aggregaten, logica, voorwaardelijke aggregaten, opzoeken, tekst, datums, typecontroles, financieel en statistiek. Je adresseert met A1, met dollartekens voor verwijzingen die doorvoeren overleven, formules per cel naast regels per kolom, verwijzingen naar andere tabellen zoals Kosten!B2:B40, benoemde bereiken en de foutcodes van Excel. Negen functies ontbreken met opzet: RAND, RANDBETWEEN, UNIQUE, SORT, FILTER, TRANSPOSE, INDIRECT, OFFSET en VBA.",
  },
  {
    question: "Kan ik met Tougather presenteren, en is er een presentatorweergave?",
    answer:
      "Ja. Een deck heeft een stramien, opbouw per opsommingsteken of per object, en leest en schrijft .pptx inclusief sprekersnotities. De presentatorweergave is een tweede venster met je notities, een klok en de slide die eraan komt; het venster dat de zaal ziet blijft de baas over de positie. De beperking: dit loopt over BroadcastChannel, dus twee vensters van dezelfde browser op één machine, niet je telefoon die je laptop aanstuurt.",
  },
  {
    question: "Werkt Tougather offline?",
    answer:
      "Ja, en je hoeft er vooraf niets voor aan te zetten. Je werk staat sowieso in de lokale opslag van deze browser, dus het enige dat ooit een netwerk nodig had was de app zelf; een service worker haalt navigaties eerst via het netwerk op met een gecachete schil erachter. Notion kan ook offline: pagina's die je onlangs bezocht hebt zijn automatisch beschikbaar en de rest kun je vooraf op Available offline zetten \u2014 maar wat je nooit geopend en nooit gemarkeerd hebt, opent niet.",
  },
  {
    question: "Kan ik mijn Notion-pagina's overzetten?",
    answer:
      "Deels, en minder dan je zou willen. Er is geen import voor Markdown of HTML, dus een geëxporteerde Notion-pagina komt niet als pagina binnen. Een database die je als CSV exporteert komt wel binnen als tabel, waarbij het scheidingsteken zelf herkend wordt: komma, puntkomma, tab of pipe. Relaties en rollups hebben hier niets om in te landen, dus reken erop dat je die opnieuw opbouwt.",
  },
];

/** De inline link van deze repo, zodat een tekstlink op elke pagina hetzelfde is. */
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

export default function NotionVergelijkingPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Vergelijken"
      title={page(SLUG).h1}
      lead="Notion lijkt qua vorm het meest op dit: één werkplek, blokken in plaats van bestanden, een pagina in plaats van een map. Juist omdat die vormen zo op elkaar lijken, zitten de verschillen in de details — en die staan hier precies, beide kanten op."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/compare/notion"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        Notion wint op databases, relaties en rollups, op een
        sjablonenbibliotheek van jaren, en op delen dat een ICT-afdeling al
        kent. Tougather wint op een echte formulemotor met A1-adressering en
        verwijzingen tussen tabellen, slides met presentatorweergave, een
        pagina die je kunt printen en als Word-bestand inleveren, en werk dat
        opengaat zonder account.
      </Takeaway>

      <H2 id="waar-notion-wint">Waar Notion wint</H2>
      <P>
        We beginnen bij wat je inlevert; een vergelijking zonder verlies is een
        advertentie.
      </P>

      <H3 id="databases">Databases, relaties en rollups</H3>
      <P>
        Dit is de echte. Een relatie koppelt in Notion twee databases, een
        rollup leest via die koppeling een waarde terug, en dezelfde rijen
        verschijnen als tabel, bord, agenda of galerij. Dat bestaat hier niet.
        Een tabel is bij Tougather een spreadsheettabel: acht kolomtypes —
        tekst, getal, bedrag, percentage, datum, vinkje, keuzelijst en formule —
        met sorteren, filters, voorwaardelijke opmaak en validatie per kolom, en
        één weergave: het raster. Kanban bestaat wel, maar als sjabloon met
        plakbriefjes op het bord, niet als tweede weergave van je rijen. Het
        dichtst bij een relatie komt een formule die een andere tabel in leest,
        en die is slechter in precies waar relaties goed in zijn: van het ene
        record naar het andere springen en weer terug.
      </P>

      <H3 id="sjablonen">Een sjablonenbibliotheek van jaren</H3>
      <P>
        De templates van Notion zijn het werk van duizenden anderen, en voor een
        deel van de lezers hier is dát het product. Tougather levert zes
        projectsjablonen en zes bordsjablonen, plus wat je zelf opslaat. Zes is
        geen bibliotheek.
      </P>

      <H3 id="delen">Delen dat al goedgekeurd is</H3>
      <P>
        Notion deelt per persoon, per groep en per gast, en publiceert een
        pagina als webadres. Tougather deelt per link, en het document reist mee
        ín het URL-fragment: het stuk achter de <code>#</code> dat browsers
        nooit naar een server sturen. Dat maakt zo&apos;n link tegelijk echt
        privé en echt onherroepelijk — wie de link heeft, heeft het document. Er
        is wel een beheerkant, maar die werkt alleen tegen een echte database;
        staat er geen, dan geeft elke aanroep uitleg terug in plaats van te doen
        alsof.
      </P>

      <H3 id="apps">Apps en een API</H3>
      <P>
        Notion heeft desktop- en mobiele apps en een API waar een hele
        koppelindustrie op draait. Hier is er een installeerbare PWA en verder
        niets natives — geen React Native, Capacitor, Expo, Electron of Tauri in{" "}
        <code>package.json</code>. De vier API-routes gaan over AI, afrekenen,
        de samenwerkingsrelay en configuratie; via geen daarvan leest een ander
        programma je project.
      </P>

      <H2 id="formules">Een formulemotor, geen formule-eigenschappen</H2>
      <P>
        Een formule in Notion is een uitdrukking over de eigenschappen van één
        rij. Nuttig, en geen spreadsheet: er is geen cel om naar te wijzen, dus
        geen <code>B2</code>, geen rechthoek, en geen manier om &ldquo;deze
        kolom, veertig rijen ver, in die andere tabel&rdquo; te zeggen zonder
        dat er al een relatie ligt.
      </P>
      <P>
        Aan deze kant staat een raster met 167 functies in één bibliotheek:
        rekenen, aggregaten, logica, voorwaardelijke aggregaten, opzoeken,
        tekst, datums, typecontroles, financieel en statistiek. Adressering gaat
        via A1, en doorvoeren houdt vast wat je vastzette:{" "}
        <code>=B$2*$C2</code> blijft overal staan zoals je het schreef, omdat de
        herschrijving over je eigen brontekst gaat, dus spaties en hoofdletters
        komen terug zoals je ze typte. Elke tabel in een project is ook een
        blad, dus <code>Kosten!B2:B40</code> en <code>[Kosten]![Bedrag]</code>{" "}
        wijzen naar andere tabellen in hetzelfde document. Een cel die wordt
        opgevraagd terwijl hij nog berekend wordt, geeft <code>#CYCLE!</code>{" "}
        terug in plaats van je tabblad te laten hangen.
      </P>
      <P>
        Negen functies ontbreken met opzet, elk met een reden erbij in plaats
        van een <code>#NAME?</code>: <code>RAND</code>, <code>RANDBETWEEN</code>,{" "}
        <code>UNIQUE</code>, <code>SORT</code>, <code>FILTER</code>,{" "}
        <code>TRANSPOSE</code>, <code>INDIRECT</code>, <code>OFFSET</code> en
        VBA. Vier daarvan hebben een spill-model nodig dat er niet is, twee
        bouwen tijdens het rekenen een verwijzing op en zouden de
        cyclusbewaking blind maken, en macro&apos;s zijn geweigerd met een
        argument: iets over elke rij herhalen is wat een formulekolom al doet.
        Zoek je vooral rekenwerk, dan is{" "}
        <A href="/nl/vergelijk/excel">als je vooral een spreadsheet zoekt</A> de
        betere vergelijking.
      </P>

      <H2 id="slides">Slides, en een tweede scherm</H2>
      <P>
        Notion heeft geen slides-editor. Mensen bouwen hun deck uit
        Notion-pagina&apos;s en zetten dat schermvullend, of ze stappen over
        naar Google Presentaties. Hier is een deck een bloktype in hetzelfde
        project als je tekst en je tabel, met een stramien dat logo, voettekst,
        slidenummers en achtergrond doorgeeft aan elke slide die er niet
        uitstapt. Opbouw gaat per opsommingsteken, per object, allebei of niet —
        dat is het hele animatiemodel, want alles wat uitgebreider is moet je
        bedienen terwijl je ook staat te praten.
      </P>
      <P>
        De presentatorweergave is een tweede venster met je notities, een klok
        die je start en reset, en de slide die eraan komt. Het venster dat de
        zaal ziet blijft de baas over de positie en het presentatorvenster
        stuurt alleen verzoeken, dus de twee schermen kunnen elkaar niet
        tegenspreken. Weet vooraf wat de grens is: dit loopt over{" "}
        <code>BroadcastChannel</code>, dus twee vensters van dezelfde browser op
        één machine. Decks lezen en schrijven .pptx met sprekersnotities, al
        laat een import thema, afbeeldingen, positionering en animaties bewust
        vallen. Zoek je eerst de inhoud van je slides, dan helpt{" "}
        <A href="/nl/gidsen/pitch-deck">een deck maken zonder slides-editor</A>.
      </P>

      <H2 id="papier">Een pagina die je kunt inleveren</H2>
      <P>
        Een Notion-pagina is een webpagina: hij is zo lang als hij is, en papier
        komt er achteraf bij. Maar een scriptie of een adviesrapport is eerst
        pagina-vormig, en dat staat meestal letterlijk in het
        beoordelingsformulier: A4, 2,5 cm marges, paginanummer rechtsonder.
        Daarom is er hier een pagina-instelling: A4, Letter of Legal, staand of
        liggend, marges in millimeters, paginanummers in de voettekst of de
        koptekst. De helft daarvan werkt bij printen vanuit de browser en de
        code zegt welke helft. Formaat, oriëntatie en marges gaan via{" "}
        <code>@page</code>; kopteksten, voetteksten en paginanummers werken bij
        printen vanuit de browser helemaal niet, want CSS-marginboxen zijn in
        geen enkele browserengine geïmplementeerd. Die gaan de Word-export in.
      </P>
      <P>
        Die Word-export is echte OOXML: voetnoten die Word op de pagina zet,{" "}
        <code>w:ins</code>- en <code>w:del</code>-wijzigingen die het kan
        beoordelen, een koptekst met een paginaveld en een inhoudsopgaveveld.
        Andersom leest het .docx en komen bijgehouden wijzigingen binnen als
        voorstellen die je accepteert of weigert. Daaromheen: genummerde
        voetnoten, een inhoudsopgave die wordt afgeleid en niet opgeslagen, en
        bronvermelding in APA 7, MLA 9, Chicago en Harvard. De gaten zitten in
        dezelfde hoek: exporteren naar pdf is <code>window.print()</code> in een
        schoon venster en geen gegenereerd bestand, formules komen als
        LaTeX-broncode in Word terecht en niet als OMML, en pdf importeren kan
        helemaal niet.
      </P>

      <H2 id="geen-account">Geen account, geen server</H2>
      <P>
        Bij Notion begint alles met een account. Hier heeft de gratis versie
        geen login: je opent de app en je werk gaat de lokale opslag van deze
        browser in. Niemand kan het lezen, wij ook niet, want er is geen plek om
        het te lezen — en precies diezelfde zin is het risico, want er is geen
        back-up en je browsergegevens wissen is je werk wissen.
      </P>
      <P>
        Daar staan drie dingen tegenover: de app vraagt de browser om permanente
        opslag, hij schat hoeveel ruimte er over is, en hij exporteert één
        back-upbestand met elke opslag plus de lettertypen en afbeeldingen uit
        IndexedDB. De grens is gemeten en niet geschat: 50.000 rijen is 3,4 MB
        en opent in 0,56 s, en 100.000 rijen wordt geweigerd omdat de
        browseropslag vol is. Offline werken volgt hieruit in plaats van dat het
        er los op zit — zie{" "}
        <A href="/nl/gidsen/offline">wat Notion offline wel en niet kan</A>.
      </P>

      <H2 id="naast-elkaar">Naast elkaar</H2>
      <Table
        caption="Notion en Tougather, rij voor rij. Meerdere rijen zijn verlies."
        columns={["", "Notion", "Tougather"]}
        minWidth={660}
        rows={[
          [
            "Databases en relaties",
            "Relaties, rollups, en dezelfde rijen als bord of agenda.",
            "Niets daarvan. Een spreadsheetraster, acht kolomtypes, één weergave.",
          ],
          [
            "Sjablonen",
            "Een openbare bibliotheek van jaren.",
            "Zes projectsjablonen, zes bordsjablonen, plus wat je zelf opslaat.",
          ],
          [
            "Delen",
            "Per persoon, groep en gast, plus een openbare webpagina.",
            "Per link, in het URL-fragment dat browsers nooit naar een server sturen.",
          ],
          [
            "Apps en koppelingen",
            "Desktop- en mobiele apps, en een openbare API.",
            "Een installeerbare PWA. Niets natives, geen openbare API.",
          ],
          [
            "Formules",
            "Uitdrukkingen over de eigenschappen van één rij.",
            "167 functies, A1-bereiken, vastzetten dat doorvoeren overleeft, verwijzingen tussen tabellen.",
          ],
          [
            "Slides",
            "Geen slides-editor.",
            "Decks met stramien en opbouw, .pptx beide kanten op, presentatorweergave.",
          ],
          [
            "Word-bestanden",
            "Exporteert pdf, HTML, Markdown en CSV.",
            ".docx beide kanten op, met voetnoten en bijgehouden wijzigingen.",
          ],
          [
            "Printen op papier",
            "Een pdf exporteren en hopen.",
            "A4/Letter/Legal, marges in mm. Paginanummers alleen in Word.",
          ],
          [
            "Account nodig",
            "Ja, om iets te openen.",
            "Nee. De gratis versie heeft geen login.",
          ],
          [
            "Hoeveel het houdt",
            "Aan de serverkant, dus omvang is het probleem van Notion.",
            "50.000 rijen gemeten comfortabel. 100.000 geweigerd — opslag vol.",
          ],
        ]}
      />

      <H2 id="vervangen">Wanneer is Notion vervangen zinnig?</H2>
      <P>
        Eerst wanneer niet. Als vervanger voor Notion kost dit je in deze
        gevallen echt iets:
      </P>
      <List
        items={[
          "Je werkruimte draait op gekoppelde databases. Relaties en rollups hebben hier geen equivalent.",
          "Je bekijkt dezelfde rijen als bord én als agenda. Er is hier één weergave: het raster.",
          "Je begint elk project vanuit een template uit de bibliotheek.",
          "Een ICT-afdeling moet het goedkeuren, of mensen buiten je team hebben toegang per persoon nodig.",
          "Je leunt op de API, op de mobiele app, of op tools die naar Notion synchroniseren.",
        ]}
      />
      <P>
        Waar het wél past is smaller: één document met cijfers waarmee je kunt
        rekenen, slides die je echt kunt presenteren en een pagina die je echt
        kunt inleveren, zonder account en zonder verbinding. Een scriptie met de
        resultaten en de verdediging erin, of een mkb-rapport dat als .docx de
        deur uit moet. Is je vraag breder dan deze twee tools, dan staan{" "}
        <A href="/nl/vergelijk">alle vergelijkingen bij elkaar</A>, waaronder{" "}
        <A href="/nl/vergelijk/google-workspace">Google Workspace vergeleken</A>.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Beginnen met schrijven">
        Geen account, niets te installeren. Zet een tabel en een deck in
        hetzelfde document en kijk of de naden waar je omheen werkte ooit nodig
        waren.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
