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
    <#
    A rotação saiu daqui: quem gira `agent.log` agora é o próprio agente, a cada
    escrita e no mesmo limite de 2MB. Rodar só no start deixava o arquivo crescer
    sem teto numa máquina ligada por semanas — e, pior, o redirecionamento abaixo
    prendia um handle no arquivo, o que fazia o rename da rotação falhar.

    `agent.err.log` deixa de ser escrito: o agente grava uma trilha única com o
    nível na linha, porque o que o diagnóstico precisa é da ORDEM entre "o tick fez
    X" e "o sync falhou por Y". Um `agent.err.log` de instalação antiga fica para
    trás inofensivo; a rotação dele vira responsabilidade de ninguém porque ele
    para de crescer.
    #>
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
    $env:LRC_LOG_FILE = Join-Path $installRoot 'agent.log'

    <#
    Sem `-RedirectStandardOutput`/`-RedirectStandardError`, de propósito.

    O executável é compilado com `--windows-hide-console` e um processo sem console
    não entrega nada ao redirecionamento: medido em 2026-09-06, `agent.log` com 0
    byte depois de 7h30 de agente vivo. O redirecionamento não recuperava saída
    NENHUMA e ainda mantinha um handle preso no arquivo, bloqueando a rotação. O
    agente escreve com handle próprio, no caminho que `LRC_LOG_FILE` acabou de
    dizer.
    #>
    try {
      $process = Start-Process -FilePath $agentPath -WindowStyle Hidden -PassThru
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
