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

const SLUG = "/nl/vergelijk/microsoft-365" as const;

export const metadata = pageMetadata(SLUG);

const CONTENTS: TocItem[] = [
  { id: "waar-365-wint", label: "Waar Microsoft 365 beter is" },
  { id: "waar-een-werkruimte-wint", label: "Waar één werkruimte wint" },
  { id: "naast-elkaar", label: "Naast elkaar" },
  { id: "prijs", label: "Wat het kost" },
  { id: "niet-overstappen", label: "Wanneer je niet moet overstappen" },
  { id: "vragen", label: "Vragen die het eerst komen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Kan ik mijn Word- en Excel-bestanden openen in Tougather?",
    answer:
      "Ja. Bij een .docx komen koppen, lijsten, tabellen, voetnoten en bijgehouden wijzigingen mee; die wijzigingen landen als voorstellen die je accepteert of afwijst. Bij een .xlsx komen waarden en datums mee. Formules niet: een cel met =B2*C2 komt binnen als het getal dat er het laatst uit kwam. Macro's en VBA ook niet, want er is niets dat ze uitvoert.",
  },
  {
    question: "Vervangt Tougather ook Outlook en Teams?",
    answer:
      "Nee. Tougather dekt documenten, spreadsheets, slides, een oneindig bord en chat, en host geen e-mail en geen agenda. Het chatmodel is echt, maar het meegeleverde transport is gesimuleerd, dus draait je team nu op Teams, blijf dan op Teams.",
  },
  {
    question: "Is Tougather goedkoper dan Microsoft 365?",
    answer:
      "Gratis is €0 en vraagt geen account. Pro kost €14 per maand en gaat niet per zetel. Team kost €24 per zetel per maand: €1.440 per jaar bij vijf zetels, €5.760 bij twintig. Microsoft 365 reken je per persoon af, dus zet dat bedrag ernaast. Eén kanttekening: afrekenen kan hier nog niet, want alle Stripe-prijs-ID's staan nog op null.",
  },
  {
    question:
      "Kan ik Tougather gebruiken als mijn opleiding of werkgever Microsoft 365 voorschrijft?",
    answer:
      "Voor je eigen schrijfwerk meestal wel. De Word-export bevat voetnoten, paginanummers en Word's eigen bijgehouden wijzigingen, dus je begeleider kijkt het gewoon in Word na. Let op twee dingen: formules gaan mee als LaTeX-broncode en niet als Word-vergelijkingen, en paginanummers staan wel in het Word-bestand maar niet in een afdruk vanuit de browser.",
  },
];

const COLUMNS = ["", "Microsoft 365", "Tougather"];

const ROWS = [
  [
    "Spreadsheetfuncties",
    "Meer, plus dynamische matrices en VBA",
    "167, met Engelse namen. Geen spill, geen macro's",
  ],
  [
    "Rijen in één blad",
    "Ruim een miljoen",
    "50.000 gemeten comfortabel; bij 100.000 weigert de opslag",
  ],
  ["E-mail en agenda", "Outlook, gehoste mail", "Niets. Je houdt je mailbox"],
  [
    "Chat en vergaderen",
    "Teams, met bellen",
    "Het model is echt; het transport is gesimuleerd",
  ],
  [
    "Samen in één bestand",
    "Co-auteurschap in Word en Excel",
    "Per gedeeld project, per blok wint de laatste",
  ],
  [
    "Beheer, auditlog, SSO",
    "Centraal beheer, uitrol per gebruiker",
    "Beheer vereist een database; geen SCIM",
  ],
  [
    "Zonder verbinding",
    "Bureaubladapps, geen browser nodig",
    "Installeerbare PWA, laatst bekende versie",
  ],
  [
    "Document, sheet, slides, bord",
    "Vier apps, vier bestanden",
    "Eén project, negen bloktypes, één kopie",
  ],
  [
    "Gebruiken zonder account",
    "Een Microsoft-account, elk abonnement",
    "Het gratis plan heeft geen login",
  ],
  ["Word-export", "Van huis uit", "Echte OOXML; formules als LaTeX"],
  ["Pdf", "Schrijft een pdf-bestand", "Afdrukken via het printvenster"],
  ["Prijs", "Per persoon, per maand", "€0, €14 per maand of €24 per zetel"],
];

