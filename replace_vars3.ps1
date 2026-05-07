# ============================================================
# ChordScore 旧変数 最終残存 置換スクリプト
# --amber → --color-amber
# --red   → --color-red
# --green → --color-green
# --mono  → --font-mono  (chords.js残存分)
# ============================================================

$replacements = [ordered]@{
    "var\(--amber\)"  = "var(--color-amber)"
    "var\(--red\)"    = "var(--color-red)"
    "var\(--green\)"  = "var(--color-green)"
    "var\(--mono\)"   = "var(--font-mono)"
}

$targets = @(
    "index.html",
    "js\app.js",
    "js\chords.js",
    "js\tapmode.js"
)

foreach ($rel in $targets) {
    $path = Join-Path (Get-Location) $rel
    if (-not (Test-Path $path)) {
        Write-Host "SKIP (not found): $rel" -ForegroundColor Yellow
        continue
    }

    $original = Get-Content $path -Raw -Encoding UTF8
    $current  = $original
    $hits     = @()

    foreach ($pattern in $replacements.Keys) {
        $replacement = $replacements[$pattern]
        $count = ([regex]::Matches($current, $pattern)).Count
        if ($count -gt 0) {
            $oldVar = $pattern -replace '\\',''
            $hits += "${count}件: $oldVar → $replacement"
            $current = [regex]::Replace($current, $pattern, $replacement)
        }
    }

    if ($current -ne $original) {
        [System.IO.File]::WriteAllText($path, $current, [System.Text.Encoding]::UTF8)
        Write-Host "UPDATED: $rel" -ForegroundColor Green
        $hits | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
    } else {
        Write-Host "NO CHANGE: $rel" -ForegroundColor Gray
    }
}

# ============================================================
# 残存チェック（旧変数体系の完全除去確認）
# ============================================================
Write-Host ""
Write-Host "=== 残存チェック ===" -ForegroundColor Magenta

$results = Get-ChildItem -Recurse -Include *.html,*.js,*.css |
    Where-Object { $_.FullName -notmatch '\\(archive|backup|tmp|node_modules)\\' } |
    Select-String "var\(--text[0-9]|var\(--bg[0-9]|var\(--border[0-9]|var\(--accent[0-9]|var\(--mono|var\(--sans|var\(--display|var\(--amber|var\(--green|var\(--red"

if ($results) {
    Write-Host "残存あり:" -ForegroundColor Red
    $results | ForEach-Object { Write-Host "  $($_.Filename):$($_.LineNumber) — $($_.Line.Trim())" }
} else {
    Write-Host "残存ゼロ ✓ 旧変数体系の除去完了" -ForegroundColor Green
}
