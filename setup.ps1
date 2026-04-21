if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm not found. Please install Node.js and npm first." -ForegroundColor Yellow
  exit 1
}

Write-Host "Installing dependencies..."
npm install

if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $inside = git rev-parse --is-inside-work-tree 2>$null
    if ($inside -eq "true") {
      Write-Host "Configuring git hooks (.githooks)..."
      git config core.hooksPath .githooks
    }
  } catch {
    # ignore
  }
}

if (-not (Get-Command expo -ErrorAction SilentlyContinue)) {
  Write-Host "Installing expo CLI globally..."
  npm install -g expo-cli
}

Write-Host "Done. Run 'npm start' or 'expo start' to launch the app."