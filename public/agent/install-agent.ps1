<#
Bootstrap de instalação e reparo do agente Conect Sessions (Windows 10/11, por
usuário, sem administrador e sem Node).

A ORDEM aqui é requisito, não estilo. O código de pareamento é de uso único e o
servidor gira a credencial permanente no instante da troca. Trocar antes de
existir um executável baixado, com SHA-256 conferido e respondendo a --version
significa que uma falha de rede no meio do caminho deixa a máquina com um token
já invalidado no servidor: uma instalação saudável destruída por uma tentativa
de reparo. Então: valida o artefato primeiro, consome o código depois, grava a
credencial protegida imediatamente e só então encosta na instalação existente.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{64}$')]
  [string]$Code,
  [string]$ApiUrl = '__CONNECT_API_URL__',
  [string]$ReleaseManifestUrl = '',
  [string]$InstallRoot = '',
  [string]$RunKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
  [string]$RunName = 'ConectSessionsAgent',
  [switch]$SkipPlugin,
  [switch]$NoAutostart,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}
catch { }

# Preenchidos por src/lib/agent-installer.ts ao servir o bootstrap. Rodando
# direto do repositório, os placeholders continuam e os arquivos irmãos valem.
$EmbeddedProcessLib = '__CONNECT_PROCESS_LIB_B64__'
$EmbeddedLauncher = '__CONNECT_LAUNCHER_B64__'
$EmbeddedUninstaller = '__CONNECT_UNINSTALLER_B64__'

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'Conect Sessions'
}
if ([string]::IsNullOrWhiteSpace($ReleaseManifestUrl)) {
  $ReleaseManifestUrl = 'https://github.com/AllanFrancis/conect-sessions/releases/latest/download/agent-manifest.json'
}

$stagingDir = Join-Path $InstallRoot '.staging'
$agentPath = Join-Path $InstallRoot 'conect-agent.exe'
$hookPath = Join-Path $InstallRoot 'conect-hook.exe'
$configPath = Join-Path $InstallRoot 'config.json'
$launcherPath = Join-Path $InstallRoot 'launcher.ps1'
$uninstallerPath = Join-Path $InstallRoot 'uninstall.ps1'
$processLibPath = Join-Path $InstallRoot 'agent-process.ps1'
$logPath = Join-Path $InstallRoot 'install.log'

function Write-InstallLog([string]$Message) {
  $line = '{0:o} {1}' -f [DateTime]::UtcNow, $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Host $Message
}

<#
Grava o conteúdo exatamente como recebido. `Set-Content -Encoding UTF8` do
PowerShell 5.1 acrescenta BOM e uma quebra de linha final, então o launcher
instalado deixaria de ser byte a byte o arquivo versionado — e a garantia de
fonte única viraria "quase igual".
#>
$Utf8NoBom = New-Object Text.UTF8Encoding($false)
function Write-TextFile([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), $Content, $Utf8NoBom)
}

<#
Fonte embutida pelo servidor, ou o arquivo irmão quando rodando do repositório.
O reconhecimento é pelo alfabeto base64: um marcador não substituído tem `_`,
que base64 nunca produz. Assim o bootstrap servido não carrega nem o texto do
marcador — o que também deixa o teste do endpoint provar que nada sobrou.
#>
function Resolve-EmbeddedSource([string]$Encoded, [string]$FileName) {
  if ($Encoded -match '^[A-Za-z0-9+/=]{64,}$') {
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Encoded))
  }
  $local = Join-Path $PSScriptRoot $FileName
  if (Test-Path -LiteralPath $local) {
    # Bytes, não Get-Content: o BOM tem de sobreviver. É ele que faz o
    # PowerShell 5.1 tratar o script instalado como UTF-8 em vez de ANSI, e sem
    # ele todo acento das mensagens chega torto ao usuário.
    return [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes([IO.Path]::GetFullPath($local)))
  }
  throw ('Bootstrap incompleto: {0} não está embutido nem ao lado do script.' -f $FileName)
}

function Save-VerifiedDownload([string]$Url, [string]$ExpectedSha256, [string]$Destination) {
  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'Manifesto de release sem SHA-256 válido.'
  }
  Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
  $stream = [IO.File]::OpenRead($Destination)
  try {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
      $actual = ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha256.Dispose() }
  }
  finally { $stream.Dispose() }
  if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    throw 'O arquivo baixado falhou na verificação SHA-256.'
  }
}

<#
Executa o agente e devolve saída e código. Sem token no ambiente: --version e
--probe são diagnósticos e não precisam de credencial. Timeout existe porque um
binário incompatível pode simplesmente não retornar.
#>
function Invoke-AgentCommand([string]$ExePath, [string]$Arguments, [int]$TimeoutSeconds) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $ExePath
  $info.Arguments = $Arguments
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($info)
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill() } catch { }
    throw ('O executável do agente não respondeu a "{0}" em {1}s.' -f $Arguments, $TimeoutSeconds)
  }
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StdOut   = $stdout.Result
    StdErr   = $stderr.Result
  }
}

