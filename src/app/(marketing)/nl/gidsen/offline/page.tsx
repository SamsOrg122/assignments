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
import { H2, P, PageShell } from "@/components/landing/PageShell";
import {
  type FaqItem,
  breadcrumbJsonLd,
  faqJsonLd,
  page,
  pageJsonLd,
  pageMetadata,
} from "@/lib/seo";

const SLUG = "/nl/gidsen/offline" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "waar-je-werk-staat", label: "Waar je werk staat" },
  { id: "de-app-zelf", label: "De app zelf, in de cache" },
  { id: "andere-tools", label: "Google, Microsoft en Notion" },
  { id: "naast-elkaar", label: "Naast elkaar" },
  { id: "back-up", label: "Wat er in een back-upbestand zit" },
  { id: "grenzen", label: "Wat browseropslag niet kan beloven" },
  { id: "database", label: "Wat een database verandert" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Werkt Google Docs offline?",
    answer:
      "Ja, in Chrome of Edge met de extensie Google Documenten offline en offline toegang aangezet in de instellingen van Drive — maar alleen voor bestanden die je vooraf als offline beschikbaar hebt gemarkeerd. Die volgorde is de valkuil: je regelt het met de verbinding die je kwijt gaat raken.",
  },
  {
    question: "Werkt Notion offline?",
    answer:
      "Ja, sinds 2024, op desktop en mobiel. Pagina's die je onlangs bezocht hebt zijn automatisch beschikbaar, en je kunt een pagina of een hele teamspace via het \u2022\u2022\u2022-menu op Available offline zetten. Wat je nooit geopend en nooit gemarkeerd hebt, opent niet, en bij het synchroniseren kunnen conflicten ontstaan.",
  },
  {
    question: "Wat gebeurt er met mijn wijzigingen als ik weer online kom?",
    answer:
      "Een tool die zijn werk op een server bewaart zet je wijzigingen in de wachtrij en speelt ze daarna af, en overal waar dezelfde alinea twee keer veranderde kan een conflict ontstaan. Hier wordt niets afgespeeld, want er stond niets te wachten: je bewerkingen gingen tijdens het typen al naar deze browser. Opnieuw verbinding maken telt alleen met een database, en dan geldt de regel per project en niet per alinea: de nieuwste tijdstempel wint.",
  },
  {
    question: "Werkt Tougather offline?",
    answer:
      "Ja, zonder iets aan te zetten en zonder account. Je werk gaat tijdens het typen naar de opslag van deze browser zelf, dus het enige dat ooit een netwerk nodig had was de app zelf, en daar houdt een service worker een kopie van. Wat offline niet werkt is alles achter /api: synchroniseren met je account, live sessies, en de assistent op de server. Die worden bewust nooit gecachet, zodat gegevens van het ene account niet worden teruggespeeld aan wie daarna de browser opent. Chat staat ook in deze browser, maar het meegeleverde chattransport is gesimuleerd met vaste tegenspelers, dus ook online bereikt er geen bericht een collega.",
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

export default function OfflineGidsPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Gids"
      title={page(SLUG).h1}
      lead="Offline is zelden een vliegtuig. Het is de intercity door een tunnel, de kelder van de UB, of campuswifi waar je wel op inlogt en die daarna niets meer doorlaat. Wat dat overleeft, is allang beslist: door de plek waar je tool je werk bewaart."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/guides/work-offline"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        Bij Google Docs en Notion is offline een gecachete kopie van iets dat op
        een server staat, en die regel je vooraf. Hier heeft de browser het
        origineel, dus valt er niets te regelen — en staat er ook niets op een
        server om op terug te vallen. Die tweede helft slaan we niet over.
      </Takeaway>

      <H2 id="waar-je-werk-staat">Waar je werk staat</H2>
      <P>
        Er zijn twee ontwerpen, en elk verschil hieronder volgt uit de vraag
        welke een tool koos. Bij het eerste staat je werk op een server en houdt
        je browser er een beeld van, dus offline werken betekent vooraf een
        kopie cachen en die later bijwerken. Bij het tweede is de browser de
        plek waar je werk geschreven wordt, en heeft de server de kopie.
      </P>
      <P>
        Tougather is het tweede, en je hoeft geen account te maken: het gratis
        plan heeft geen inlog. Wat je typt gaat naar de lokale opslag van deze
        browser, onder zes sleutels — projecten, chat, team, weergave, kit en
        sjablonen — met de lettertypes en afbeeldingen uit je kit in IndexedDB,
        want een lettertype is veel te groot voor de quota die die zes delen.
        Schrijven gebeurt gebundeld met 250 ms vertraging, weggeschreven bij{" "}
        <code>pagehide</code> en zodra je tabblad verborgen raakt — niet bij{" "}
        <code>beforeunload</code>, dat sommige browsers negeren.
      </P>

      <H2 id="de-app-zelf">De app zelf, in de cache</H2>
      <P>
        Het enige dat echt een netwerk nodig had, was de app: de JavaScript die
        de editor tekent. Een service worker bewaart die. Navigaties gaan eerst
        naar het netwerk met de gecachete schil erachter; andersom zou je
        vastzitten aan een oude versie tot je je browser leegde. Bestanden onder{" "}
        <code>/_next/static/</code> komen wél eerst uit de cache, want in hun
        naam zit een hash van de inhoud. Drie adressen staan er vooraf in — de
        bibliotheek, de offlinepagina en het logo — de rest komt erin zodra je
        het één keer mét verbinding opent.
      </P>
      <P>
        Verzoeken naar <code>/api/</code> worden helemaal niet gecachet, zodat
        een rij die voor het ene account werd opgehaald niet wordt teruggespeeld
        aan wie daarna de browser opent. Alles via de server is dus weg zolang
        het netwerk weg is: synchroniseren met je account, live sessies, de
        assistent. De lokale AI-stub antwoordt nog wel en zegt erbij dat hij
        lokaal is. Een webmanifest maakt de app installeerbaar — hij opent
        zelfstandig bij je bibliotheek — maar een echte app is er niet: geen
        React Native, Capacitor, Expo, Electron of Tauri in{" "}
        <code>package.json</code>. Geïnstalleerd is het dezelfde engine zonder
        adresbalk: dezelfde opslag, hetzelfde plafond.
      </P>

      <H2 id="andere-tools">Offline gebruiken in Google, Microsoft en Notion</H2>

      <H3 id="google">Google Documenten, Spreadsheets en Presentaties</H3>
      <P>
        Chrome of Edge, de extensie Google Documenten offline, offline toegang
        aan in de instellingen van Drive, en dan per bestand markeren wat je
        meeneemt. Alles offline is niet de standaard, en wat je niet gemarkeerd
        hebt gaat niet open. Verder kijken kan bij{" "}
        <A href="/nl/vergelijk/google-workspace">
          Google Workspace volledig vergeleken
        </A>
        .
      </P>

      <H3 id="microsoft">Microsoft 365</H3>
      <P>
        Welke Microsoft 365 je bedoelt bepaalt het antwoord. De programma&apos;s
        op je bureaublad waren offline-first voordat dat woord bestond: het
        bestand staat op je schijf en OneDrive werkt het bij zodra het kan. De
        webversies van Word en Excel zijn daar geen vervanging voor, en een
        licentie via je opleiding betekent meestal de bureaubladversies.
      </P>

      <H3 id="notion">Notion</H3>
      <P>
        Ja, en beter dan het was. Pagina&apos;s die je onlangs bezocht hebt
        zijn automatisch beschikbaar, en een pagina of een hele teamspace kun je
        via het &bull;&bull;&bull;-menu op Available offline zetten. Wat je
        nooit geopend en nooit gemarkeerd hebt, opent niet.{" "}
        <A href="/nl/vergelijk/notion">De volledige Notion-vergelijking</A> gaat
        over de rest.
      </P>

      <H2 id="naast-elkaar">Naast elkaar</H2>
      <Table
        caption="Offline gedrag per tool. Vijf van deze zeven rijen pakken slecht uit voor Tougather."
        columns={["", "Google Docs", "Microsoft 365 op je bureaublad", "Notion", "Tougather"]}
        minWidth={900}
        rows={[
          [
            "Instellen vóór de verbinding wegvalt",
            "Extensie, offline toegang aan, bestanden markeren.",
            "Niets.",
            "Automatisch voor recente pagina\u2019s; de rest markeer je vooraf.",
            "Niets.",
          ],
          [
            "Wat opent zonder netwerk",
            "Alleen wat je gemarkeerd hebt.",
            "Elk bestand op je schijf.",
            "Pagina's die je bezocht hebt.",
            "Alles wat deze browser bevat.",
          ],
          [
            "Waar het staat als het tabblad dicht is",
            "Bij Google, plus een cache.",
            "Een echt bestand op je schijf, dat ook andere programma's openen.",
            "Bij Notion, plus een cache.",
            "In de opslag van deze browser. Geen bestand tot je exporteert.",
          ],
          [
            "Je wist je browsergegevens en…",
            "Opnieuw inloggen. Niets kwijt.",
            "Niet van toepassing. Het bestand staat op schijf.",
            "Opnieuw inloggen. Niets kwijt.",
            "Weg, zonder back-upbestand of database.",
          ],
          [
            "Op een tweede apparaat krijgen",
            "Automatisch.",
            "OneDrive regelt het.",
            "Automatisch.",
            "Een back-upbestand meenemen, of een database instellen.",
          ],
          [
            "Hoeveel het aankan",
            "Serverkant.",
            "Zoveel als je schijf aankan.",
            "Serverkant.",
            "50.000 rijen comfortabel. 100.000 geweigerd.",
          ],
          [
            "Geïnstalleerde app",
            "Browser, of de mobiele apps.",
            "Echte programma's voor je bureaublad.",
            "Apps voor bureaublad en mobiel.",
            "Een installeerbare PWA. Niets natives.",
          ],
        ]}
      />

      <H2 id="back-up">Wat er in een back-upbestand zit</H2>
      <P>
        Eén JSON-bestand, en dat is de hele werkruimte en geen lijstje ervan: de
        zes opgeslagen blokken precies zoals de lokale opslag ze bewaart, plus
        de lettertypes en afbeeldingen uit je kit, weer uit IndexedDB gelezen —
        een back-up die je lettertypes wel noemt maar niet meeneemt is de
        vervelendste soort half werk. Er zit een formaatmarkering en een
        versienummer in, en de naam is de dag zelf:{" "}
        <code>tougather-2026-08-13.json</code>.
      </P>
      <P>
        De wachtrij wordt eerst weggeschreven, dus een bestand dat je een kwart
        seconde na je laatste wijziging maakt bevat die wijziging gewoon.
        Terugzetten is onomkeerbaar en gaat daarom in twee stappen: eerst
        gelezen, dan aan je beschreven met een aantal projecten en een
        exportdatum, en pas toegepast als je bevestigt. Een bestand van een
        nieuwere versie wordt geweigerd in plaats van half gelezen. Apart
        daarvan waarschuwen de instellingen zodra dit domein voor meer dan 80%
        vol zit.
      </P>

      <H2 id="grenzen">Wat browseropslag niet kan beloven</H2>

      <H3 id="plafond">Het gemeten plafond</H3>
      <P>
        Gemeten en niet geschat: een script opent een tabel van N rijen, typt er
        één teken in en klokt de rondgang naar de opslag. Duizend rijen is 0,1
        MB en opent in 0,45 s. Vijftigduizend is 3,4 MB, opent in 0,56 s en zet
        een toetsaanslag in 118 ms op het scherm. Honderdduizend rijen is 6,8 MB
        en wordt geweigerd: de browseropslag is vol. Het plafond is dus de
        opslag en niet het raster — miljoenen rijen vragen een ander
        opslagmodel, en dat is echt werk en geen instelling. Het is niet gedaan.
      </P>

      <H3 id="geweigerd">Als de browser nee zegt</H3>
      <P>
        Dan verschijnt er een balk over de bovenkant van de app die je niet kunt
        wegklikken. Hij zegt de twee nuttige dingen: dat wat op je scherm staat
        niet meer opgeslagen wordt, en hoe groot de schrijfactie was die de
        browser weigerde. Alleen bij een echte weigering, nooit bij een
        percentage, want een balk die vals alarm slaat is er een die mensen
        leren wegscrollen. De geweigerde waarde blijft in de wachtrij staan, dus
        iets weggooien laat hem bij de volgende ronde alsnog landen.
      </P>

      <H3 id="wissen">Opruimen, en de zin die telt</H3>
      <P>
        Browsers gooien opslag met de status &ldquo;best effort&rdquo; weg als
        ze ruimte nodig hebben, zonder iemand iets te melden, en je merkt het
        doordat je bibliotheek leeg is. De app vraagt om blijvende opslag,
        waarmee dit domein uit die opruimvijver gaat: Chrome geeft dat stil op
        basis van hoe vaak je terugkomt, Firefox vraagt het, Safari negeert het,
        en in de instellingen zie je welk antwoord je kreeg. Ook toegekend stopt
        dat alleen het <em>automatisch</em> opruimen. Zelf je sitegegevens
        wissen haalt alles alsnog weg, net als een gedeelde laptop, een opnieuw
        geïnstalleerde machine en een gestolen tas. Werk in een browser is geen
        back-up, en geen enkele offlinemodus maakt dat anders. Er zijn twee
        antwoorden — het bestand hierboven en een database — en voor één daarvan
        moet iemand op een knop drukken. Duurt je project maanden, lees dit dan
        naast{" "}
        <A href="/nl/gidsen/scriptie-schrijven">
          scriptie schrijven zonder verbinding
        </A>
        .
      </P>

      <H2 id="database">Wat een database verandert</H2>
      <P>
        Twee publieke omgevingsvariabelen, en de browser is niet langer de enige
        plek. Synchronisatie duwt en haalt dan hele projecten. Het is geen CRDT:
        één project is één document en de nieuwste tijdstempel wint, wat eerlijk
        is over waar het voor bedoeld is — dezelfde persoon eerst op een laptop
        en daarna op een telefoon, niet twee mensen tegelijk. Een pull
        verwijdert nooit een project dat hij niet eerder zag, een mislukte pull
        annuleert de push, en een verwijdering is een bewaarde grafsteen die
        overleeft dat je hem offline maakte. Diezelfde variabelen laten
        formulierantwoorden ergens aankomen en zetten het auditlog aan, dat
        zonder database met opzet ontbreekt: een log van één browser is een
        dagboek. <A href="/nl/gidsen">De rest van onze gidsen</A> pakt het daar
        op.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Open de bibliotheek">
        Geen account, niets te installeren, niets om eerst aan te zetten. Maak
        iets, zet je wifi uit en herlaad de pagina.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
