# O wrapper pertence ao plugin, mas o executável pertence à instalação local.
# Toda falha é fail-open: nunca interromper uma sessão do Claude Code.
$ErrorActionPreference = 'SilentlyContinue'

try {
  $installRoot = Join-Path $env:LOCALAPPDATA 'Conect Sessions'
  $hookPath = Join-Path $installRoot 'conect-hook.exe'
  if (-not (Test-Path -LiteralPath $hookPath)) { exit 0 }
  $env:LRC_STATE_DIR = Join-Path $installRoot 'state'
  $defaultTimeoutMilliseconds = 125000
  $killWaitMilliseconds = 5000
  $timeoutMilliseconds = $defaultTimeoutMilliseconds
  if ([int]::TryParse($env:LRC_HOOK_TIMEOUT_MS, [ref]$timeoutMilliseconds) -eq $false) {
    $timeoutMilliseconds = $defaultTimeoutMilliseconds
  }
  $inputText = [Console]::In.ReadToEnd()
  $process = New-Object Diagnostics.Process
  $process.StartInfo.FileName = $hookPath
  $process.StartInfo.Arguments = '--state-dir "{0}"' -f $env:LRC_STATE_DIR
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardInput = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  if (-not $process.Start()) { exit 0 }
  $process.StandardInput.Write($inputText)
  $process.StandardInput.Close()
  $outputTask = $process.StandardOutput.ReadToEndAsync()
  $errorTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($timeoutMilliseconds)) {
    try { $process.Kill() } catch { }
    try { $null = $process.WaitForExit($killWaitMilliseconds) } catch { }
    exit 0
  }
  $outputText = $outputTask.Result
  $errorText = $errorTask.Result
  if ($env:LRC_HOOK_DEBUG -eq '1' -and -not [string]::IsNullOrWhiteSpace($errorText)) {
    [Console]::Error.Write($errorText)
  }
  if ($process.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($outputText)) {
    [Console]::Out.Write($outputText)
  }
}
catch {
  if ($env:LRC_HOOK_DEBUG -eq '1') { [Console]::Error.WriteLine($_.Exception.Message) }
}

exit 0
