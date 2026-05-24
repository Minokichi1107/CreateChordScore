param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Folder,
    [switch]$Force
)

$SCRIPT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$FETCH_PY    = Join-Path $SCRIPT_DIR "chordmini_fetch.py"
$OUTPUT_DIR  = Join-Path (Split-Path -Parent $SCRIPT_DIR) "resource\chords"
$EXTENSIONS  = @('.mp3', '.wav', '.m4a', '.flac')
$PYTHON      = "py"
$PYTHON_VER  = "-3.11"

if (-not (Test-Path $Folder)) {
    Write-Host "ERROR: フォルダが見つかりません: $Folder" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $FETCH_PY)) {
    Write-Host "ERROR: chordmini_fetch.py が見つかりません: $FETCH_PY" -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem -Path $Folder -File |
    Where-Object { $EXTENSIONS -contains $_.Extension.ToLower() } |
    Sort-Object Name

if ($files.Count -eq 0) {
    Write-Host "対象ファイルが見つかりません: $Folder" -ForegroundColor Yellow
    exit 0
}

$total    = $files.Count
$skipped  = 0
$success  = 0
$failed   = 0
$failList = @()
$sep      = "=" * 48

Write-Host ""
Write-Host $sep -ForegroundColor Cyan
Write-Host " ChordMini バッチ取得" -ForegroundColor Cyan
Write-Host " 対象フォルダ  : $Folder" -ForegroundColor Cyan
Write-Host " 対象ファイル数: $total" -ForegroundColor Cyan
if ($Force) {
    Write-Host " モード        : 強制再取得 (-Force)" -ForegroundColor Yellow
} else {
    Write-Host " モード        : 差分取得（既存JSONはスキップ）" -ForegroundColor Cyan
}
Write-Host $sep -ForegroundColor Cyan
Write-Host ""

$index = 0
foreach ($file in $files) {
    $index++
    $base    = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $jsonOut = Join-Path $OUTPUT_DIR "${base}_chords.json"

    Write-Host "[$index/$total] $($file.Name)" -ForegroundColor White

    if (-not $Force -and (Test-Path $jsonOut)) {
        Write-Host "  SKIP: 既存JSON あり" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    try {
        & $PYTHON $PYTHON_VER $FETCH_PY "$($file.FullName)" --compress --beats
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 1
        Write-Host "  EXCEPTION: $($_.Exception.Message)" -ForegroundColor Red
    }

    if ($exitCode -eq 0) {
        Write-Host "  OK" -ForegroundColor Green
        $success++
    } else {
        Write-Host "  ERROR: exit code $exitCode" -ForegroundColor Red
        $failed++
        $failList += $file.Name
    }
    Write-Host ""
}

Write-Host $sep -ForegroundColor Cyan
Write-Host " 完了サマリー" -ForegroundColor Cyan
Write-Host "  合計    : $total" -ForegroundColor White
Write-Host "  成功    : $success" -ForegroundColor Green
Write-Host "  スキップ: $skipped" -ForegroundColor DarkGray
if ($failed -gt 0) {
    Write-Host "  失敗    : $failed" -ForegroundColor Red
} else {
    Write-Host "  失敗    : $failed" -ForegroundColor White
}
if ($failList.Count -gt 0) {
    Write-Host ""
    Write-Host " 失敗ファイル一覧:" -ForegroundColor Red
    foreach ($f in $failList) {
        Write-Host "  - $f" -ForegroundColor Red
    }
}
Write-Host $sep -ForegroundColor Cyan
Write-Host ""