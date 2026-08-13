import Link from "next/link";
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  Breadcrumbs,
  CallToAction,
  Contents,
  H3,
  JsonLd,
  Takeaway,
  type TocItem,
} from "@/components/landing/LongForm";
import {
  type Slug,
  breadcrumbJsonLd,
  counterparts,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/nl/gidsen" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "waar-een-gids-voor-is", label: "Waar een gids hier voor is" },
  { id: "gecontroleerd", label: "Geschreven tegen iets dat gedraaid heeft" },
  { id: "de-gidsen", label: "De vier gidsen" },
  { id: "of-in-plaats-van-hoe", label: "Gaat je vraag over of, niet over hoe" },
];

/** De inline link van dit repository, zodat elke body-link er gelijk uitziet. */
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

/**
 * De regel waar elke kaart op eindigt: het ene ding dat die gids beslecht.
 *
 * Vier titels met vier samenvattingen dwingen de lezer alle vier te openen om
 * te zien of er eentje over zijn probleem gaat. Elke gids hier draait om één
 * zin, dus die zin staat erbij.
 */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l border-line-strong pl-3.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
      {children}
    </p>
  );
}

/** Inline code. `children` is een string-prop, dus quotes hoeven niet ontsnapt. */
function C({ children }: { children: string }) {
  return <code className="font-mono text-[13.5px] text-fg">{children}</code>;
}

/** Het label waarmee elke conclusie begint. */
function Label() {
  return (
    <strong className="font-medium text-fg">Wat het beslecht:</strong>
  );
}

interface Card {
  slug: Slug;
  /** Ankertekst uit de linkkaart. Doet tegelijk dienst als kaarttitel. */
  anchor: string;
  body: React.ReactNode;
  verdict: React.ReactNode;
}

const CARDS: Card[] = [
  {
    slug: "/nl/gidsen/scriptie-schrijven",
    anchor: "Scriptie schrijven: het stappenplan",
    body: (
      <>
        Negen stappen die elk eindigen in iets dat een ander kan lezen, een plan
        van aanpak met hbo en wo apart, een hoofdstukindeling met een
        woordendoel per paragraaf, en een weekplanning van twintig weken. De
        laatste stukken gaan over inleveren als .docx met bijgehouden
        wijzigingen, en over waar Word beter blijft dan dit.
      </>
    ),
    verdict: (
      <>
        <Label /> vier instellingen — bronstijl, noten, inhoudsopgave,
        kruisverwijzingen — kosten tien minuten in week 1 of een weekend in week
        19. En je eerste volledige versie hoort in week 15, niet in week 19.
      </>
    ),
  },
  {
    slug: "/nl/gidsen/pitch-deck",
    anchor: "Een pitch deck maken, slide voor slide",
    body: (
      <>
        Twaalf slides met elk één taak, in een volgorde die geen gewoonte is
        maar een bewijsketen: elke slide beantwoordt het bezwaar dat de vorige
        opriep. Daarna de mechaniek — welke zin je afdrukt en welke je zelf
        uitspreekt, welke cijfers als eerste gevraagd worden, en repeteren met
        een klok op een tweede scherm.
      </>
    ),
    verdict: (
      <>
        <Label /> een slide die geen bezwaar beantwoordt is geen korte slide
        maar een slide om te schrappen. En bij Nederlandse investeerders wegen
        je aannames zwaarder dan je totalen, dus die zet je naast het getal en
        niet in een bijlage.
      </>
    ),
  },
  {
    slug: "/nl/gidsen/formules",
    anchor: "20 spreadsheetformules met voorbeelden",
    body: (
      <>
        SOM, SOM.ALS, AANTAL.ALS, ALS, VERT.ZOEKEN, X.ZOEKEN, INDEX,
        VERGELIJKEN, TEKST, de datumfuncties, BET, NHW en CORRELATIE — elk met
        de Engelse naam ernaast en met een voorbeeld dat echt gedraaid heeft.
        Er staat één sectie in die je in geen enkele Engelse handleiding vindt:
        de Nederlandse en Engelse formulenamen in één tabel naast elkaar.
      </>
    ),
    verdict: (
      <>
        <Label /> de puntkomma tussen argumenten mag, de decimale komma niet.{" "}
        <C>=1,5*B2</C> geeft <C>#VALUE!</C>. Erger is een komma binnen een
        functie: <C>PMT(0,06/12; 60; 12000)</C> leest <C>0</C> en <C>06</C> als
        twee argumenten en rekent door zonder foutmelding.
      </>
    ),
  },
  {
    slug: "/nl/gidsen/offline",
    anchor: "Offline doorwerken zonder internet",
    body: (
      <>
        Wat Google Docs, Microsoft 365, Notion en Tougather offline doen, hoe je
        die offlinemodus vooraf aanzet, wat er precies in een back-upbestand
        zit, en wat browseropslag niet kan beloven. Inclusief wat er gebeurt
        zodra je weer verbinding hebt.
      </>
    ),
    verdict: (
      <>
        <Label /> bij Google Docs en Notion is offline een gecachete kopie die
        je vooraf regelt — met precies de verbinding die je gaat kwijtraken.
        Hier heeft de browser het origineel, en staat er dus ook niets op een
        server om op terug te vallen.
      </>
    ),
  },
];

