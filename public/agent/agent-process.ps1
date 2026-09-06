<#
Identidade do processo do agente — fonte única usada pelo instalador, pelo
launcher e pelo desinstalador.

Por que existe: um número de PID não identifica um processo. O Windows recicla
PID, e `agent.pid` sobrevive ao fim abrupto do agente (kill, queda de energia,
logoff forçado). Confiar no número cru significa `Stop-Process -Force` no
programa que herdou aquele número, e significa o launcher achar que o agente já
está rodando quando o PID pertence a outro aplicativo.

Aqui a identidade é o par (caminho do executável, horário de criação do
processo). O que não conferir é registro velho: vira arquivo stale, nunca alvo
de Stop-Process. Caminho ilegível (processo de outro usuário, processo
protegido) também é "não é nosso" — a dúvida sempre resolve para não matar.
#>

function Get-AgentRecordPath {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)
  return (Join-Path $InstallRoot 'agent.pid')
}

<# Chave comparável de caminho: mistura de barras e caixa é a regra no Windows. #>
function Get-AgentPathKey {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
  try {
    return ([IO.Path]::GetFullPath($Path)).TrimEnd('\').ToLowerInvariant()
  }
  catch {
    return $Path.Trim().TrimEnd('\').ToLowerInvariant()
  }
}

<# Identificador estável da instalação (nome de mutex, sem barras). #>
function Get-AgentInstallKey {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)
  $bytes = [Text.Encoding]::UTF8.GetBytes((Get-AgentPathKey $InstallRoot))
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally { $sha256.Dispose() }
  return $hash.Substring(0, 16)
}

<# Fatos observáveis de um PID vivo, ou $null quando não existe. #>
function Get-AgentProcessFacts {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  if ($ProcessId -le 0) { return $null }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  $path = $null
  $start = $null
  try { $path = [string]$process.Path } catch { $path = $null }
  try { $start = [string]$process.StartTime.ToFileTime() } catch { $start = $null }
  return [pscustomobject]@{
    Process       = $process
    ProcessId     = $ProcessId
    Path          = $path
    StartFileTime = $start
  }
}

<#
Lê `agent.pid`. Formato atual é JSON com pid/path/start; o formato antigo era só
o número. Registro antigo é aceito, mas sem horário de criação ele depende
apenas da igualdade de caminho — que já é evidência suficiente para não atingir
terceiros.
#>
function Read-AgentRecord {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)
  $recordPath = Get-AgentRecordPath -InstallRoot $InstallRoot
  if (-not (Test-Path -LiteralPath $recordPath)) { return $null }
  $raw = $null
  try { $raw = Get-Content -LiteralPath $recordPath -Raw -ErrorAction Stop } catch { return $null }
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  $raw = $raw.Trim()

  if ($raw -match '^\d+$') {
    return [pscustomobject]@{
      ProcessId     = [int]$raw
      AgentPath     = $null
      StartFileTime = $null
      Legacy        = $true
    }
  }

  $data = $null
  try { $data = $raw | ConvertFrom-Json } catch { return $null }
  if (-not $data -or -not ("$($data.pid)" -match '^\d+$')) { return $null }
  return [pscustomobject]@{
    ProcessId     = [int]$data.pid
    AgentPath     = [string]$data.path
    StartFileTime = [string]$data.start
    Legacy        = $false
  }
}

function Save-AgentRecord {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][string]$AgentPath,
    [string]$StartFileTime = ''
  )
  $record = [ordered]@{
    pid   = $ProcessId
    path  = $AgentPath
    start = $StartFileTime
  }
  # Sem BOM: o registro é lido pelo launcher, pelo instalador e por ferramentas
  # de diagnóstico, e `Set-Content -Encoding UTF8` do PowerShell 5.1 grava um
  # BOM que quebra qualquer parser de JSON menos tolerante.
  [IO.File]::WriteAllText(
    [IO.Path]::GetFullPath((Get-AgentRecordPath -InstallRoot $InstallRoot)),
    ($record | ConvertTo-Json -Compress),
    (New-Object Text.UTF8Encoding($false))
  )
}

function Clear-AgentRecord {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)
  Remove-Item -LiteralPath (Get-AgentRecordPath -InstallRoot $InstallRoot) -Force -ErrorAction SilentlyContinue
}

<#
Devolve o processo do agente desta instalação, ou $null. $null significa
"não há agente nosso vivo": pode ser PID morto, PID reciclado por outro
programa ou registro corrompido. Em nenhum desses casos o chamador tem
autorização para encerrar o PID.
#>
function Resolve-AgentProcess {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$AgentPath
  )
  $record = Read-AgentRecord -InstallRoot $InstallRoot
  if (-not $record) { return $null }
  $facts = Get-AgentProcessFacts -ProcessId $record.ProcessId
  if (-not $facts) { return $null }

  $expected = Get-AgentPathKey $AgentPath
  $actual = Get-AgentPathKey $facts.Path
  if ([string]::IsNullOrWhiteSpace($actual) -or $actual -ne $expected) { return $null }

  if (-not $record.Legacy -and
      -not [string]::IsNullOrWhiteSpace($record.StartFileTime) -and
      -not [string]::IsNullOrWhiteSpace($facts.StartFileTime) -and
      $record.StartFileTime -ne $facts.StartFileTime) {
    return $null
  }

  return [pscustomobject]@{
    Process       = $facts.Process
    ProcessId     = $facts.ProcessId
    Path          = $facts.Path
    StartFileTime = $facts.StartFileTime
  }
}

function Wait-AgentProcessExit {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [int]$TimeoutSeconds = 10
  )
  try { return $Process.WaitForExit($TimeoutSeconds * 1000) } catch { return $true }
}

<#
Encerra o agente desta instalação e limpa o registro. Devolve quantos processos
foram encerrados. Nunca encerra PID cujo executável não seja $AgentPath.
#>
function Stop-AgentProcess {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$AgentPath,
    [switch]$SweepByPath
  )
  $stopped = 0
  $targets = @()

  $recorded = Resolve-AgentProcess -InstallRoot $InstallRoot -AgentPath $AgentPath
  if ($recorded) { $targets += $recorded.Process }

  if ($SweepByPath) {
    $expected = Get-AgentPathKey $AgentPath
    foreach ($candidate in (Get-Process -ErrorAction SilentlyContinue)) {
      $candidatePath = $null
      try { $candidatePath = [string]$candidate.Path } catch { $candidatePath = $null }
      if ([string]::IsNullOrWhiteSpace($candidatePath)) { continue }
      if ((Get-AgentPathKey $candidatePath) -ne $expected) { continue }
      if ($targets | Where-Object { $_.Id -eq $candidate.Id }) { continue }
      $targets += $candidate
    }
  }

  foreach ($target in $targets) {
    Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue
    Wait-AgentProcessExit -Process $target -TimeoutSeconds 10 | Out-Null
    $stopped += 1
  }

  Clear-AgentRecord -InstallRoot $InstallRoot
  return $stopped
}
