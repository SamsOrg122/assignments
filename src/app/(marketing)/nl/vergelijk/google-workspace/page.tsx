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

const SLUG = "/nl/vergelijk/google-workspace" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "waar-google-wint", label: "Waar Google Workspace wint" },
  { id: "samenwerken", label: "Wat samenwerken hier precies is" },
  { id: "verschillen", label: "Vier dingen die anders werken" },
  { id: "naast-elkaar", label: "Naast elkaar" },
  { id: "alternatief", label: "Wanneer is Tougather een alternatief?" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Kunnen twee mensen tegelijk in hetzelfde document werken?",
    answer:
      "Ja. Een live sessie laat zien wie er is, toont de cursor van de ander, en tekst voegt per teken samen via een CRDT — hetzelfde soort antwoord als Google Documenten geeft, en twee mensen in één alinea houden allebei hun woorden. Twee grenzen: borden, spreadsheets en slides gaan nog per item met de nieuwste die wint, en de samenvoegtoestand wordt opgebouwd bij het openen in plaats van bewaard, dus hij overleeft een wegvallende verbinding maar geen herlaadbeurt.",
  },
  {
    question: "Waar staan mijn gegevens opgeslagen?",
    answer:
      "In je browser. Elk project, bord, bericht en elke instelling staat in de lokale opslag van het apparaat waarop je het schreef, en de gratis versie heeft geen login. Dat snijdt twee kanten op: niemand kan je werk lezen, wij ook niet, want er is geen plek om het te lezen — en er is geen back-up, dus browsergegevens wissen is werk wissen. Een database zet een beheerder er zelf onder; standaard staat die niet aan.",
  },
  {
    question: "Kan ik mijn Google Documenten en Spreadsheets importeren?",
    answer:
      "Niet rechtstreeks. Exporteer bij Google eerst naar .docx, .xlsx of .csv: die drie worden gelezen, inclusief koppen, lijsten, tabellen, voetnoten en de bijgehouden wijzigingen van Word, die binnenkomen als voorstellen. Google Presentaties als .pptx levert titels, opsommingen en sprekersnotities op; thema, afbeeldingen, positionering en animaties gaan er bewust af. Apps Script komt niet mee en pdf's worden helemaal niet gelezen.",
  },
  {
    question: "Zit er e-mail bij, zoals Gmail?",
    answer:
      "Nee. Er is geen e-mail en geen agenda — geen uitgeklede versie, gewoon niets. Betaal je vooral voor Google Workspace vanwege Gmail en Agenda, dan vervangt Tougather de vier apps waarin je dingen maakt en laat het je mailbox staan.",
  },
  {
    question: "Is er een gratis versie?",
    answer:
      "Ja. Gratis is €0 met 200 AI-credits per maand, die stoppen in plaats van je stilletjes een rekening te sturen. Pro kost €14 per maand met 3.000 credits, Team €24 per stoel met 6.000 gedeelde credits. Eén ding hoor je liever van ons: er kan vandaag niets afgeschreven worden, want elk Stripe-prijs-id in de betaalcode is nog leeg.",
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

export default function GoogleWorkspaceVergelijkingPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Vergelijken"
      title={page(SLUG).h1}
      lead="Google Documenten, Spreadsheets en Presentaties zijn ergens heel goed in: met z'n vieren tegelijk in één bestand. Deze pagina zegt waar dat nog steeds de reden is om te blijven, en waar een werkplek zonder account en zonder verbinding beter uitpakt."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/compare/google-workspace"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        Google wint op live samen typen, op Gmail en Agenda, en op delen dat
        iedereen al kent. Tougather wint op één project in plaats van vier
        bestanden, geen login, bestanden die eruit komen zoals ze binnenkwamen,
        en een editor die opengaat zonder netwerk.
      </Takeaway>

      <H2 id="waar-google-wint">Waar Google Workspace wint</H2>
      <P>
        We beginnen met wat je inlevert; een vergelijking zonder verlies is een
        advertentie.
      </P>

      <H3 id="samen-typen">Live samen typen</H3>
      <P>
        Google Documenten voegt wijzigingen per teken samen; met tien man in één
        alinea overschrijft niemand iemand. Tougather heeft een live sessie — je
        ziet wie er is, waar hun cursor staat, en wijzigingen komen binnen als
        wijzigingen — en tekst voegt per teken samen via een CRDT. Op dezelfde
        seconde in dezelfde alinea typen houdt dus van allebei de woorden, en
        beide schermen komen identiek uit. Twee grenzen: borden, spreadsheets
        en slides gaan nog per item met de nieuwste die wint, en de
        samenvoegtoestand wordt opgebouwd bij het openen in plaats van bewaard
        — hij overleeft een wegvallende verbinding, geen herlaadbeurt.
      </P>

      <H3 id="mail-en-agenda">Gmail en Agenda</H3>
      <P>
        Er is hier geen e-mail en geen agenda. Geen uitgeklede versie — helemaal
        niets. Voor de meeste mensen is dat de grootste helft van waarvoor ze
        Google openen.
      </P>

      <H3 id="delen">Delen dat iedereen al snapt</H3>
      <P>
        Google deelt per persoon, per groep en per domein, met een
        beheerconsole erachter — precies waar een school of een mkb-bedrijf op
        draait. Tougather deelt per link. Er is wel een beheerkant — auditlog,
        leden, rollen, bewaartermijn, opschonen — maar die werkt alleen tegen
        een echte database; staat er geen, dan geeft elke aanroep uitleg terug.
        Een auditlog van één browser is namelijk een dagboek: bijgehouden en te
        wissen door degene die erin staat.
      </P>

      <H2 id="samenwerken">Wat samenwerken hier precies is</H2>
      <P>
        Precies zijn loont, want &ldquo;realtime samenwerken&rdquo; betekent op
        vier prijspagina&apos;s vier verschillende dingen. Een sessie loopt over
        een relay: server-sent events naar beneden, een gewone POST naar boven.
        Die bewaart niets en vergeet een kamer zodra de laatste deelnemer weg
        is. Wat er heen en weer gaat, zijn aanwezigheid, cursorposities en de
        blokken die je veranderde.
      </P>
      <P>
        Een sessie gaat alleen open voor een project dat je expliciet gedeeld
        hebt: hij houdt een verbinding open zolang het project op je scherm
        staat, en een browser staat er ongeveer zes toe per origin. Een kamer
        per open project legt de app na zes tabbladen plat.
      </P>
      <P>
        Waar het misgaat staat er ook bij. De kamers van de relay leven in het
        geheugen van één proces, dus een serverless of automatisch schalende
        omgeving zet twee mensen in processen die elkaar niet zien. De client
        stuurt eerst een probe heen en terug voordat hij zegt dat de sessie live
        is; lukt dat niet, dan valt hij terug op BroadcastChannel — andere
        vensters van dezelfde browser — en meldt dat.
      </P>
      <P>
        De kant zonder tweede persoon is sterker. Opmerkingen
        hangen aan een blok en niet aan een stuk tekst, want een opmerking die
        aan een teken hangt staat bij de verkeerde zin zodra iemand erboven iets
        bijtypt. Voorstellen accepteer of weiger je stuk voor stuk, ook in
        blokken die niemand geopend heeft.
      </P>

      <H2 id="verschillen">Vier dingen die anders werken</H2>

      <H3 id="geen-account">Geen account</H3>
      <P>
        De gratis versie heeft geen login. Niets om aan te maken, niets te
        bevestigen: je opent de app en je werk gaat de lokale opslag van deze
        browser in. Daar staat een back-upbestand tegenover dat elke opslag
        meeneemt plus de lettertypen en afbeeldingen uit IndexedDB, en dat je in
        elke browser weer kunt terugzetten.
      </P>

      <H3 id="offline">Offline is een toestand, geen noodgreep</H3>
      <P>
        In Google Documenten moet je offline vooraf aanzetten: Chrome of Edge,
        de extensie, en per bestand aangevinkt voordat de verbinding wegviel.
        Hier staat het werk sowieso lokaal, dus het enige dat ooit een netwerk
        nodig had was de app zelf. Dat lost de service
        worker op: navigaties eerst via het netwerk met een gecachete schil
        erachter, gehashte assets eerst uit de cache, en <code>/api/…</code>
        {" "}nooit gecachet — een rij die voor het ene account is opgehaald mag
        niet bij de volgende persoon terugkomen. Zie ook{" "}
        <A href="/nl/gidsen/offline">
          zo werkt de offlinemodus in Google Docs
        </A>
        .
      </P>

      <H3 id="een-project">Eén project in plaats van vier bestanden</H3>
      <P>
        Een scriptie in Google Workspace is een Document, een Spreadsheet, een
        Presentatie en een whiteboard — bestanden die uit elkaar lopen zodra je
        een getal overtikt. Hier zijn het blokken in één project, en een grafiek
        leest zijn tabel op id, dus er is één kopie van de data. Elke tabel is ook een blad, dus{" "}
        <code>Kosten!B2:B40</code> en <code>[Kosten]![Bedrag]</code> wijzen naar
        andere tabellen in hetzelfde project. Een draaitabel wordt bij elke
        render opnieuw afgeleid en is zelf een tabelblok, dus grafieken,
        sorteren en exporteren werken er gratis op.
      </P>

      <H3 id="bestanden">Bestanden komen eruit zoals ze binnenkwamen</H3>
      <P>
        Word-bestanden zijn echte OOXML, beide kanten op: voetnoten die Word op
        de pagina zet, <code>w:ins</code>- en <code>w:del</code>-wijzigingen die
        het kan beoordelen, een koptekst met een paginaveld, een
        inhoudsopgaveveld. Spreadsheets lezen en schrijven .xlsx met gesaneerde
        bladnamen en echte datumserienummers; csv herkent zelf komma, puntkomma,
        tab en pipe, en gaat om met aanhalingstekens, CRLF en een BOM — die
        puntkomma doet er hier meer toe dan de meeste tools toegeven.
        Presentaties lezen en schrijven .pptx met sprekersnotities.
      </P>
      <P>
        De gaten zitten op dezelfde plek. Exporteren naar pdf is{" "}
        <code>window.print()</code> in een schoon venster en geen echt
        gegenereerd bestand, en paginanummers overleven dat niet: CSS-marginboxen
        zijn in geen enkele browserengine geïmplementeerd, dus die gaan de
        Word-export in. Pdf importeren kan helemaal niet.
      </P>

      <H2 id="naast-elkaar">Naast elkaar</H2>
      <Table
        caption="Google Workspace en Tougather, rij voor rij. Meerdere rijen zijn verlies."
        columns={["", "Google Workspace", "Tougather"]}
        minWidth={640}
        rows={[
          [
            "Twee mensen in dezelfde alinea",
            "Per teken samengevoegd.",
            "Per teken samengevoegd, via een CRDT. Borden en spreadsheets nog per item.",
          ],
          [
            "E-mail en agenda",
            "Gmail en Agenda.",
            "Helemaal niets. Je mailbox blijft waar die is.",
          ],
          [
            "Delen",
            "Per persoon, groep en domein, met een beheerconsole.",
            "Per link. Het document zit in het URL-fragment, dat browsers nooit naar een server sturen.",
          ],
          [
            "Account nodig",
            "Een Google-account, voor iedereen.",
            "Geen. De gratis versie heeft geen login.",
          ],
          [
            "Offline",
            "Chrome of Edge, de extensie, bestanden vooraf aangevinkt.",
            "De app opent uit de cache; het werk stond al lokaal.",
          ],
          [
            "Spreadsheetfuncties",
            "Meer dan wij, plus Apps Script voor de rest.",
            "167 in één bibliotheek. Geen macro's, geen spill; 9 ontbrekende functies met reden benoemd.",
          ],
          [
            "Hoe groot een blad mag zijn",
            "Aan de serverkant, dus een groot blad is het probleem van Google en niet van je laptop.",
            "50.000 rijen gemeten comfortabel. 100.000 geweigerd — browseropslag vol.",
          ],
          [
            "Beheer, auditlog, SSO",
            "Beheerconsole, auditlog, apparaatbeheer, single sign-on.",
            "Vereist een database; SSO verwijst door naar de providers die een omgeving noemt.",
          ],
        ]}
      />

      <H2 id="alternatief">
        Wanneer is Tougather een alternatief voor Google Workspace?
      </H2>
      <P>Eerst wanneer níet. Deze gevallen kosten je echt iets:</P>
      <List
        items={[
          "Een document moet voor een stuk of tien mensen tegelijk openstaan. De tekst voegt hier wel per teken samen, maar de schaal eromheen is Google's terrein.",
          "Gmail en Agenda zijn de kern van je dag — dan betaal je Google toch al.",
          "Een ICT-afdeling moet het goedkeuren. Zonder database is er geen organisatiebreed beheer om te laten zien.",
          "Je bladen lopen door tot boven de vijftigduizend rijen. Honderdduizend wordt geweigerd, en rijen los pagineren is een ander opslagmodel.",
          "Je leunt op Apps Script, of op pdf's lezen waar ze staan.",
        ]}
      />
      <P>
        Waar het wél past is smaller: één persoon, of een klein groepje dat
        vooral in verschillende paragrafen van hetzelfde stuk werkt. Een
        scriptie met de cijfers en de verdedigingspresentatie in één project. Is
        je vraag breder dan deze ene tool, dan staan{" "}
        <A href="/nl/vergelijk">alle vergelijkingen op een rij</A>, waaronder{" "}
        <A href="/nl/vergelijk/microsoft-365">hoe Microsoft 365 zich verhoudt</A>{" "}
        en <A href="/nl/vergelijk/notion">Notion vergeleken</A>.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Beginnen met schrijven">
        Geen account, niets te installeren. Open een project, plak er een tabel
        in en kijk of één plek beter werkt.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
