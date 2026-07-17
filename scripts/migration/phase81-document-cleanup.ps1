# ============================================================
# CreateChordScore - docs/handover 再編スクリプト (Phase81)
# 実行場所: プロジェクトルート (C:\work\Projects\CreateChordScore)
# 前提: git status がクリーンな状態で実行すること
# ============================================================

$ErrorActionPreference = "Stop"

# --- 0. 事前チェック ---
if (-not (Test-Path "docs")) {
    Write-Error "docs フォルダが見つかりません。プロジェクトルートで実行してください。"
    exit 1
}

$status = git status --porcelain
if ($status) {
    Write-Warning "作業ツリーに未コミットの変更があります。続行する前に確認してください。"
    Write-Output $status
    $answer = Read-Host "続行しますか？ (y/N)"
    if ($answer -ne "y") { exit 0 }
}

# --- 1. フェーズ帯フォルダの作成 ---
Write-Output "`n=== Step 1: フェーズ帯フォルダの作成 ==="
$bands = @(
    "phase01-13",
    "phase14-20",
    "phase21-30",
    "phase31-40",
    "phase41-50",
    "phase51-60",
    "phase61-70",
    "phase71-80"
)
foreach ($band in $bands) {
    $path = "docs\handover\archive\$band"
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Write-Output "作成: $path"
}

# --- 2. ファイル移動マップ ---
# 左: archive直下の既存ファイル名 / 右: 移動先バンド
# NOTE: 現在は手動マッピング。件数が増えたら正規表現による自動分類への移行を検討。
$moveMap = @{
    # phase01-13 (命名が不揃いなファイル群)
    "Phase 5 Uncompleted Events.md" = "phase01-13"
    "Phase5 cleanup.md"             = "phase01-13"
    "phase5.md"                     = "phase01-13"
    "phase6.md"                     = "phase01-13"
    "phase7.md"                     = "phase01-13"
    "phase8.md"                     = "phase01-13"
    "phase9.md"                     = "phase01-13"
    "refactor phase5.md"            = "phase01-13"

    # phase14-20
    "handover_phase14.md" = "phase14-20"
    "handover_phase15.md" = "phase14-20"
    "handover_phase17.md" = "phase14-20"
    "handover_phase18.md" = "phase14-20"
    "handover_phase19.md" = "phase14-20"
    "handover_phase20.md" = "phase14-20"

    # phase21-30
    "handover_phase21.md" = "phase21-30"
    "handover_phase24.md" = "phase21-30"
    "handover_phase28.md" = "phase21-30"
    "handover_phase29.md" = "phase21-30"
    "handover_phase30.md" = "phase21-30"

    # phase31-40
    "handover_phase31.md"   = "phase31-40"
    "handover_phase32.md"   = "phase31-40"
    "handover_phase33.md"   = "phase31-40"
    "handover_phase34.md"   = "phase31-40"
    "handover_phase35.md"   = "phase31-40"
    "handover_phase36.md"   = "phase31-40"
    "handover_phase37.md"   = "phase31-40"
    "handover_phase38.md"   = "phase31-40"
    "handover_phase39-1.md" = "phase31-40"
    "handover_phase39-2.md" = "phase31-40"
    "handover_phase39-3.md" = "phase31-40"
    "handover_phase39-4.md" = "phase31-40"
    "handover_phase39-5.md" = "phase31-40"
    "handover_phase39-6.md" = "phase31-40"
    "handover_phase40.md"   = "phase31-40"

    # phase41-50
    "handover_phase41.md"   = "phase41-50"
    "handover_phase42.md"   = "phase41-50"
    "handover_phase42-5.md" = "phase41-50"
    "handover_phase43.md"   = "phase41-50"
    "handover_phase44.md"   = "phase41-50"
    "handover_phase45.md"   = "phase41-50"
    "handover_phase46.md"   = "phase41-50"
    "handover_phase47.md"   = "phase41-50"
    "handover_phase48.md"   = "phase41-50"
    "handover_phase49.md"   = "phase41-50"
    "handover_phase50.md"   = "phase41-50"

    # phase51-60
    "handover_phase51.md" = "phase51-60"
    "handover_phase52.md" = "phase51-60"
    "handover_phase53.md" = "phase51-60"
    "handover_phase54.md" = "phase51-60"
    "handover_phase55.md" = "phase51-60"
    "handover_phase56.md" = "phase51-60"
    "handover_phase57.md" = "phase51-60"
    "handover_phase58.md" = "phase51-60"
    "handover_phase59.md" = "phase51-60"
    "handover_phase60.md" = "phase51-60"

    # phase61-70
    "handover_phase61.md" = "phase61-70"
    "handover_phase62.md" = "phase61-70"
    "handover_phase63.md" = "phase61-70"
    "handover_phase64.md" = "phase61-70"
    "handover_phase65.md" = "phase61-70"
    "handover_phase66.md" = "phase61-70"
    "handover_phase67.md" = "phase61-70"
    "handover_phase68.md" = "phase61-70"
    "handover_phase69.md" = "phase61-70"
    "handover_phase70.md" = "phase61-70"

    # phase71-80
    "handover_phase71.md"           = "phase71-80"
    "handover_phase72.md"           = "phase71-80"
    "handover_phase72c.md"          = "phase71-80"
    "handover_phase72_addendum.md"  = "phase71-80"
    "handover_phase73.md"           = "phase71-80"
    "handover_phase73b.md"          = "phase71-80"
    "handover_phase73c.md"          = "phase71-80"
    "handover_phase73d.md"          = "phase71-80"
    "handover_phase73e.md"          = "phase71-80"
    "handover_phase73f.md"          = "phase71-80"
    "handover_phase74c.md"          = "phase71-80"
    "handover_phase74d.md"          = "phase71-80"
    "handover_phase74e.md"          = "phase71-80"
    "handover_phase75.md"           = "phase71-80"
    "handover_phase76.md"           = "phase71-80"
    "handover_phase77.md"           = "phase71-80"
    "handover_phase78.md"           = "phase71-80"
    "handover_phase79_sprint1.md"   = "phase71-80"
    "handover_phase79_sprint2_1.md" = "phase71-80"
    "handover_phase79_sprint2_2.md" = "phase71-80"

    # Phase81完了時、active/handover_phase80.md が確定したら以下を追加してこのスクリプトを再実行する
    # "handover_phase80.md" = "phase71-80"
}

