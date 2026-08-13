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

const SLUG = "/nl/gidsen/scriptie-schrijven" as const;

export const metadata = pageMetadata(SLUG);

const TOC: TocItem[] = [
  { id: "stappenplan", label: "Het stappenplan in negen stappen" },
  { id: "plan-van-aanpak", label: "Plan van aanpak: hbo en wo" },
  { id: "hoofdstukindeling", label: "Hoofdstukindeling en woorden" },
  { id: "weekplanning", label: "Weekplanning van twintig weken" },
  { id: "gereedschap", label: "Bronnen, noten, inhoudsopgave, verwijzingen" },
  { id: "inleveren", label: "Inleveren als .docx met wijzigingen" },
  { id: "waar-word-beter-is", label: "Waar Word beter blijft" },
  { id: "faq", label: "Veelgestelde vragen" },
];

const FAQS: FaqItem[] = [
  {
    question: "Hoe lang moet een scriptie zijn?",
    answer:
      "Dat verschilt per opleiding. Een hbo-bachelorscriptie ligt meestal tussen de 10.000 en 15.000 woorden, een wo-masterscriptie tussen de 15.000 en 25.000, maar dat zijn gewoontes en geen regels. Je beoordelingsformulier is het enige aantal dat telt, en daar staat ook in of bijlagen meetellen.",
  },
  {
    question: "Hoe lang doe je over een scriptie?",
    answer:
      "De meeste opleidingen rekenen op een semester, ongeveer 20 weken inclusief onderzoek. De fout is 18 weken schrijven en 2 weken repareren. Zet je eerste volledige versie in week 15 en houd de laatste twee weken vrij voor herschrijven.",
  },
  {
    question: "Wat is het verschil tussen een hoofdvraag en deelvragen?",
    answer:
      "De hoofdvraag is het ene ding dat je scriptie beantwoordt, en die staat twee keer in je tekst: aan het eind van je inleiding en aan het begin van je conclusie. Deelvragen zijn de stappen daarnaartoe, en elke deelvraag hoort bij een hoofdstuk of paragraaf. Heeft een deelvraag geen hoofdstuk, dan mis je er een.",
  },
  {
    question: "Schrijf ik mijn scriptie in één document of per hoofdstuk?",
    answer:
      "In één document. Kruisverwijzingen, notennummering en een automatische inhoudsopgave werken binnen één document en geen van drieën werkt over vijf bestanden heen. Splitsen heeft alleen zin als je editor traag wordt, en dan is een snellere editor de oplossing.",
  },
  {
    question: "Wat hoort er in een plan van aanpak?",
    answer:
      "De aanleiding, de probleemstelling, je hoofdvraag en deelvragen, je onderzoeksmethode en een weekplanning. Je begeleider moet het goedkeuren voordat je gaat verzamelen, want die goedkeuring maakt je methode verdedigbaar bij de tweede beoordelaar.",
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

export default function ScriptieSchrijvenGidsPage() {
  return (
    <PageShell
      lang="nl"
      eyebrow="Gids"
      title={page(SLUG).h1}
      lead="De meeste scriptieadviezen gaan over motivatie. Deze gaat over wat er echt misgaat: een inhoudsopgave die niemand bijwerkte, figuurnummers die niet meer kloppen, een bronstijl die in week 19 nog omgaat, en een begeleider die Word wil met bijgehouden wijzigingen."
    >
      <JsonLd
        data={[breadcrumbJsonLd(SLUG), pageJsonLd(SLUG), faqJsonLd(FAQS)]}
      />
      <Breadcrumbs slug={SLUG} />

      <p className="mb-8 text-[12.5px] text-fg-subtle">
        <Link
          href="/guides/write-a-thesis"
          hrefLang="en"
          lang="en"
          className="text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
        >
          Read this page in English
        </Link>
      </p>

      <Contents slug={SLUG} items={TOC} />

      <Takeaway title="Kort samengevat">
        Negen stappen, een hoofdstukindeling met een woordendoel per paragraaf,
        twintig weken. Daarna vier instellingen — bronstijl, noten,
        inhoudsopgave, kruisverwijzingen — die tien minuten kosten in week 1 of
        een weekend in week 19. Zie ook{" "}
        <A href="/nl/gidsen">alle gidsen stap voor stap</A>.
      </Takeaway>

      <H2 id="stappenplan">Het stappenplan in negen stappen</H2>
      <P>
        Elke stap eindigt in iets dat een ander kan lezen. Een stap die alleen
        een gevoel van vooruitgang oplevert is geen stap, en daarom staat
        &ldquo;onderzoek doen&rdquo; hier zo laat.
      </P>
      <List
        items={[
          "Kies een onderwerp waar je aan data kunt komen. De interessante vraag zonder toegang kost meer weken dan de saaie vraag mét toegang.",
          "Breng het terug tot één hoofdvraag, in één zin, met een werkwoord dat je kunt toetsen. Heb je een puntkomma nodig, dan zijn het twee vragen.",
          "Maak er drie tot vijf deelvragen van. Elke deelvraag wordt een hoofdstuk of een paragraaf, en niets anders wordt dat.",
          "Schrijf je plan van aanpak en laat het goedkeuren voordat je iets verzamelt.",
          "Zet het document één keer goed: bronstijl, pagina-instelling, inhoudsopgaveblok, woordendoel per paragraaf.",
          "Verzamel bronnen terwijl je leest. Een bron uit je browsergeschiedenis reconstrueren gaat mis.",
          "Doe je onderzoek en schrijf ondertussen je theoretisch kader. Wachttijd en interviews uitwerken zijn je enige gratis uren.",
          "Schrijf in de volgorde die je argument nodig heeft. Methode en resultaten eerst: het makkelijkst te schrijven, het moeilijkst te verzinnen.",
          "Herschrijf in drie rondes — structuur, alinea's, zinnen — nooit twee in één zitting.",
        ]}
      />

      <H2 id="plan-van-aanpak">Plan van aanpak: hbo en wo</H2>
      <P>
        Op het hbo is het plan van aanpak een apart product dat wordt
        beoordeeld: aanleiding, probleemstelling, hoofdvraag, deelvragen,
        methode en planning. Op de universiteit heet hetzelfde meestal een
        onderzoeksvoorstel, met het accent op je theoretisch kader in plaats van
        op de opdrachtgever. Klein verschil in vorm, groot in beoordeling: een
        hbo-scriptie eindigt in een advies aan een organisatie, een wo-scriptie
        in een antwoord op een vraag uit de literatuur.
      </P>
      <P>
        Schrijf het in hetzelfde document waar je scriptie in komt, met de
        bronstijl al ingesteld. Aanleiding, probleemstelling en methode
        verhuizen later naar je inleiding en methodehoofdstuk, en dan voer je
        die bronnen niet twee keer in.
      </P>

      <H2 id="hoofdstukindeling">Hoofdstukindeling en woorden</H2>
      <P>
        Een verhouding, geen sjabloon. Resultaten en discussie zijn samen twee
        vijfde van je scriptie, en de inleiding is het kortste hoofdstuk waar de
        meeste tijd in gaat zitten.
      </P>
      <Table
        caption="Een scriptie van 12.000 woorden. Verander het totaal, houd de verhouding."
        columns={["Hoofdstuk", "Wat het beantwoordt", "Woorden"]}
        minWidth={600}
        rows={[
          ["Samenvatting", "De hele scriptie in één alinea. Als laatste.", "500"],
          ["Inleiding", "Waarom deze vraag, waarom nu.", "1.000"],
          [
            "Theoretisch kader",
            "Je begrippen, gedefinieerd uit het werk van anderen.",
            "2.500",
          ],
          ["Methode", "Precies genoeg dat iemand het kan overdoen.", "1.500"],
          ["Resultaten", "Wat je vond. Geen interpretatie.", "2.500"],
          [
            "Discussie",
            "Wat het betekent, en wat je methode niet kan dragen.",
            "2.500",
          ],
          ["Conclusie", "Je hoofdvraag, beantwoord. Niets nieuws.", "800"],
          ["Aanbevelingen", "Wat iemand maandag moet doen.", "700"],
        ]}
      />

      <H3 id="woordendoel">Een woordendoel per paragraaf</H3>
      <P>
        Een doel voor het hele document zegt je in week 10 niets: je haalt het
        ook met 4.000 woorden theorie en nul woorden methode. Daarom staat er
        ook een doel op de paragraaf. Het overzichtspaneel bewaart dat doel per
        paragraaf en toont elke regel als <code>woorden / doel</code> met een
        streepje als meter; boven het document staat het totaal als percentage.
        Het nuttige getal is welke paragraaf het verst achterloopt op zijn eigen
        doel.
      </P>

      <H2 id="weekplanning">Weekplanning van twintig weken</H2>
      <P>
        Weken zijn de eenheid omdat een begeleidingsgesprek er om de twee weken
        is. De blokken die mensen schrappen als ze achterlopen zijn de laatste
        twee, precies verkeerd om.
      </P>
      <Table
        caption="Eén semester in zes blokken, met wat er aan het eind van elk blok ligt."
        columns={["Weken", "Wat je doet", "Wat er dan ligt"]}
        minWidth={620}
        rows={[
          ["1–3", "Breed lezen, hard afbakenen.", "Een goedgekeurd plan."],
          [
            "4–5",
            "Methode, instrumenten, toestemming of toegang.",
            "De interviewleidraad, vragenlijst of dataset.",
          ],
          [
            "6–11",
            "Veldwerk, met je theoretisch kader ernaast.",
            "Data verzameld, kader in concept.",
          ],
          [
            "12–15",
            "Analyse, resultaten, discussie. Slecht en snel schrijven.",
            "Een volledige eerste versie.",
          ],
          [
            "16–18",
            "Hoofdstukken verplaatsen, paragrafen samenvoegen, schrappen.",
            "Een tweede versie, in één keer leesbaar.",
          ],
          [
            "19–20",
            "Zinnen, bronnen, nummering, beoordelingsformulier.",
            "Het bestand dat je inlevert.",
          ],
        ]}
      />

      <H2 id="gereedschap">Bronnen, noten, inhoudsopgave, verwijzingen</H2>

      <H3 id="bronvermelding">Bronvermelding in vier stijlen</H3>
      <P>
        Vier stijlen worden ondersteund, met naam in de code: APA 7, MLA 9,
        Chicago en Harvard. Nederlandse opleidingen schrijven bijna altijd APA
        voor. Alle vier werken met auteur en jaartal of auteur en pagina, en
        daarom is wisselen een instelling en geen verbouwing: de verwijzing in
        je tekst wordt afgeleid uit de bron zelf, dus je literatuurlijst
        herschikken hernummert nooit iets. Twee auteurs krijgen een ampersand,
        drie of meer worden <em>et al.</em>, en de lijst sorteert op achternaam
        en dan op jaar.
      </P>
      <P>
        Je voegt een bron toe door te plakken wat je hebt: een DOI, arXiv-id,
        ISBN, BibTeX-record, URL of losse verwijzing wordt herkend en uit elkaar
        gehaald, en wat de parser moest gokken wordt gemarkeerd als onzeker. De
        grens: de meegeleverde resolver gaat nooit het netwerk op, dus een kale
        URL levert een titel op die uit het adres is geraden — en dat zegt hij
        erbij.
      </P>

      <H3 id="noten">Voetnoten en eindnoten</H3>
      <P>
        Noten worden genummerd in documentvolgorde, berekend zonder DOM, dus
        scherm, export en assistent kunnen niet uit elkaar lopen. Op het scherm
        staan ze altijd onderaan: een browser kan niets onder aan een pagina
        zetten, want <code>float: footnote</code> staat in de CSS-specificatie
        en in geen enkele engine. De keuze tussen voet en eind gaat dus over je
        geëxporteerde bestand — en het eerlijke gat is dat de Word-export altijd
        echte voetnoten schrijft, dus eist je opleiding eindnoten, dan zet je ze
        één keer om in Word.
      </P>

      <H3 id="inhoudsopgave">Een inhoudsopgave die niet veroudert</H3>
      <P>
        Hij wordt bij elke weergave afgeleid uit de koppen van je document; er
        wordt niets opgeslagen. Dat is de hele functie: een opgeslagen
        inhoudsopgave kan het oneens zijn met het document, en daarom heeft elke
        tekstverwerker die er één opslaat ook een &ldquo;veld
        bijwerken&rdquo;-ritueel. Het is een blok, dus hij staat waar jouw
        document hem wil hebben.
      </P>

      <H3 id="kruisverwijzingen">Kruisverwijzingen die zichzelf hernummeren</H3>
      <P>
        Er lopen twee losse reeksen door je document: Figuur <em>n</em> en Tabel{" "}
        <em>n</em>, waarbij afbeeldingen en grafieken de figuurreeks delen. Er
        wordt niets opgeslagen, dus een figuur die je halverwege invoegt
        hernummert alles erna én elke verwijzing ernaar. Een verwijzing waarvan
        je het doel verwijderde wordt zichtbaar <em>[missing reference]</em> in
        plaats van je met &ldquo;zoals te zien in , geldt dat&rdquo; achter te
        laten.
      </P>

      <H2 id="inleveren">Inleveren als .docx met wijzigingen</H2>
      <P>
        Begeleiders lezen na in Word met wijzigingen bijhouden aan, en de meeste
        schrijftools zien dat als een exportprobleem. Het is een
        heen-en-weerprobleem. De <code>.docx</code> hier is echte OOXML en geen
        Word-achtige HTML met een andere extensie: voetnoten die Word zelf op de
        pagina zet, <code>w:ins</code>- en <code>w:del</code>-wijzigingen die
        het kan beoordelen, een koptekst en voettekst met een echt PAGE-veld, en
        een inhoudsopgaveveld, <code>TOC \o &quot;1-3&quot; \h</code>, met de
        huidige regels als resultaat erin gebakken — dus het klopt bij openen en
        werkt bij op F9.
      </P>
      <P>
        De weg terug telt zwaarder. Bij het inlezen komen koppen, lijsten,
        tabellen en voetnoten mee, en de wijzigingen van je begeleider komen
        binnen als voorstellen in plaats van platgeslagen tekst: je accepteert
        of weigert ze stuk voor stuk, of in één keer over blokken die je nog
        niet hebt geopend. De pagina-instelling dekt A4, Letter en Legal, staand
        of liggend, marges in millimeters, en paginanummers rechtsonder,
        gecentreerd of rechtsboven.
      </P>
      <P>
        Drie grenzen. Kopteksten, voetteksten en paginanummers werken niet als
        je vanuit de browser print — CSS-marginboxen zijn in geen enkele engine
        geïmplementeerd — dus die gaan alleen de Word-export in. Exporteren naar
        pdf is <code>window.print()</code> in een schoon venster, geen
        gegenereerd bestand. En formules komen in Word als LaTeX-broncode in een
        monospace-stuk, want LaTeX naar OMML vertalen is een compiler en geen
        functie. Werkt je opleiding met Office, kijk dan bij{" "}
        <A href="/nl/vergelijk/microsoft-365">
          als je opleiding Microsoft 365 verplicht
        </A>
        .
      </P>

      <H2 id="waar-word-beter-is">Waar Word beter blijft</H2>
      <P>
        Een scriptie is precies het document waar Word het moeilijkst te
        verslaan is. De rijen gaan beide kanten op.
      </P>
      <Table
        caption="Wat een scriptie nodig heeft, en welke tool dat beter doet."
        columns={["", "Microsoft Word", "Tougather"]}
        minWidth={660}
        rows={[
          [
            "Eindnoten als eindnoten",
            "Echte eindnoten, eigen nummerreeks.",
            "De instelling bestaat; de .docx-export schrijft altijd voetnoten.",
          ],
          [
            "Formules",
            "Een eigen OMML-editor.",
            "LaTeX-broncode in een monospace-stuk. In de code benoemd als het gat.",
          ],
          [
            "Bronstijlen",
            "Een stuk of twaalf standaard, plus duizenden via de Zotero- of EndNote-invoegtoepassing, die ook gegevens ophalen.",
            "Vier. De resolver gaat nooit het netwerk op.",
          ],
          [
            "Een pdf-bestand",
            "Schrijft er een.",
            "window.print() in een schoon venster. Geen pdf-schrijver.",
          ],
          [
            "Opmerking bij één zin",
            "Hangt aan een stuk tekst.",
            "Hangt aan een blok — bewust, maar grover.",
          ],
          [
            "Inhoudsopgave",
            "Een opgeslagen veld, klopt na F9.",
            "Bij elke weergave afgeleid. Kan het document niet tegenspreken.",
          ],
          [
            "Figuur- en tabelnummers",
            "Velden, die je ook bijwerkt.",
            "Afgeleid, dus ze hernummeren terwijl je typt.",
          ],
        ]}
      />
      <P>
        Word wint op alles wat de drukkerij dertig jaar geleden vastlegde, en
        verliest op alles wat moet blijven kloppen terwijl je schrijft. Rekent
        je resultatenhoofdstuk ergens aan, dan staan in{" "}
        <A href="/nl/gidsen/formules">formules voor je resultatenhoofdstuk</A>{" "}
        de functies die je nodig hebt, en{" "}
        <A href="/nl/gidsen/offline">schrijven in de bieb zonder wifi</A> gaat
        over de week zonder verbinding.
      </P>

      <H2 id="faq">Veelgestelde vragen</H2>
      <FAQ items={FAQS} />

      <CallToAction href="/library" label="Beginnen met schrijven">
        Open een document, zet de bronstijl en het papierformaat, zet er een
        inhoudsopgaveblok in en geef elke paragraaf een woordendoel. Die tien
        minuten bepalen hoe week 19 eruitziet.
      </CallToAction>

      <RelatedPages slug={SLUG} />
    </PageShell>
  );
}
