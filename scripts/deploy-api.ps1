# Build + push API container locally, then deploy to Cloud Run.
# Avoids `gcloud run deploy --source` which triggers a Cloud Build path
# that requires granting the GCP-owned compute default service account
# object-viewer on the staging bucket. That IAM binding is blocked by the
# org policy `constraints/iam.allowedPolicyMemberDomains` (allowed value
# customer C0284dfqm only). Building and pushing from this workstation
# bypasses the Cloud Build service account entirely.

param(
  [string]$Project = 'communitybridge-26apr',
  [string]$Region  = 'us-central1',
  [string]$Service = 'communitybridge',
  [string]$Repo    = 'cloud-run-source-deploy',
  [string]$Tag     = (Get-Date -Format 'yyyyMMdd-HHmmss')
)

$ErrorActionPreference = 'Stop'
$image = "$Region-docker.pkg.dev/$Project/$Repo/${Service}:$Tag"

Write-Host "==> Building $image"
docker build -t $image .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "==> Pushing $image"
docker push $image
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "==> Deploying to Cloud Run: $Service ($Region)"
gcloud run deploy $Service `
  --image $image `
  --region $Region `
  --project $Project `
  --platform managed `
  --quiet
if ($LASTEXITCODE -ne 0) { throw "gcloud run deploy failed" }

Write-Host "==> Done. Image: $image"