function Install-ClaudePlugin {
  $claude = Get-Command 'claude' -ErrorAction SilentlyContinue
  if (-not $claude) {
    Write-InstallLog 'Claude Code não foi encontrado. O agente foi instalado; instale o Claude Code e rode o reparo para ativar o plugin.'
    return 'attention'
  }
  $previousPreference = $env:CLAUDE_CODE_PLUGIN_PREFER_HTTPS
  $env:CLAUDE_CODE_PLUGIN_PREFER_HTTPS = '1'
  try {
    & $claude.Source plugin marketplace add 'AllanFrancis/conect-sessions' *> $null
    if ($LASTEXITCODE -ne 0) {
      & $claude.Source plugin marketplace update 'conect-sessions' *> $null
      if ($LASTEXITCODE -ne 0) { throw 'não foi possível adicionar ou atualizar o marketplace' }
    }
    & $claude.Source plugin install 'conect-sessions@conect-sessions' --scope user *> $null
    if ($LASTEXITCODE -ne 0) {
      & $claude.Source plugin update 'conect-sessions@conect-sessions' --scope user *> $null
      if ($LASTEXITCODE -ne 0) { throw 'não foi possível instalar ou atualizar o plugin' }
    }
    Write-InstallLog 'Plugin do Claude Code instalado. Em sessões já abertas, execute /reload-plugins.'
    return 'ready'
  }
  catch {
    Write-InstallLog ('O agente está pronto, mas o plugin do Claude Code precisa de atenção: {0}.' -f $_.Exception.Message)
    return 'attention'
  }
  finally {
    $env:CLAUDE_CODE_PLUGIN_PREFER_HTTPS = $previousPreference
  }
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
Write-InstallLog 'Iniciando instalação ou reparo.'

$processLibSource = Resolve-EmbeddedSource $EmbeddedProcessLib 'agent-process.ps1'
$launcherSource = Resolve-EmbeddedSource $EmbeddedLauncher 'launcher.ps1'
$uninstallerSource = Resolve-EmbeddedSource $EmbeddedUninstaller 'uninstall-agent.ps1'

# A biblioteca de identidade é carregada da área de staging: a instalação em uso
# só é alterada depois que tudo estiver validado.
$stagedLib = Join-Path $stagingDir 'agent-process.ps1'
Write-TextFile $stagedLib $processLibSource
. $stagedLib

# --- 1. artefato: manifesto, download, integridade e resposta ---------------
$manifest = Invoke-RestMethod -Method Get -Uri $ReleaseManifestUrl
if (-not $manifest.remoteAgent.url -or -not $manifest.remoteAgent.sha256 -or
    -not $manifest.claudeHook.url -or -not $manifest.claudeHook.sha256) {
  throw 'Manifesto de release inválido.'
}
if ($manifest.remoteAgent.platform -and [string]$manifest.remoteAgent.platform -ne 'windows-x64') {
  throw ('Este instalador é de Windows x64 e o manifesto oferece {0}.' -f $manifest.remoteAgent.platform)
}
if ($manifest.claudeHook.platform -and [string]$manifest.claudeHook.platform -ne 'windows-x64') {
  throw ('Este instalador é de Windows x64 e o hook oferece {0}.' -f $manifest.claudeHook.platform)
}

$stagedAgent = Join-Path $stagingDir 'conect-agent.exe'
$stagedHook = Join-Path $stagingDir 'conect-hook.exe'
Save-VerifiedDownload -Url $manifest.remoteAgent.url -ExpectedSha256 $manifest.remoteAgent.sha256 -Destination $stagedAgent
Save-VerifiedDownload -Url $manifest.claudeHook.url -ExpectedSha256 $manifest.claudeHook.sha256 -Destination $stagedHook
Write-InstallLog 'Executáveis baixados e SHA-256 conferidos.'

$versionCheck = Invoke-AgentCommand -ExePath $stagedAgent -Arguments '--version' -TimeoutSeconds 60
if ($versionCheck.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($versionCheck.StdOut)) {
  throw ('O executável baixado não respondeu a --version (código {0}). Nada foi alterado nesta máquina.' -f $versionCheck.ExitCode)
}
Write-InstallLog ('Executável validado: versão {0}.' -f $versionCheck.StdOut.Trim())
$hookVersionCheck = Invoke-AgentCommand -ExePath $stagedHook -Arguments '--version' -TimeoutSeconds 60
if ($hookVersionCheck.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($hookVersionCheck.StdOut)) {
  throw ('O hook baixado não respondeu a --version (código {0}). Nada foi alterado nesta máquina.' -f $hookVersionCheck.ExitCode)
}
Write-InstallLog ('Hook validado: versão {0}.' -f $hookVersionCheck.StdOut.Trim())

# --- 2. só agora o código de uso único é trocado pela credencial ------------
$pairBody = @{ code = $Code.ToLowerInvariant(); version = '0.1.0'; platform = 'windows-x64' } | ConvertTo-Json -Compress
$pair = Invoke-RestMethod -Method Post -Uri "$($ApiUrl.TrimEnd('/'))/api/public/agent/pair" -ContentType 'application/json' -Body $pairBody
if ([string]::IsNullOrWhiteSpace([string]$pair.token)) {
  throw 'O servidor não devolveu a credencial da máquina.'
}
Write-InstallLog 'Pareamento concluído.'

# --- 3. credencial protegida gravada imediatamente -------------------------
Add-Type -AssemblyName System.Security
$tokenBytes = [Text.Encoding]::UTF8.GetBytes([string]$pair.token)
$protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
  $tokenBytes,
  $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
$config = [ordered]@{
  apiUrl         = $ApiUrl.TrimEnd('/')
  protectedToken = [Convert]::ToBase64String($protectedBytes)
  agentId        = [string]$pair.agentId
  version        = [string]$manifest.version
  pluginStatus   = 'attention'
  installedAt    = [DateTime]::UtcNow.ToString('o')
}
$stagedConfig = Join-Path $stagingDir 'config.json'
Write-TextFile $stagedConfig ($config | ConvertTo-Json)
Move-Item -LiteralPath $stagedConfig -Destination $configPath -Force
$pair.token = $null
$tokenBytes = $null
$protectedBytes = $null
Write-InstallLog 'Credencial protegida por DPAPI para este usuário do Windows.'

# --- 4. troca local: parar o agente atual e substituir os arquivos ----------
# -SweepByPath porque o registro pode ter sido perdido (usuário apagou
# agent.pid, queda no meio de um reparo) enquanto o agente continua rodando e
# segurando o .exe: sem isso a substituição falharia por arquivo em uso. A
# varredura só atinge processos cujo executável é exatamente este.
$stopped = Stop-AgentProcess -InstallRoot $InstallRoot -AgentPath $agentPath -SweepByPath
if ($stopped -gt 0) { Write-InstallLog ('Agente anterior encerrado ({0} processo(s)).' -f $stopped) }

Move-Item -LiteralPath $stagedAgent -Destination $agentPath -Force
Move-Item -LiteralPath $stagedHook -Destination $hookPath -Force
Write-TextFile $processLibPath $processLibSource
Write-TextFile $launcherPath $launcherSource
Write-TextFile $uninstallerPath $uninstallerSource

if (-not $NoAutostart) {
  $runCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $launcherPath
  New-Item -Path $RunKeyPath -Force | Out-Null
  Set-ItemProperty -Path $RunKeyPath -Name $RunName -Value $runCommand
  Write-InstallLog 'Início automático configurado para esta conta do Windows.'
}

if ($SkipPlugin) {
  $pluginStatus = 'unknown'
  Write-InstallLog 'Instalação do plugin ignorada por opção de diagnóstico.'
}
else {
  $pluginStatus = Install-ClaudePlugin
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$config.pluginStatus = $pluginStatus
Write-TextFile $configPath ($config | ConvertTo-Json)

# --- 5. diagnóstico: só é sucesso o que foi comprovado ---------------------
if (-not $NoStart) {
  & $launcherPath
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $live = $null
  while ($true) {
    $live = Resolve-AgentProcess -InstallRoot $InstallRoot -AgentPath $agentPath
    if ($live -or [DateTime]::UtcNow -ge $deadline) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $live) {
    throw 'O agente não permaneceu em execução. Veja agent.err.log na pasta de instalação e rode o reparo do painel.'
  }
  Write-InstallLog ('Agente em execução (PID {0}).' -f $live.ProcessId)
}

$probe = Invoke-AgentCommand -ExePath $agentPath -Arguments '--probe --json' -TimeoutSeconds 120
if ($probe.ExitCode -ne 0) {
  throw ('O diagnóstico do agente falhou (código {0}). Rode o reparo do painel.' -f $probe.ExitCode)
}
$probed = $null
try { $probed = $probe.StdOut | ConvertFrom-Json }
catch { throw 'O diagnóstico do agente não devolveu JSON válido. Rode o reparo do painel.' }
$sessionCount = 0
if ($null -ne $probed) { $sessionCount = @($probed).Count }
Write-InstallLog ('Diagnóstico concluído: {0} sessão(ões) visível(is) nesta máquina.' -f $sessionCount)

Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
Write-InstallLog 'Instalação concluída. A credencial foi protegida para este usuário do Windows.'
Write-Host 'Você já pode voltar ao painel.'
