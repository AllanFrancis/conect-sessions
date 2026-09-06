<#
Remoção do agente Conect Sessions desta conta do Windows.

Fonte única: este arquivo é servido em /agent/uninstall-agent.ps1 e é o mesmo
conteúdo que o instalador grava como uninstall.ps1 dentro da instalação. Não
existe segunda cópia para divergir.

Remoção é a operação em que matar o processo errado dói mais: quem desinstala
não está olhando. Por isso o encerramento passa pela identidade de
agent-process.ps1 e, como rede de segurança, por uma varredura que só atinge
processos cujo executável é exatamente o desta instalação.
#>
param(
  [string]$InstallRoot = '',
  [string]$RunKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
  [string]$RunName = 'ConectSessionsAgent',
  [switch]$SkipPlugin
)

$ErrorActionPreference = 'Stop'

$scriptRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  # Instalado, este script mora na própria instalação; baixado solto, não.
  if (Test-Path -LiteralPath (Join-Path $scriptRoot 'config.json')) {
    $InstallRoot = $scriptRoot
  }
  else {
    $InstallRoot = Join-Path $env:LOCALAPPDATA 'Conect Sessions'
  }
}

Remove-ItemProperty -Path $RunKeyPath -Name $RunName -ErrorAction SilentlyContinue

if (-not $SkipPlugin) {
  $claude = Get-Command 'claude' -ErrorAction SilentlyContinue
  if ($claude) {
    try {
      & $claude.Source plugin uninstall 'conect-sessions@conect-sessions' --scope user *> $null
      if ($LASTEXITCODE -ne 0) {
        Write-Warning 'O plugin do Claude Code não pôde ser removido automaticamente. Use /plugin para removê-lo.'
      }
    }
    catch {
      Write-Warning 'O plugin do Claude Code não pôde ser removido automaticamente. Use /plugin para removê-lo.'
    }
  }
}

if (-not (Test-Path -LiteralPath $InstallRoot)) {
  Write-Host 'Conect Sessions já não está instalado nesta conta do Windows.'
  return
}

$agentPath = Join-Path $InstallRoot 'conect-agent.exe'
$processLib = Join-Path $InstallRoot 'agent-process.ps1'
if (-not (Test-Path -LiteralPath $processLib)) {
  $processLib = Join-Path $scriptRoot 'agent-process.ps1'
}

if (Test-Path -LiteralPath $processLib) {
  . $processLib
  $stopped = Stop-AgentProcess -InstallRoot $InstallRoot -AgentPath $agentPath -SweepByPath
  if ($stopped -gt 0) { Write-Host ('Agente encerrado ({0} processo(s)).' -f $stopped) }
}
else {
  Write-Warning 'agent-process.ps1 não encontrado: nenhum processo foi encerrado por segurança.'
}

try {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}
catch {
  throw ('Não foi possível remover "{0}": {1}. Feche o agente e rode a remoção novamente.' -f $InstallRoot, $_.Exception.Message)
}

Write-Host 'Conect Sessions removido desta conta do Windows.'
