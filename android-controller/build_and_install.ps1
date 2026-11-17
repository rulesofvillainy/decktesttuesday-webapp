# ==============================================================================
# Deck Test Tuesday - Mobile Game Controller
# Self-Contained Android Build & Install Script
# ==============================================================================
$ErrorActionPreference = "Stop"

$projectDir = $PSScriptRoot
$binDir = Join-Path $projectDir "bin"
$genDir = Join-Path $projectDir "gen"
$classesDir = Join-Path $binDir "classes"

# 1. Locate build tools (internal, parent, or environment)
$buildToolsDir = Join-Path $projectDir "build-tools"
if (-not (Test-Path (Join-Path $buildToolsDir "aapt2.exe"))) {
    $buildToolsDir = Join-Path $projectDir "..\android-build-tools"
}

$aapt2 = Join-Path $buildToolsDir "aapt2.exe"
$androidJar = Join-Path $buildToolsDir "android.jar"
$r8Jar = Join-Path $buildToolsDir "r8.jar"
$zipalign = Join-Path $buildToolsDir "zipalign.exe"
$apksignerJar = Join-Path $buildToolsDir "apksigner.jar"

# 2. Locate Java Development Kit (JDK)
$jdkPaths = Get-ChildItem -Path "C:\Program Files\Java" -Filter "jdk*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending
if ($jdkPaths) {
    $jdkBin = Join-Path $jdkPaths[0].FullName "bin"
    $javac = Join-Path $jdkBin "javac.exe"
    $keytool = Join-Path $jdkBin "keytool.exe"
    $jar = Join-Path $jdkBin "jar.exe"
} else {
    $cmdJavac = Get-Command javac.exe -ErrorAction SilentlyContinue
    $javac = if ($cmdJavac) { $cmdJavac.Source } else { $null }
    $cmdKeytool = Get-Command keytool.exe -ErrorAction SilentlyContinue
    $keytool = if ($cmdKeytool) { $cmdKeytool.Source } else { $null }
    $cmdJar = Get-Command jar.exe -ErrorAction SilentlyContinue
    $jar = if ($cmdJar) { $cmdJar.Source } else { $null }
}

if (-not $javac -or -not (Test-Path $javac)) {
    Write-Error "Java compiler (javac.exe) not found. Please install a JDK or set JAVA_HOME."
    exit 1
}

# 3. Locate ADB (Android Debug Bridge)
$cmdAdb = Get-Command adb.exe -ErrorAction SilentlyContinue
$adb = if ($cmdAdb) { $cmdAdb.Source } else { $null }
if (-not $adb) {
    $localAdb = Join-Path $projectDir "platform-tools\adb.exe"
    $parentAdb = Join-Path $projectDir "..\platform-tools\adb.exe"
    if (Test-Path $localAdb) {
        $adb = $localAdb
    } elseif (Test-Path $parentAdb) {
        $adb = $parentAdb
    }
}

Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "Deck Test Tuesday - Native Android Controller Build" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Magenta

Write-Host "=== 1. Cleaning and preparing directories ===" -ForegroundColor Cyan
if (Test-Path $binDir) { Remove-Item $binDir -Recurse -Force }
if (Test-Path $genDir) { Remove-Item $genDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $binDir, $genDir, $classesDir, (Join-Path $binDir "res_compiled") | Out-Null

Write-Host "=== 2. Compiling Android Resources with aapt2 ===" -ForegroundColor Cyan
$resFiles = Get-ChildItem -Path (Join-Path $projectDir "res") -Recurse -File
foreach ($file in $resFiles) {
    & $aapt2 compile $file.FullName -o (Join-Path $binDir "res_compiled")
}

Write-Host "=== 3. Linking Resources and generating R.java ===" -ForegroundColor Cyan
$compiledArchives = (Get-ChildItem -Path (Join-Path $binDir "res_compiled\*.flat")).FullName

& $aapt2 link `
    -I $androidJar `
    --manifest (Join-Path $projectDir "AndroidManifest.xml") `
    --java $genDir `
    -o (Join-Path $binDir "unaligned.apk") `
    --auto-add-overlay `
    $compiledArchives

Write-Host "=== 4. Compiling Java Sources ===" -ForegroundColor Cyan
$javaSources = @(
    (Get-ChildItem -Path (Join-Path $projectDir "src") -Recurse -Filter "*.java").FullName
    (Get-ChildItem -Path $genDir -Recurse -Filter "*.java").FullName
)

& $javac -encoding UTF-8 `
    -source 1.8 -target 1.8 `
    -bootclasspath $androidJar `
    -d $classesDir `
    $javaSources

Write-Host "=== 5. Converting to DEX with D8 ===" -ForegroundColor Cyan
$classFiles = (Get-ChildItem -Path $classesDir -Recurse -Filter "*.class").FullName
java -cp $r8Jar com.android.tools.r8.D8 `
    --lib $androidJar `
    --min-api 24 `
    --output $binDir `
    $classFiles

Write-Host "=== 6. Packaging classes.dex into APK ===" -ForegroundColor Cyan
Push-Location $binDir
& $jar uf "unaligned.apk" "classes.dex"
Pop-Location

Write-Host "=== 7. Zipaligning APK ===" -ForegroundColor Cyan
$alignedApk = Join-Path $binDir "aligned.apk"
& $zipalign -p -f 4 (Join-Path $binDir "unaligned.apk") $alignedApk

Write-Host "=== 8. Signing APK with apksigner ===" -ForegroundColor Cyan
$keystore = Join-Path $projectDir "debug.keystore"
if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -v `
        -keystore $keystore `
        -storepass android `
        -alias androiddebugkey `
        -keypass android `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=Android Debug,O=Android,C=US"
}

$finalApk = Join-Path $projectDir "DeckTestController.apk"
java -jar $apksignerJar sign `
    --ks $keystore `
    --ks-pass pass:android `
    --key-pass pass:android `
    --ks-key-alias androiddebugkey `
    --out $finalApk `
    $alignedApk

Write-Host "Verifying APK signature..." -ForegroundColor Cyan
java -jar $apksignerJar verify $finalApk

Write-Host "=== Build Successful! ===" -ForegroundColor Green
Write-Host "APK Created: $finalApk" -ForegroundColor Yellow

# If ADB is available, install and run on connected device
if ($adb -and (Test-Path $adb)) {
    Write-Host "=== 9. Installing to Tablet via ADB ===" -ForegroundColor Cyan
    & $adb wait-for-device
    & $adb install -r $finalApk

    Write-Host "=== 10. Launching Deck Test Controller on Tablet ===" -ForegroundColor Cyan
    & $adb shell am start -n com.decktesttuesday.controller/.MainActivity

    Write-Host "Done! Application is running on the tablet!" -ForegroundColor Green
} else {
    Write-Host "[Note] ADB not detected; APK ready at $finalApk" -ForegroundColor Yellow
}
