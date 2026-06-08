param(
  [int]$Port = 3000,
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $NodePath) {
  $portableNode = Join-Path $repoRoot "..\node-v24.16.0-win-x64\node.exe"
  $bundledNode = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

  if (Test-Path $portableNode) {
    $NodePath = $portableNode
  } elseif (Test-Path $bundledNode) {
    $NodePath = $bundledNode
  }
}

if (-not (Test-Path $NodePath)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "Node.js was not found. Install Node.js or pass -NodePath with the path to node.exe."
  }
  $NodePath = $nodeCommand.Source
}

if (-not (Test-Path ".env")) {
  Write-Warning "No .env file found. Copy .env.example to .env and add OPENAI_API_KEY before testing real chatbot replies."
} else {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*([^#=]+)=(.*)$") {
      $name = $matches[1].Trim()
      $value = $matches[2]
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$env:PORT = [string]$Port
$keySuffix = if ($env:OPENAI_API_KEY) { $env:OPENAI_API_KEY.Substring([Math]::Max(0, $env:OPENAI_API_KEY.Length - 5)) } else { "unset" }
Write-Host "Using OPENAI_API_KEY ending in $keySuffix"
Write-Host "Starting BRS Support Agent on http://localhost:$Port"
$serverPath = (Resolve-Path "server-with-feedback.js").Path
$argvPath = $serverPath.Replace("\", "\\")
$modulePath = $serverPath.Replace("\", "/")
$bootstrap = @"
process.argv[1] = '$argvPath';
await import('file:///$modulePath');
setInterval(() => {}, 2147483647);
"@
& $NodePath --input-type=module --eval $bootstrap