# --- 3. git mv 実行 ---
Write-Output "`n=== Step 2: ファイルの移動 (git mv) ==="
$archiveRoot = "docs\handover\archive"
$notFound = @()
foreach ($file in $moveMap.Keys) {
    $src = Join-Path $archiveRoot $file
    $destDir = Join-Path $archiveRoot $moveMap[$file]
    $dest = Join-Path $destDir $file

    if (Test-Path $src) {
        git mv -- "$src" "$dest"
        if ($LASTEXITCODE -ne 0) {
            throw "git mv に失敗しました: $file (途中まで移動済みのファイルは git status で確認してください)"
        }
        Write-Output "移動: $file -> $($moveMap[$file])/"
    } else {
        $notFound += $file
    }
}

if ($notFound.Count -gt 0) {
    Write-Warning "`n以下のファイルが見つかりませんでした（ファイル名を確認してください）:"
    $notFound | ForEach-Object { Write-Output "  - $_" }
}

# --- 4. 結果確認 ---
Write-Output "`n=== Step 3: 移動後のツリー確認 ==="
tree docs\handover\archive /F

# --- 5. 空フォルダの削除（最後に実行）---
# 途中で異常終了した場合に「フォルダだけ消えた」中途半端な状態を避けるため、最後に実行する
Write-Output "`n=== Step 4: 空フォルダの削除 ==="
foreach ($dir in @("docs\draft", "docs\testing")) {
    if (Test-Path $dir) {
        Remove-Item $dir -Recurse -Force
        Write-Output "削除: $dir"
    } else {
        Write-Output "スキップ (存在しない): $dir"
    }
}

Write-Output "`n=== 完了 ==="
Write-Output "内容を確認し、問題なければ以下でコミットしてください:"
Write-Output '  git add -A'
Write-Output '  git commit -m "docs: Phase81 - archive/を10フェーズ帯で再編、空フォルダ削除"'
