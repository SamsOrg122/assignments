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
  softwareApplicationJsonLd,
} from "@/lib/seo";

const SLUG = "/nl/vergelijk" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "wat-dit-is", label: "Wat deze vier pagina's zijn" },
  { id: "de-ruil", label: "De ruil, één keer opgeschreven" },
  { id: "vergelijkingen", label: "De vier vergelijkingen" },
  { id: "hoe-in-plaats-van-of", label: "Gaat je vraag over hoe, niet over of" },
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
 * De regel waar elke kaart op eindigt.
 *
 * Een overzichtspagina die vier titels opsomt zonder te zeggen wat er uit kwam,
 * dwingt de lezer alle vier te openen. Elke pagina in deze reeks eindigt bij een
 * tool die iemand beter kan houden, dus die zin staat hier.
 */
function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-l border-line-strong pl-3.5 text-[13.5px] leading-relaxed text-fg-muted text-pretty">
      {children}
    </p>
  );
}

/** De tool die je houdt, vet, zodat de vier adviezen als set te scannen zijn. */
function Keep({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-fg">{children}</strong>;
}

/** Inline code. `children` is een string-prop, dus quotes hoeven niet ontsnapt. */
function C({ children }: { children: string }) {
  return <code className="font-mono text-[13.5px] text-fg">{children}</code>;
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
    slug: "/nl/vergelijk/microsoft-365",
    anchor: "Tougather vs. Microsoft 365",
    body: (
      <>
        Het hele kantoorpakket, inclusief de helft waar hier niets tegenover
        staat. De pagina rekent beide kanten door bij vijf en bij twintig
        zetels, en is precies over wat een Word-bestand onderweg verliest:
        formules gaan mee als LaTeX-broncode en niet als Word-vergelijkingen, en
        paginanummers staan wel in de .docx maar niet in een afdruk vanuit de
        browser. Zoek je nog op &ldquo;Office 365&rdquo;, dan gaat het over
        hetzelfde pakket onder de oude naam.
      </>
    ),
    verdict: (
      <>
        <Keep>Blijf bij Microsoft 365</Keep> als Outlook, Teams of een werkmap
        vol macro&apos;s dragend is — zes van de twaalf rijen op die pagina gaan
        naar Microsoft. Wat kan verhuizen is het deel waarin je dingen máákt,
        niet je mail.
      </>
    ),
  },
  {
    slug: "/nl/vergelijk/google-workspace",
    anchor: "Tougather vs. Google Workspace",
    body: (
      <>
        De spannendste van de vier, want die gaat over samenwerken. De pagina
        zegt eerst wat een live sessie hier precies is — wie er is, de cursor
        van de ander, wijzigingen als wijzigingen en niet als hele kopieën — en
        noemt in dezelfde adem de grens. Ook het antwoord op &ldquo;waar staan
        mijn gegevens&rdquo; staat er onverbloemd: in je eigen browser.
      </>
    ),
    verdict: (
      <>
        <Keep>Blijf bij Google Workspace</Keep> als jullie geregeld met z&apos;n
        tweeën in dezelfde alinea typen, of als Gmail en Agenda de kern van je
        dag zijn. Google voegt per teken samen; hier gaat het per blok en wint
        de laatste schrijver.
      </>
    ),
  },
  {
    slug: "/nl/vergelijk/notion",
    anchor: "Tougather vs. Notion",
    body: (
      <>
        Dezelfde vorm, andere binnenkant: één werkplek, blokken in plaats van
        bestanden, een pagina in plaats van een map. Juist omdat de vormen zo op
        elkaar lijken zit het verschil in de details, en die staan er precies —
        databases en rollups aan de ene kant, een formulemotor, slides en een
        pagina die je kunt inleveren aan de andere.
      </>
    ),
    verdict: (
      <>
        <Keep>Blijf bij Notion</Keep> als je werkruimte op gekoppelde databases
        draait, of als je dezelfde rijen ook als bord en agenda bekijkt. Er is
        hier geen relatie-eigenschap, geen rollup, en precies één weergave: het
        raster.
      </>
    ),
  },
  {
    slug: "/nl/vergelijk/excel",
    anchor: "Tougather vs. Excel",
    body: (
      <>
        Eén onderdeel in plaats van een pakket: 167 functies tegenover de
        diepste spreadsheet die er is, wat er van een xlsx-bestand overeind
        blijft, en bij hoeveel rijen de browser weigert op te slaan. Er staat
        ook een stuk in dat je nergens anders nodig hebt: hoe dit zich verhoudt
        tot een Nederlandse Excel.
      </>
    ),
    verdict: (
      <>
        <Keep>Houd Excel</Keep> als je modellen bouwt, macro&apos;s draait of
        voorbij vijftigduizend rijen werkt — acht van de twaalf rijen op die
        pagina gaan naar Excel. En let op de namen: je typt <C>VLOOKUP</C>, niet{" "}
        <C>VERT.ZOEKEN</C>.
      </>
    ),
  },
];

