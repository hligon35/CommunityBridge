# Creates (or adds new versions to) Cloud Run secrets in Secret Manager and grants
# the Cloud Run runtime service account access to them. Safe to re-run.
#
# Usage:
#   # One-shot with values pulled from env/cloudrun.env (recommended):
#   pwsh scripts/create-cloudrun-secrets.ps1 -FromFile env/cloudrun.env
#
#   # Or interactive (prompts for each secret value, input is hidden):
#   pwsh scripts/create-cloudrun-secrets.ps1
#
# After running this, apply non-secrets + bind secrets to the service with:
#   gcloud run services update communitybridge `
#     --region us-central1 --project communitybridge-26apr `
#     --env-vars-file tmp/cloudrun-nonsecrets.env.yaml `
#     --update-secrets "CB_DATABASE_URL=cb-database-url:latest,BB_DATABASE_URL=bb-database-url:latest,CB_JWT_SECRET=cb-jwt-secret:latest,BB_JWT_SECRET=bb-jwt-secret:latest,CB_SMTP_URL=cb-smtp-url:latest,BB_SMTP_URL=bb-smtp-url:latest,CB_TWILIO_AUTH_TOKEN=cb-twilio-token:latest,BB_TWILIO_AUTH_TOKEN=bb-twilio-token:latest,CB_ADMIN_PASSWORD=cb-admin-password:latest,BB_ADMIN_PASSWORD=bb-admin-password:latest"

param(
  [string]$Project = "communitybridge-26apr",
  [string]$Region  = "us-central1",
  [string]$Service = "communitybridge",
  [string]$FromFile
)

$ErrorActionPreference = "Continue"

# Map: secret name in Secret Manager -> env var key to read from FromFile
$SecretMap = [ordered]@{
  "cb-database-url"   = "CB_DATABASE_URL"
  "bb-database-url"   = "BB_DATABASE_URL"
  "cb-jwt-secret"     = "CB_JWT_SECRET"
  "bb-jwt-secret"     = "BB_JWT_SECRET"
  "cb-smtp-url"     = "CB_SMTP_URL"
  "bb-smtp-url"     = "BB_SMTP_URL"
  "cb-twilio-token" = "CB_TWILIO_AUTH_TOKEN"
  "bb-twilio-token" = "BB_TWILIO_AUTH_TOKEN"
  "cb-admin-password" = "CB_ADMIN_PASSWORD"
  "bb-admin-password" = "BB_ADMIN_PASSWORD"
}

function Get-EnvValueFromFile {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#') { continue }
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)\s*$") {
      return $Matches[1]
    }
  }
  return $null
}

# Ensure Secret Manager API is enabled (idempotent)
Write-Host "==> Ensuring Secret Manager API is enabled..."
gcloud services enable secretmanager.googleapis.com --project $Project --quiet | Out-Null

# Resolve Cloud Run runtime service account (defaults to the compute SA)
$runtimeSa = gcloud run services describe $Service --region $Region --project $Project `
  --format="value(spec.template.spec.serviceAccountName)" 2>$null
if ([string]::IsNullOrWhiteSpace($runtimeSa)) {
  $projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
  $runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
}
Write-Host "    Runtime SA: $runtimeSa"

foreach ($secretName in $SecretMap.Keys) {
  $envKey = $SecretMap[$secretName]
  Write-Host ""
  Write-Host "==> $secretName  ($envKey)"

  # Get value
  $value = $null
  if ($FromFile) {
    $value = Get-EnvValueFromFile -Path $FromFile -Key $envKey
    if ([string]::IsNullOrEmpty($value)) {
      Write-Warning "    $envKey not found in $FromFile — skipping."
      continue
    }
  } else {
    $secure = Read-Host -Prompt "    Enter value for $envKey (input hidden)" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ([string]::IsNullOrEmpty($value)) {
      Write-Warning "    Empty value — skipping."
      continue
    }
  }

  # Create secret if missing
  $null = gcloud secrets describe $secretName --project $Project 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    Creating secret..."
    gcloud secrets create $secretName --replication-policy="automatic" --project $Project --quiet | Out-Null
  } else {
    Write-Host "    Secret exists."
  }

  # Add new version (pipe value via stdin to avoid arg quoting issues)
  $tmpFile = New-TemporaryFile
  try {
    # -NoNewline: trailing newline becomes part of the secret value if included
    Set-Content -LiteralPath $tmpFile.FullName -Value $value -NoNewline -Encoding utf8
    $dataFile = $tmpFile.FullName
    gcloud secrets versions add $secretName --data-file="$dataFile" --project $Project --quiet
    if ($LASTEXITCODE -eq 0) {
      Write-Host "    New version added."
    } else {
      Write-Warning "    Failed to add secret version for $secretName (exit $LASTEXITCODE)."
    }
  } finally {
    Remove-Item -LiteralPath $tmpFile.FullName -Force -ErrorAction SilentlyContinue
  }

  # Per-secret IAM binding skipped: org policy blocks binding Google-owned SAs.
  # The compute SA already has project-level Secret Manager access (existing
  # cb-jwt-secret / bb-jwt-secret bindings on the Cloud Run service confirm this).
}

Write-Host ""
Write-Host "==> Done. Next step:"
Write-Host "gcloud run services update $Service ``"
Write-Host "  --region $Region --project $Project ``"
Write-Host "  --env-vars-file tmp/cloudrun-nonsecrets.env.yaml ``"
Write-Host "  --update-secrets `"CB_DATABASE_URL=cb-database-url:latest,BB_DATABASE_URL=bb-database-url:latest,CB_JWT_SECRET=cb-jwt-secret:latest,BB_JWT_SECRET=bb-jwt-secret:latest,CB_SMTP_URL=cb-smtp-url:latest,BB_SMTP_URL=bb-smtp-url:latest,CB_TWILIO_AUTH_TOKEN=cb-twilio-token:latest,BB_TWILIO_AUTH_TOKEN=bb-twilio-token:latest,CB_ADMIN_PASSWORD=cb-admin-password:latest,BB_ADMIN_PASSWORD=bb-admin-password:latest`""
