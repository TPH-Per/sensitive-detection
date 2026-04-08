$dest = "$env:USERPROFILE\jdk17"
$zip = "$env:TEMP\jdk17.zip"
$url = 'https://github.com/adoptium/temurin17-binaries/releases/latest/download/OpenJDK17U-jdk_x64_windows_hotspot_latest.zip'
Write-Output "Downloading $url to $zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Write-Output 'Extracting...'
if(Test-Path $dest){ Remove-Item -Recurse -Force $dest }
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
Remove-Item $zip -Force
$child = Get-ChildItem -Directory $dest | Select-Object -First 1
if($null -eq $child){ Write-Output 'Extraction failed or no child folder found'; exit 2 }
$javaHome = $child.FullName -replace '\\','/'
Write-Output "Detected JDK path: $javaHome"
$gradleFile = 'C:\Users\Per\Downloads\smurf_social-main\klcn\android\gradle.properties'
((Get-Content $gradleFile) -replace 'org.gradle.java.home=.*', "org.gradle.java.home=$javaHome") | Set-Content $gradleFile -Encoding UTF8
Write-Output 'Updated gradle.properties'
