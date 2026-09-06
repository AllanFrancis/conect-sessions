<#
Launcher do agente Conect Sessions.

Roda no logon (HKCU\...\Run) e no fim da instalação. Duas responsabilidades que
não podem falhar: garantir um único agente por instalação e entregar o token ao
processo filho sem que ele exista em disco em claro nem em linha de comando —
DPAPI abre o segredo em memória, o filho herda por ambiente.
#>
$ErrorActionPreference = 'Stop'

$installRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($installRoot)) {
  $installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$processLib = Join-Path $installRoot 'agent-process.ps1'
if (-not (Test-Path -LiteralPath $processLib)) {
  throw 'Instalação incompleta: agent-process.ps1 não encontrado. Rode o comando de reparo do painel.'
}
. $processLib

$agentPath = Join-Path $installRoot 'conect-agent.exe'
$configPath = Join-Path $installRoot 'config.json'
if (-not (Test-Path -LiteralPath $agentPath) -or -not (Test-Path -LiteralPath $configPath)) {
  throw 'Instalação incompleta: rode o comando de reparo do painel.'
}

# Verificar processo vivo não basta como exclusão: autostart e reparo podem
# chegar aqui no mesmo instante e os dois passariam pela checagem antes de
# qualquer um gravar o registro. O mutex é por instalação e local à sessão do
# Windows (Global exigiria privilégio que usuário comum não tem).
$mutex = New-Object System.Threading.Mutex($false, ('Local\ConectSessionsAgent-' + (Get-AgentInstallKey -InstallRoot $installRoot)))
$acquired = $false
$shouldStart = $false
try {
  try { $acquired = $mutex.WaitOne(10000) }
  catch [System.Threading.AbandonedMutexException] { $acquired = $true }

  if ($acquired) {
    $running = Resolve-AgentProcess -InstallRoot $installRoot -AgentPath $agentPath
    if ($running) {
      Write-Host ('Agente já em execução (PID {0}).' -f $running.ProcessId)
    }
    else {
      # Registro que não resolve para o nosso executável é stale: sai do caminho
      # sem encerrar o PID, que pode pertencer a outro programa.
      Clear-AgentRecord -InstallRoot $installRoot
      $shouldStart = $true
    }
  }

  if ($shouldStart) {
    foreach ($name in @('agent.log', 'agent.err.log')) {
      $file = Join-Path $installRoot $name
      if ((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -gt 2MB) {
        Move-Item -LiteralPath $file -Destination "$file.1" -Force
      }
    }

    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    Add-Type -AssemblyName System.Security
    $cipher = [Convert]::FromBase64String([string]$config.protectedToken)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect(
      $cipher,
      $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $env:LRC_TOKEN = [Text.Encoding]::UTF8.GetString($plain)
    $env:LRC_URL = [string]$config.apiUrl
    $env:LRC_AGENT_VERSION = [string]$config.version
    $env:LRC_AGENT_PLATFORM = 'windows-x64'
    $env:LRC_PLUGIN_STATUS = if ([string]::IsNullOrWhiteSpace([string]$config.pluginStatus)) { 'unknown' } else { [string]$config.pluginStatus }
    $env:LRC_STATE_DIR = Join-Path $installRoot 'state'

    try {
      $process = Start-Process -FilePath $agentPath -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $installRoot 'agent.log') `
        -RedirectStandardError (Join-Path $installRoot 'agent.err.log')
    }
    finally {
      $env:LRC_TOKEN = $null
      $plain = $null
      $cipher = $null
    }

    $startFileTime = ''
    try { $startFileTime = [string]$process.StartTime.ToFileTime() } catch { $startFileTime = '' }
    Save-AgentRecord -InstallRoot $installRoot -ProcessId $process.Id -AgentPath $agentPath -StartFileTime $startFileTime
    Write-Host ('Agente iniciado (PID {0}).' -f $process.Id)
  }
}
finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
