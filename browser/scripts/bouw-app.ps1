# Bouwt de app-kant van Tougather en zet hem in app/, waar het tougather://-
# schema hem vandaan serveert. Zie lib/app-schema.js.
#
# Alles uit src/app/(app) gaat mee. Wat eruit blijft:
#
#   src/app/api          De serverkant. Daar staan OPENROUTER_API_KEY,
#                        STRIPE_SECRET_KEY en SUPABASE_SERVICE_ROLE_KEY. Een
#                        sleutel die je meelevert in een download is een sleutel
#                        die iedereen heeft. De browser stuurt /api door naar
#                        tougather.com; de interface is lokaal, de rekening niet.
#   src/app/(marketing)  De website. Die wordt de plek waar je deze browser
#                        downloadt, dus die hoort er juist niet in te zitten.
#   robots, sitemap,     Dingen voor crawlers en voor het installeren vanuit een
#   manifest             browser. Deze browser ís de installatie.
#
# Die mappen gaan tijdens het bouwen opzij en komen daarna terug, ook als het
# bouwen misgaat. Breekt het script er middenin af, draai het dan opnieuw: het
# begint met terugzetten wat er nog opzij staat.

param(
  # De map boven deze browser: hij hoort als browser/ in de Tougather-repo te
  # staan. Staat hij ergens anders, geef de app dan mee met -Bron.
  [string]$Bron = (Join-Path $PSScriptRoot "..\.."),
  [string]$Doel = (Join-Path $PSScriptRoot "..\app"),
  [switch]$AlleenHerstellen
)

$ErrorActionPreference = "Stop"

$Bron = [System.IO.Path]::GetFullPath($Bron)
$isApp = (Test-Path -LiteralPath (Join-Path $Bron "src\app")) -and
         (Test-Path -LiteralPath (Join-Path $Bron "next.config.ts"))
if (-not $isApp) {
  Write-Output "Geen Tougather-app gevonden in $Bron."
  Write-Output "Staat deze map als browser/ in de repo? Zo niet: -Bron <pad naar de app>"
  exit 1
}

# Naast de bron, niet in TEMP: dat pad komt hier als C:\Users\SFEED~1.GOU binnen
# en daar struikelt Move-Item over.
$opzij = Join-Path (Split-Path $Bron -Parent) ".bouw-opzij"

# Wat er opzij gaat, met de naam waaronder het bewaard wordt.
$weg = @(
  @{ naam = "api";        pad = "src\app\api" },
  @{ naam = "marketing";  pad = "src\app\(marketing)" },
  @{ naam = "robots";     pad = "src\app\robots.ts" },
  @{ naam = "sitemap";    pad = "src\app\sitemap.ts" },
  @{ naam = "manifest";   pad = "src\app\manifest.ts" }
)

function Terugzetten {
  foreach ($r in $weg) {
    $bewaard = Join-Path $opzij $r.naam
    $thuis = Join-Path $Bron $r.pad
    if (Test-Path -LiteralPath $bewaard) {
      if (Test-Path -LiteralPath $thuis) { Remove-Item -LiteralPath $thuis -Recurse -Force }
      Move-Item -LiteralPath $bewaard -Destination $thuis
      Write-Output ("terug: " + $r.pad)
    }
  }
  $orig = Join-Path $Bron "next.config.ts.origineel"
  if (Test-Path -LiteralPath $orig) {
    Move-Item -LiteralPath $orig -Destination (Join-Path $Bron "next.config.ts") -Force
    Write-Output "terug: next.config.ts"
  }
}

# Altijd eerst opruimen wat een vorige run heeft laten liggen.
if (Test-Path -LiteralPath $opzij) { Terugzetten }
if ($AlleenHerstellen) { exit 0 }

if (-not (Test-Path -LiteralPath (Join-Path $Bron "node_modules"))) {
  Write-Output "node_modules ontbreekt. Draai eerst 'npm install' in $Bron"
  exit 1
}

New-Item -ItemType Directory -Force -Path $opzij | Out-Null
Push-Location $Bron
try {
  foreach ($r in $weg) {
    $thuis = Join-Path $Bron $r.pad
    if (Test-Path -LiteralPath $thuis) {
      Move-Item -LiteralPath $thuis -Destination (Join-Path $opzij $r.naam)
    }
  }

  Copy-Item "next.config.ts" "next.config.ts.origineel" -Force
  @'
import type { NextConfig } from "next";

/** Alleen voor de build die in Tougather Browser meegaat. */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
'@ | Set-Content "next.config.ts" -Encoding utf8

  # PowerShell maakt van elke stderr-regel van een programma een foutrecord, en
  # met ErrorActionPreference op Stop breekt de eerste waarschuwing van node de
  # hele build af — halverwege het genereren van de pagina's. Dus hier even niet,
  # en daarna zelf naar de afsluitcode kijken.
  $streng = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & npx next build
  $bouwCode = $LASTEXITCODE
  $ErrorActionPreference = $streng
  if ($bouwCode -ne 0) { throw "next build gaf $bouwCode" }
  if (-not (Test-Path -LiteralPath "out")) { throw "de build schreef geen out/" }

  if (Test-Path -LiteralPath $Doel) { Remove-Item -LiteralPath $Doel -Recurse -Force }
  Copy-Item "out" $Doel -Recurse

  $n = (Get-ChildItem $Doel -Recurse -File | Measure-Object).Count
  $mb = [math]::Round(((Get-ChildItem $Doel -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
  Write-Output "klaar: $n bestanden, $mb MB in $Doel"
} finally {
  Pop-Location
  Terugzetten
  if ((Test-Path -LiteralPath $opzij) -and -not (Get-ChildItem -LiteralPath $opzij)) {
    Remove-Item -LiteralPath $opzij -Force
  }
}