export default function VergelijkMicrosoft365Page() {
  const entry = page(SLUG);
  const en = counterparts(SLUG).en;

  return (
    <PageShell
      lang="nl"
      eyebrow="Vergelijken"
      title={entry.h1}
      lead="Microsoft 365 is vier goede programma's plus een mailserver. Dit is één documentmodel zonder mailserver erin. Hieronder staat waar die ruil in ons nadeel uitvalt, en waar hij de andere kant op valt."
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
        Draait je werk op Outlook, op Teams of op een werkmap vol macro&apos;s,
        blijf dan zitten waar je zit. Daar staat hier niets tegenover. Open je
        alleen Word, Excel en PowerPoint, en zit de ergernis in één opdracht die
        over drie bestanden verspreid staat, dan vervangt dit precies dat stuk
        en verder niets.
      </Takeaway>

      <Contents slug={SLUG} items={CONTENTS} />

      <H2 id="waar-365-wint">Waar Microsoft 365 beter is</H2>
      <P>
        Een vergelijking waarin de ander nergens wint is geen vergelijking maar
        een advertentie. Alles hieronder is nagekeken in de code.
      </P>

      <H3>Excel, zodra het serieus wordt</H3>
      <P>
        De spreadsheet heeft 167 functies in één bibliotheek, waarvan elf
        financieel en vijftien statistisch. Negen ontbreken met opzet. RAND en
        RANDBETWEEN, omdat een cel die bij elke weergave verandert niet te
        vergelijken is met wat er een seconde eerder stond. UNIQUE, SORT, FILTER
        en TRANSPOSE, omdat die overlopen in cellen die je niet geselecteerd
        hebt en dat spill-model hier niet bestaat. INDIRECT en OFFSET, omdat ze
        tijdens het rekenen een verwijzing uit tekst opbouwen. En VBA: er zijn
        geen macro&apos;s.
      </P>
      <P>
        Nog iets waar je als Nederlandse Excel-gebruiker meteen tegenaan loopt:
        de functienamen zijn hier Engels. Je typt SUM, IF en VLOOKUP, niet SOM,
        ALS en VERT.ZOEKEN. Beide namen naast elkaar staan in{" "}
        <Link
          href="/nl/gidsen/formules"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          de formules die je in beide tools gebruikt
        </Link>
        .
      </P>
      <P>
        De grens is gemeten, niet geschat. Bij 50.000 rijen opent een tabel in
        0,56 seconde en staat een aanslag na 118 milliseconden op het scherm.
        Bij 100.000 rijen weigert de browser de opslag — 6,8 MB is te veel — en
        verschijnt er een balk die zegt dat je werk niet meer bewaard wordt.
        Excel doet ruim een miljoen rijen per blad. Alleen dat onderdeel staat
        in{" "}
        <Link
          href="/nl/vergelijk/excel"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          alleen spreadsheets, vergeleken met Excel
        </Link>
        .
      </P>

      <H3>Outlook: mail en agenda</H3>
      <P>
        Geen e-mail, geen agenda. Geen uitgeklede versie, geen punt op een
        routekaart. Voor de meeste mensen is dat de grootste helft van wat
        Outlook is, en daarom zegt onze eigen overpagina dat dit geen vervanging
        van Microsoft 365 is. Reken een overstap door alsof je mail blijft
        staan.
      </P>

      <H3>Teams, en met z&apos;n tweeën in dezelfde alinea</H3>
      <P>
        Chat bestaat hier als model: kanalen, DM&apos;s, threads, besloten
        kanalen achter een toegangscode. Wat eronder meegeleverd wordt is een
        gesimuleerd transport met verzonnen deelnemers. Live samenwerken is wel
        echt, maar smal: een sessie opent alleen voor een project dat je gedeeld
        hebt, en synchroniseren gaat per blok waarbij de laatste schrijver wint.
        Verschillende paragrafen raken elkaar nooit. Dezelfde alinea op dezelfde
        seconde wel.
      </P>

      <H3>Beheer waar een ICT-afdeling ja op zegt</H3>
      <P>
        Beheer is hier echt — auditlog, ledenlijst, rollen, bewaartermijn,
        opschonen met voorbeeldweergave — maar werkt alleen tegen een ingestelde
        database. Zonder database geeft elke aanroep een setupmelding met de
        reden: een auditlog van een browser is een logboek van iemands eigen
        handelingen, bijgehouden en verwijderbaar door diezelfde persoon. Single
        sign-on is een doorverwijzing, geen implementatie, en SCIM bestaat hier
        niet. Een hogeschool die tweeduizend studenten klaarzet, beschrijft het
        product van Microsoft.
      </P>

      <H3>Programma&apos;s op je eigen laptop</H3>
      <P>
        Word en Excel openen een bestand van je schijf zonder netwerk. Hier
        staat een installeerbare PWA: offline krijg je de laatst bekende versie,
        en alles onder /api wordt bewust nooit bewaard, zodat het AI-antwoord
        van de één niet opduikt bij wie daarna de browser opent. Een native-app
        is er niet. Hoe dat uitpakt staat in{" "}
        <Link
          href="/nl/gidsen/offline"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          documenten offline blijven bewerken
        </Link>
        .
      </P>

      <H2 id="waar-een-werkruimte-wint">Waar één werkruimte wint</H2>

      <H3>Eén documentmodel in plaats van vier bestanden</H3>
      <P>
        Een project is geen bestand. Het opent als één doorlopend canvas van
        blokken, in negen soorten: tekst, tabel, grafiek, slides, code,
        afbeelding, bronnenlijst, inhoudsopgave en formulier. Een grafiek
        bewaart het id van de tabel waaruit hij leest, dus die twee zijn
        dezelfde gegevens die je twee keer ziet — geen spreadsheet plus een
        plaatje dat sinds maart niet meer klopt. De inhoudsopgave wordt bij elke
        weergave afgeleid en nergens opgeslagen. Bijschriften bij figuren en
        tabellen hernummeren zichzelf als je er eentje tussenvoegt.
      </P>

      <H3>Geen licentie per persoon voor elke app</H3>
      <P>
        Microsoft 365 reken je per persoon af. Pro kost hier €14 per maand en
        gaat niet per zetel. Wat je ervoor koopt is het AI-tegoed: 3.000 credits
        per maand en daarna per gebruik, tegenover 200 bij gratis. Projecten,
        borden, bronnen, citaten, versiegeschiedenis en import van Word en
        PowerPoint werken vandaag ook zonder abonnement. Team is €24 per zetel
        met 6.000 gedeelde credits.
        Eén regel in de configuratie houdt dat eerlijk: het tegoed is altijd
        minder waard dan het abonnement, dus zetels bijkopen wordt nooit een
        goedkopere manier om credits te kopen.
      </P>

      <H3>Het opent zonder account</H3>
      <P>
        Het gratis plan heeft geen login. Je werkruimte staat in je eigen
        browser, en dat is de hele belofte én het hele risico: browsers gooien
        opslag weg zodra het krap wordt, zonder waarschuwing. Daarom vraagt de
        app om permanente opslag, laat hij zien hoeveel ruimte er nog is vóórdat
        het misgaat, en exporteert hij alles — lettertypes en afbeeldingen uit
        IndexedDB erbij — naar één bestand. Een deellink zet het document in het
        fragment van de URL, het deel dat nooit naar een server gaat.
      </P>

      <H3>Echte .docx, .xlsx en .pptx, in en uit</H3>
      <P>
        Importeren leest .docx inclusief voetnoten en bijgehouden wijzigingen,
        die als voorstellen binnenkomen. Ook .xlsx en .pptx gaan erin, en csv
        met aanhalingstekens, CRLF, een BOM en automatische herkenning van
        komma, puntkomma, tab en pipe — dat laatste merk je hier meer dan waar
        ook, want een Nederlandse Excel schrijft puntkomma&apos;s. Exporteren
        schrijft echte OOXML, geen Word-achtige HTML met een .doc-extensie:
        voetnoten onder aan de pagina, wijzigingen die je in Word nakijkt, een
        kop- en voettekst met PAGE-veld. Eén gat aan de invoerkant: bij
        PowerPoint gaan thema, afbeeldingen, posities en animaties er bewust af
        en blijven tekst, opsommingen en sprekersnotities over, omdat een halve
        kopie van een opmaak er kapot uitziet.
      </P>

      <H2 id="naast-elkaar">Naast elkaar</H2>
      <P>
        Zes van deze twaalf regels gaan naar Microsoft. Dezelfde oefening tegen
        Google staat in{" "}
        <Link
          href="/nl/vergelijk/google-workspace"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          dezelfde vergelijking met Google Workspace
        </Link>
        .
      </P>
      <Table
        caption="Microsoft 365 en Tougather op de twaalf punten waar je als eerste naar kijkt."
        columns={COLUMNS}
        rows={ROWS}
        minWidth={640}
      />

      <H2 id="prijs">Wat het kost</H2>
      <P>
        De prijs van Microsoft hangt af van het abonnement en van het land, dus
        haal die van hun eigen pagina. Deze kant ligt vast. Gratis is €0 en
        bevat 200 AI-credits per maand, die stoppen in plaats van een rekening
        te worden. Pro is €14 per maand. Team is €24 per zetel, dus vijf zetels
        is €1.440 per jaar en twintig is €5.760. AI boven je tegoed kost €3 per
        1.000 credits, voorlopig gemarkeerd tot er gebruikscijfers zijn.
      </P>
      <P>
        En wat een vergelijkingspagina hoort toe te geven: betalen kan nog niet.
        Alle Stripe-prijs-ID&apos;s staan bewust op null, want een verzonnen ID
        ziet eruit alsof alles klaarstaat en valt bij de kassa om. Wat vandaag
        draait, is het gratis plan.
      </P>

      <H2 id="niet-overstappen">Wanneer je niet moet overstappen</H2>
      <P>
        Blijf bij Microsoft 365 als je werkmap macro&apos;s draait, als je
        voorbij vijftigduizend rijen werkt, als jullie tegelijk in dezelfde
        alinea zitten, als je opleiding SSO en centrale uitrol nodig heeft, of
        als Outlook de reden is dat de licentie bestaat. Dat zijn geen gaten
        waar stilletjes aan gewerkt wordt, maar gevolgen van een ontwerp dat je
        werk in je eigen browser houdt.
      </P>
      <P>
        Voor wie dit wél is: de student wiens cijfers, hoofdstukken en
        verdedigingsdeck uit elkaar lopen, en het mkb-bedrijf van vier man dat
        vijf licenties betaalt voor één offerte. Wil je het hele plaatje, dan
        staan{" "}
        <Link
          href="/nl/vergelijk"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          alle vergelijkingen op een rij
        </Link>
        . En zoek je nog op &ldquo;Office 365&rdquo;: het gaat om hetzelfde
        kantoorpakket, onder de oude naam.
      </P>

      <H2 id="vragen">Vragen die het eerst komen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Begin met schrijven">
        Geen login, niets om op te zeggen. Open één project, plak er een .docx
        en een .xlsx in die je al hebt, en kijk of de naden waar je aan gewend
        bent er nog steeds zitten.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
