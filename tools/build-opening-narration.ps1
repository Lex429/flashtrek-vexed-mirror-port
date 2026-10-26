param([string]$Voice = 'Microsoft David Desktop')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$repoPath = Split-Path -Parent $PSScriptRoot
$storyPath = Join-Path $PSScriptRoot 'opening-story.json'
$story = Get-Content -LiteralPath $storyPath -Raw -Encoding UTF8 | ConvertFrom-Json
$buildPath = Join-Path $repoPath 'test-results/opening-cinematic/narration-build'
New-Item -ItemType Directory -Path $buildPath -Force | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice($Voice)
    for ($cueIndex = 0; $cueIndex -lt $story.cues.Count; $cueIndex++) {
        $cue = $story.cues[$cueIndex]
        $speaker.Rate = [int]$cue.rate
        $speaker.Volume = [int]$cue.volume
        $clipPath = Join-Path $buildPath ('cue-{0:D2}.wav' -f $cueIndex)
        $speaker.SetOutputToWaveFile($clipPath)
        $speaker.Speak([string]$cue.text)
        $speaker.SetOutputToNull()
    }
} finally { $speaker.Dispose() }
python (Join-Path $PSScriptRoot 'package-opening-narration.py') --voice $Voice
if ($LASTEXITCODE -ne 0) { throw 'Narration packaging failed' }
