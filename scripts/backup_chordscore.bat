@echo off
chcp 65001 > nul
echo ================================
echo ChordScore バックアップ開始
echo ================================

:: 日付フォルダ名を生成（YYYY-MM-DD形式）
set DATESTAMP=%DATE:~0,4%-%DATE:~5,2%-%DATE:~8,2%

:: プロジェクトルート（scriptsの一つ上）
set SRC=C:\work\Projects\CreateChordScore

:: バックアップ先
set DST_HDD=D:\SettingBackup\project\Guitarchordscore\%DATESTAMP%
set DST_GDR=F:\マイドライブ\SettingBackup\project\Guitarchordscore\%DATESTAMP%

:: バックアップ対象フォルダ
set TARGETS=resource\projects resource\chords resource\lyrics analysis

echo バックアップ日付: %DATESTAMP%
echo.

:: ── HDD バックアップ ──────────────────────
if exist "D:\" (
    echo [HDD] バックアップ開始: %DST_HDD%
    for %%T in (%TARGETS%) do (
        if exist "%SRC%\%%T\" (
            robocopy "%SRC%\%%T" "%DST_HDD%\%%T" /MIR /NFL /NDL /NJH /NJS
            echo [HDD] %%T 完了
        ) else (
            echo [HDD] %%T スキップ（フォルダなし）
        )
    )
    echo [HDD] バックアップ完了
) else (
    echo [HDD] ドライブが見つかりません。スキップします。
)

echo.

:: ── Google Drive バックアップ ─────────────
if exist "F:\" (
    echo [GDrive] バックアップ開始: %DST_GDR%
    for %%T in (%TARGETS%) do (
        if exist "%SRC%\%%T\" (
            robocopy "%SRC%\%%T" "%DST_GDR%\%%T" /MIR /NFL /NDL /NJH /NJS
            echo [GDrive] %%T 完了
        ) else (
            echo [GDrive] %%T スキップ（フォルダなし）
        )
    )
    echo [GDrive] バックアップ完了
) else (
    echo [GDrive] ドライブが見つかりません。スキップします。
)

echo.
echo ================================
echo バックアップ終了
echo ================================
pause