export default function GidsenHubPagina() {
  const entry = page(SLUG);
  const en = counterparts(SLUG).en;

  return (
    <PageShell
      lang="nl"
      eyebrow="Gidsen"
      title={entry.h1}
      lead="Vier klussen die op dezelfde paar plekken misgaan: een scriptie, een pitch deck, een spreadsheet, en een dag zonder verbinding. Deze gidsen gaan over de mechaniek van afmaken en niet over motivatie, en je hoeft er niets voor aan te schaffen."
    >
      <JsonLd data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG)]} />
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

      <Takeaway title="Kort samengevat">
        Een scriptie strandt op de vier instellingen die niemand in week 1
        maakte. Een deck strandt op slides die geen bezwaar beantwoorden. Een
        spreadsheet strandt op een adres dat één rij misstaat. Een dag offline
        strandt op een instelling waarvoor je internet nodig had. Elke gids gaat
        over één daarvan, in die volgorde.
      </Takeaway>

      <Contents slug={SLUG} items={TOC} />

      <H2 id="waar-een-gids-voor-is">Waar een gids hier voor is</H2>
      <P>
        Een gids beantwoordt hóé je iets doet. Of je van tool moet wisselen is
        een andere vraag met eigen pagina&apos;s, en die twee door elkaar halen
        levert een handleiding op die je niet kunt vertrouwen en een
        vergelijking die je niet kunt volgen. Op deze vier pagina&apos;s staat
        dus nergens dat je moet overstappen; waar een grens ertoe doet wordt die
        genoemd, en{" "}
        <A href="/nl/vergelijk">vergelijk Tougather met je huidige tools</A> is
        de plek waar dat betoog wél staat.
      </P>
      <P>
        Die afspraak bepaalt wat erin komt. Een scriptiegids die uitgaat van één
        bepaalde editor is nutteloos voor wie van de opleiding Word móét
        gebruiken, dus gaat de scriptiegids over nummering, kruisverwijzingen,
        bronstijlen en de staat waarin je begeleider het bestand wil hebben —
        dingen die in elke tool waar zijn en in elke tool duur worden als je ze
        laat liggen. De offlinegids behandelt Google Docs, Microsoft 365 en
        Notion voordat er één zin over deze tool staat, want voor de meeste
        lezers gaat het antwoord over het programma dat ze al open hebben.
      </P>

      <H2 id="gecontroleerd">Geschreven tegen iets dat gedraaid heeft</H2>
      <P>
        De formulegids is het duidelijkste geval. Alle twintig voorbeelden zijn
        uitgevoerd tegen één klein project van twee tabellen, en de regel onder
        elke formule is wat de motor teruggaf — inclusief het voorbeeld dat er
        verkeerd uit komt. Er zitten 167 functies in, en negen ontbreken met
        opzet in plaats van per ongeluk: <C>RAND</C>, <C>RANDBETWEEN</C>,{" "}
        <C>UNIQUE</C>, <C>SORT</C>, <C>FILTER</C>, <C>TRANSPOSE</C>,{" "}
        <C>INDIRECT</C>, <C>OFFSET</C> en macro&apos;s. Typ je er zo een, dan
        krijg je een zin met de reden en geen <C>#NAME?</C>.
      </P>
      <P>
        Voor Nederlandse lezers zit daar één ding bij dat je vooraf wilt weten:
        de functienamen vertalen niet mee met je taalinstelling zoals Excel dat
        doet. Je typt <C>SUM</C>, <C>IF</C> en <C>VLOOKUP</C>, niet SOM, ALS en
        VERT.ZOEKEN, en de foutcodes zijn om dezelfde reden Engels. De
        puntkomma tussen argumenten wordt wél geaccepteerd, want dat is wat een
        Nederlandse Excel schrijft, en de csv-lezer raadt het scheidingsteken
        zelf over komma, puntkomma, tab en pipe. Beide namenlijsten staan in de
        formulegids naast elkaar.
      </P>
      <P>
        Waar een gids het product aanraakt, geldt dezelfde regel. Bronvermelding
        kan in vier stijlen — APA 7, MLA 9, Chicago en Harvard — en een bron die
        uit een DOI of een BibTeX-regel gelezen is, markeert de velden die
        geraden zijn als onzeker, want de bronlezer gaat nooit het netwerk op.
        De inhoudsopgave wordt bij elke weergave afgeleid en nooit opgeslagen,
        dus die kan niet met het document in tegenspraak raken. Paginanummers
        gaan de Word-export in en overleven een browserafdruk niet, omdat geen
        enkele browser de CSS-marges eromheen ondersteunt. Een gids is een
        slechte plek om daar achteraf achter te komen.
      </P>
      <P>
        Er zit niets achter een betaalmuur. De gratis versie heeft geen login en
        geen account, dus elke stap in deze gidsen kun je gewoon doorlopen — wat
        ook wel zo handig is, want betalen kan sowieso nog niet: alle
        Stripe-prijs-ID&apos;s in de betaalcode staan nog op null. Een gids die
        pas werkt na een aankoop is een advertentie met stappen erin.
      </P>

      <H2 id="de-gidsen">De vier gidsen</H2>
      <P>
        Elke kaart eindigt bij het ene ding dat die gids beslecht: de zin die je
        gelezen wilt hebben, ook als je de rest nooit opent.
      </P>
      <ul className="mt-2 divide-y divide-line border-t border-line">
        {CARDS.map((card) => (
          <li key={card.slug} className="pb-6">
            <H3>
              <Link
                href={card.slug}
                className="transition-colors hover:text-fg-muted"
              >
                {card.anchor}
              </Link>
            </H3>
            <P>{card.body}</P>
            <Verdict>{card.verdict}</Verdict>
          </li>
        ))}
      </ul>

      <H2 id="of-in-plaats-van-hoe">Gaat je vraag over of, niet over hoe</H2>
      <P>
        Wie in de trein de offlinegids opzoekt, stelt een smallere vraag dan wie
        bepaalt waar zijn team volgend jaar in werkt. Die tweede vraag wordt
        beantwoord in{" "}
        <A href="/nl/vergelijk">alle vergelijkingen op een rij</A>: Microsoft
        365, Google Workspace, Notion en Excel, elk met een tabel waarin
        meerdere rijen verlies zijn, en elk eindigend bij een tool die iemand
        beter kan houden.
      </P>

      <CallToAction href="/library" label="Begin met schrijven">
        Geen login, niets te installeren, niets op te zeggen. Open een project,
        loop er één gids in door, en stop zodra het niets meer oplevert.
      </CallToAction>
    </PageShell>
  );
}