export default function VergelijkHubPagina() {
  const entry = page(SLUG);
  const en = counterparts(SLUG).en;

  return (
    <PageShell
      lang="nl"
      eyebrow="Vergelijken"
      title={entry.h1}
      lead="Vier pagina's, vier tools, en op alle vier dezelfde regel: ze beginnen bij wat de ander beter doet. Deze pagina is wat die vier gemeen hebben — de ruil die je krijgt aangeboden, en welke pagina je als eerste moet lezen."
    >
      <JsonLd
        data={[
          breadcrumbJsonLd(SLUG),
          pageJsonLd(SLUG),
          softwareApplicationJsonLd(),
        ]}
      />
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
        Elke pagina hier eindigt bij iemand die beter kan houden wat hij heeft.
        Microsoft 365 als Outlook of Teams dragend is. Google Workspace als
        jullie tegelijk in dezelfde alinea schrijven. Notion als je werk op
        gekoppelde databases draait. Excel als je modellen bouwt. Wat na die
        vier uitzonderingen overblijft, is waar dit voor gemaakt is: één
        document met de cijfers, de slides en de tekst erin.
      </Takeaway>

      <Contents slug={SLUG} items={TOC} />

      <H2 id="wat-dit-is">Wat deze vier pagina&apos;s zijn</H2>
      <P>
        Elke pagina beantwoordt één vraag — moet ik overstappen — en houdt daar
        op. Hóé je iets doet is het werk van{" "}
        <A href="/nl/gidsen">onze gidsen stap voor stap</A>; een vergelijking
        die overgaat in een handleiding beantwoordt een vraag die op die pagina
        niemand stelde. Je vindt hier dus geen formule-uitleg en geen
        deck-indeling, wel links ernaartoe.
      </P>
      <P>
        Ze zijn geschreven vanuit de code en niet vanuit een productpagina, en
        dat zie je aan de vorm van de cijfers. De functiebibliotheek is geteld
        terwijl hij draaide en niet geschat: 167 functies, waarvan er negen met
        opzet ontbreken en dat ook zeggen zodra je ze typt. De opslaggrens is
        met een script gemeten — vijftigduizend rijen is 3,4 MB en opent in 0,56
        seconde; bij honderdduizend is het 6,8 MB en weigert de browser de
        opslag. Wat niet te controleren viel, staat er niet.
      </P>
      <P>
        Op elke pagina staat bovendien een tabel waarin meerdere rijen verlies
        zijn, en er staat bij hoeveel. Dat is de eerlijke vorm van een
        vergelijking die door de kleinste partij geschreven is; kwam er iets
        anders uit, dan was het een advertentie met een tabel erin.
      </P>

      <H2 id="de-ruil">De ruil, één keer opgeschreven</H2>
      <P>
        Wat je wint is bij alle vier hetzelfde. Een project is geen vier
        bestanden maar één canvas van blokken in negen soorten: tekst, tabel,
        grafiek, slides, code, afbeelding, bronnenlijst, inhoudsopgave en
        formulier. Een grafiek bewaart het id van de tabel waaruit hij leest,
        dus dat zijn dezelfde gegevens die je twee keer ziet — geen spreadsheet
        plus een plaatje van een spreadsheet dat sinds maart niet meer klopt.
        Voetnoten nummeren zichzelf, en de inhoudsopgave wordt bij elke
        weergave afgeleid in plaats van opgeslagen.
      </P>
      <P>
        Wat het kost is ook bij alle vier hetzelfde, dus dan kan het net zo goed
        hier staan als vier keer verderop. Er is geen e-mail en geen agenda —
        niets, ook geen uitgeklede versie. Live samen typen gaat per blok en de
        laatste schrijver wint; het is geen CRDT. In verschillende paragrafen
        gebeurt er nooit iets, in dezelfde alinea op dezelfde seconde wel.
        Beheer werkt alleen met een database eronder, SSO is een doorverwijzing
        naar de providers die een installatie zelf noemt, en SCIM is er niet.
        De spreadsheet kent geen macro&apos;s en geen uitvouwende matrices. De
        pdf-export is het afdrukvenster van je browser, en pdf&apos;s inlezen
        kan helemaal niet. Het chatmodel is echt, maar het meegeleverde
        transport is gesimuleerd.
      </P>
      <P>
        Eén vraag die in Nederland vaker gesteld wordt dan in de meeste andere
        markten: waar staan mijn gegevens. Het antwoord is hier ongewoon kort.
        In je eigen browser, in de lokale opslag van het apparaat waarop je het
        schreef, want de gratis versie heeft geen login. Niemand kan het lezen,
        wij ook niet, want er is geen plek om het te lezen — en er is dus ook
        geen back-up: browsergegevens wissen is werk wissen. Een database zet
        een beheerder er zelf onder; standaard staat die niet aan.
      </P>
      <P>
        De prijzen liggen vast en zijn handig om bij de hand te hebben voordat
        je een van de vier opent. Gratis is €0, vraagt geen account en bevat 200
        AI-credits per maand die stoppen in plaats van een rekening te worden.
        Pro is €14 per maand en gaat niet per zetel. Team is €24 per zetel, dus
        €1.440 per jaar bij vijf zetels en €5.760 bij twintig. Eén ding hoor je
        liever hier dan bij de kassa: afrekenen kan vandaag niet, want alle
        Stripe-prijs-ID&apos;s in de betaalcode staan nog op null.
      </P>

      <H2 id="vergelijkingen">De vier vergelijkingen</H2>
      <P>
        In de volgorde waarin ze meestal gelezen worden. Elke kaart eindigt bij
        wat die pagina concludeert, en dat is telkens een tool die iemand beter
        kan houden.
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

      <H2 id="hoe-in-plaats-van-of">
        Gaat je vraag over hoe, niet over of
      </H2>
      <P>
        Wie al gekozen heeft, heeft aan een vergelijking niets.{" "}
        <A href="/nl/gidsen">Onze gidsen stap voor stap</A> nemen de andere
        helft over: een scriptie van onderwerp tot eindversie, een pitch deck
        van twaalf slides, twintig formules met het antwoord dat er echt uit
        kwam, en wat er blijft werken als het internet uitvalt. Ze noemen
        dezelfde grenzen als deze pagina&apos;s, want eronder zit hetzelfde
        product.
      </P>

      <CallToAction href="/library" label="Open een project">
        Geen login, niets op te zeggen — de gratis versie heeft geen account.
        Plak er een .docx en een .xlsx in die je al hebt, en kijk welke van de
        vier vergelijkingen over jou ging.
      </CallToAction>
    </PageShell>
  );
}
