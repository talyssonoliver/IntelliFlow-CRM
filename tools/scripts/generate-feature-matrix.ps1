$ErrorActionPreference = "Stop"

$csvPath = "apps/project-tracker/docs/metrics/_global/Sprint_plan.csv"
$flowsDir = "apps/project-tracker/docs/metrics/_global/flows"
$outPath = "docs/company/product/feature-matrix.md"
$htmlOutPath = "apps/project-tracker/public/feature-matrix.html"
$outDir = Split-Path -Parent $outPath
$htmlOutDir = Split-Path -Parent $htmlOutPath

if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
if (-not (Test-Path $htmlOutDir)) {
  New-Item -ItemType Directory -Path $htmlOutDir -Force | Out-Null
}

$rows = Import-Csv $csvPath
$rowsById = @{}
foreach ($r in $rows) {
  $id = ([string]$r.'Task ID').Trim()
  if ($id) { $rowsById[$id] = $r }
}
$docContentCache = @{}

function Normalize-Status([string]$status) {
  $s = ([string]$status).Trim().ToLower()
  switch -Regex ($s) {
    '^(completed|done)$' { return 'done' }
    '^(in progress|in_progress|spec complete)$' { return 'in_progress' }
    default { return 'planned' }
  }
}

function Clean-Cell([string]$text) {
  if ($null -eq $text) { return '' }
  $t = [string]$text
  $t = $t.replaceAll('|', '/')
  $t = [regex]::Replace($t, '\p{Pd}', '-')
  $t = $t.replaceAll("`r", ' ').replaceAll("`n", ' ').Trim()
  $t = [regex]::Replace($t, '\s+', ' ')
  return $t
}

function Parse-TaskIds([string]$text) {
  $ids = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in [regex]::Matches(([string]$text), '[A-Z]+-\d+')) {
    [void]$ids.Add($m.Value)
  }
  return @($ids)
}

function Get-DependencyIds([string]$dependencies) {
  if ([string]::IsNullOrWhiteSpace($dependencies)) { return @() }
  $out = New-Object System.Collections.Generic.HashSet[string]
  foreach ($token in ($dependencies -split '[,;]')) {
    $id = (Clean-Cell $token).ToUpper()
    if ($id -match '^[A-Z]+-\d+(?:-[A-Z0-9]+)*$') {
      [void]$out.Add($id)
    }
  }
  return @($out)
}

function Get-TaskIdParts([string]$taskId) {
  $id = (Clean-Cell $taskId).ToUpper()
  if ($id -match '^([A-Z]+)-(\d+)') {
    return [pscustomobject]@{
      Prefix = $Matches[1]
      Number = [int]$Matches[2]
    }
  }
  return $null
}

function Test-TaskIdInRange([string]$taskId, [string]$startTaskId, [string]$endTaskId) {
  $task = Get-TaskIdParts $taskId
  $start = Get-TaskIdParts $startTaskId
  $end = Get-TaskIdParts $endTaskId
  if (-not $task -or -not $start -or -not $end) { return $false }
  if ($task.Prefix -ne $start.Prefix -or $task.Prefix -ne $end.Prefix) { return $false }
  $min = [Math]::Min($start.Number, $end.Number)
  $max = [Math]::Max($start.Number, $end.Number)
  return ($task.Number -ge $min -and $task.Number -le $max)
}

function Get-MeaningfulTerms([string]$text) {
  $stopWords = @(
    'and','the','for','with','from','this','that','these','those','into','onto','over','under',
    'page','pages','section','sections','part','parts','feature','features','deliver','task','tasks',
    'flow','flows','public','auth','card','cards','grid','view','panel','list','item','items'
  )
  $terms = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in [regex]::Matches(([string]$text).ToLower(), '[a-z0-9]+')) {
    $token = $m.Value
    if ($token.Length -lt 4) { continue }
    if ($stopWords -contains $token) { continue }
    [void]$terms.Add($token)
  }
  return @($terms | Sort-Object | Select-Object -First 10)
}

function Test-FeatureMention([string]$content, [string]$featureTitle, [string]$primaryTitle) {
  if ([string]::IsNullOrWhiteSpace($content)) { return $false }
  $lc = ([string]$content).ToLower()
  foreach ($phrase in @($featureTitle, $primaryTitle)) {
    $p = (Clean-Cell $phrase).ToLower()
    if ($p -and $p.Length -ge 4 -and $lc.Contains($p)) {
      return $true
    }
  }

  $terms = Get-MeaningfulTerms "$featureTitle $primaryTitle"
  if ($terms.Count -eq 0) { return $false }
  $hits = 0
  foreach ($t in $terms) {
    if ($lc -match ("\b" + [regex]::Escape($t) + "\b")) { $hits++ }
  }
  if ($terms.Count -le 2) { return ($hits -ge 1) }
  if ($terms.Count -le 5) { return ($hits -ge 2) }
  return ($hits -ge 3)
}

function Get-DocContent([string]$path) {
  $p = Clean-Cell $path
  if (-not $p) { return '' }
  if ($docContentCache.ContainsKey($p)) {
    return [string]$docContentCache[$p]
  }
  $content = ''
  if (Test-Path -LiteralPath $p) {
    $content = Get-Content -LiteralPath $p -Raw
  }
  $docContentCache[$p] = $content
  return [string]$content
}

function Get-DocTaskScope([string]$docPath, [string]$taskId, [string]$featureTitle, [string]$primaryTitle) {
  $path = Clean-Cell $docPath
  if (-not $path) {
    return [pscustomobject]@{
      Scope = 'none'
      Label = ''
      Reason = ''
    }
  }
  if (-not (Test-Path -LiteralPath $path)) {
    return [pscustomobject]@{
      Scope = 'missing'
      Label = "$path [missing file]"
      Reason = 'missing_file'
    }
  }

  $content = Get-DocContent $path
  $taskPattern = "(?i)\b$([regex]::Escape((Clean-Cell $taskId)))\b"
  if ($content -match $taskPattern) {
    return [pscustomobject]@{
      Scope = 'task'
      Label = "$path [task-id]"
      Reason = 'task_id'
    }
  }

  if (Test-FeatureMention $content $featureTitle $primaryTitle) {
    return [pscustomobject]@{
      Scope = 'task'
      Label = "$path [feature]"
      Reason = 'feature_terms'
    }
  }

  $rangeHits = New-Object System.Collections.Generic.List[string]
  foreach ($m in [regex]::Matches($content, '([A-Z]+-\d+)\s*[\p{Pd}-]\s*([A-Z]+-\d+)')) {
    $start = $m.Groups[1].Value.ToUpper()
    $end = $m.Groups[2].Value.ToUpper()
    if (Test-TaskIdInRange $taskId $start $end) {
      $rangeHits.Add("$start-$end")
    }
  }
  if ($rangeHits.Count -gt 0) {
    $rangeText = (@($rangeHits | Sort-Object -Unique) -join '/')
    return [pscustomobject]@{
      Scope = 'shared'
      Label = "$path [task-range: $rangeText]"
      Reason = 'task_range'
    }
  }

  return [pscustomobject]@{
    Scope = 'shared'
    Label = "$path [shared-context]"
    Reason = 'shared_context'
  }
}

function Get-TaskScopedDocRefs([string[]]$docPaths, [string]$taskId, [string]$featureTitle, [string]$primaryTitle) {
  $taskScoped = New-Object System.Collections.Generic.List[string]
  $shared = New-Object System.Collections.Generic.List[string]
  $missing = New-Object System.Collections.Generic.List[string]
  $seen = New-Object System.Collections.Generic.HashSet[string]

  foreach ($docPath in $docPaths) {
    $cleanPath = Clean-Cell $docPath
    if (-not $cleanPath) { continue }
    if (-not $seen.Add($cleanPath)) { continue }

    $scope = Get-DocTaskScope $cleanPath $taskId $featureTitle $primaryTitle
    if ($scope.Scope -eq 'task') {
      $taskScoped.Add($scope.Label)
    } elseif ($scope.Scope -eq 'shared') {
      $shared.Add($scope.Label)
    } elseif ($scope.Scope -eq 'missing') {
      $missing.Add($scope.Label)
      $shared.Add($scope.Label)
    }
  }

  return [pscustomobject]@{
    TaskScoped = @($taskScoped | Sort-Object -Unique)
    Shared = @($shared | Sort-Object -Unique)
    Missing = @($missing | Sort-Object -Unique)
  }
}

function Split-Semicolon([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return @() }
  return ($value -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}

function Extract-TaggedValues([string]$value, [string[]]$tags) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($token in (Split-Semicolon $value)) {
    foreach ($tag in $tags) {
      $prefix = "${tag}:"
      if ($token.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $v = $token.Substring($prefix.Length).Trim()
        if ($v) { $out.Add($v) }
      }
    }
  }
  return @($out)
}

function Clean-FeatureTitle([string]$title) {
  $t = [string]$title
  $t = $t -replace '^FLOW-[^:]+:\s*', ''
  $t = $t -replace '^PHASE-[^:]+:\s*', ''
  return (Clean-Cell $t)
}

function Format-FullList([string[]]$items) {
  if (-not $items -or $items.Count -eq 0) { return '-' }
  $uniq = @($items | Where-Object { $_ -and $_.Trim() -ne '' } | ForEach-Object { Clean-Cell $_ } | Sort-Object -Unique)
  if ($uniq.Count -eq 0) { return '-' }
  return ($uniq -join ', ')
}

function Format-DocRefList([string[]]$items, [string]$label) {
  $joined = Format-FullList $items
  if ($joined -eq '-') { return "No $label linked" }
  return $joined
}

function Is-PathLike([string]$value) {
  $v = Clean-Cell $value
  if (-not $v) { return $false }
  if ($v -match '[,]' -or $v -match '\s') { return $false }
  if ($v -match '[\\/]' -or $v -match '^\.' -or $v -match '\.[A-Za-z0-9]{1,8}$') { return $true }
  return $false
}

function Test-TrackedPathExists([string]$path) {
  $p = Clean-Cell $path
  if (-not $p) { return $false }

  if ($p.IndexOfAny(@('*', '?')) -ge 0) {
    return ((Get-ChildItem -Path $p -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
  }
  return (Test-Path -LiteralPath $p)
}

function Get-ForecastRisk(
  [string]$featureStatus,
  [int]$missingRequiredLayers,
  [int]$unresolvedDependencyCount,
  [int]$missingDependencyRefCount,
  [int]$missingArtifactPathCount
) {
  if ($featureStatus -eq 'done') {
    if ($missingDependencyRefCount -gt 0 -or $unresolvedDependencyCount -gt 0 -or $missingArtifactPathCount -gt 0) { return 'critical' }
    if ($missingRequiredLayers -gt 0) { return 'high' }
    return 'low'
  }

  if ($featureStatus -eq 'in_progress') {
    if ($missingDependencyRefCount -gt 0 -or $missingArtifactPathCount -gt 0) { return 'high' }
    if ($unresolvedDependencyCount -gt 0 -or $missingRequiredLayers -ge 3) { return 'high' }
    if ($missingRequiredLayers -gt 0) { return 'medium' }
    return 'low'
  }

  if ($missingDependencyRefCount -gt 0) { return 'high' }
  if ($missingRequiredLayers -ge 3) { return 'medium' }
  if ($missingRequiredLayers -gt 0) { return 'low' }
  return 'low'
}

function Get-DependencyHealth([string]$rootTaskId, $rowsById) {
  $visited = New-Object System.Collections.Generic.HashSet[string]
  $queue = New-Object 'System.Collections.Generic.Queue[string]'
  $missing = New-Object System.Collections.Generic.HashSet[string]
  $unresolved = New-Object System.Collections.Generic.HashSet[string]

  $root = (Clean-Cell $rootTaskId).ToUpper()
  if (-not $root) {
    return [pscustomobject]@{
      VisitedTasks = @()
      MissingDependencies = @()
      UnresolvedDependencies = @()
    }
  }

  [void]$visited.Add($root)
  $queue.Enqueue($root)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $rowsById.ContainsKey($current)) { continue }

    $depIds = Get-DependencyIds $rowsById[$current].Dependencies
    foreach ($depId in $depIds) {
      if (-not $rowsById.ContainsKey($depId)) {
        [void]$missing.Add("$depId (missing)")
        continue
      }

      $depStatus = Normalize-Status $rowsById[$depId].Status
      if ($depStatus -ne 'done') {
        [void]$unresolved.Add("$depId ($depStatus)")
      }

      if ($visited.Add($depId)) {
        $queue.Enqueue($depId)
      }
    }
  }

  return [pscustomobject]@{
    VisitedTasks = @($visited | Sort-Object)
    MissingDependencies = @($missing | Sort-Object)
    UnresolvedDependencies = @($unresolved | Sort-Object)
  }
}

function Get-TaskClosure([string[]]$seedTaskIds, $rowsById) {
  $visited = New-Object System.Collections.Generic.HashSet[string]
  $queue = New-Object 'System.Collections.Generic.Queue[string]'

  foreach ($seed in $seedTaskIds) {
    $sid = (Clean-Cell $seed).ToUpper()
    if (-not $sid) { continue }
    if ($visited.Add($sid)) {
      $queue.Enqueue($sid)
    }
  }

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $rowsById.ContainsKey($current)) { continue }

    foreach ($depId in (Get-DependencyIds $rowsById[$current].Dependencies)) {
      if ($visited.Add($depId)) {
        $queue.Enqueue($depId)
      }
    }
  }

  return @($visited | Sort-Object)
}

function Format-TaskIdPreview([string[]]$ids, [int]$max = 6) {
  $uniq = @($ids | Where-Object { $_ -and $_.Trim() -ne '' } | Sort-Object -Unique)
  if ($uniq.Count -eq 0) { return '-' }
  if ($uniq.Count -le $max) { return ($uniq -join ', ') }
  $head = $uniq[0..($max - 1)] -join ', '
  return "$head (+$($uniq.Count - $max) more)"
}

function Get-Group([string]$section, [string]$text) {
  $sec = ([string]$section).ToLower()
  $s = ("$section $text").ToLower()

  if ($sec -match 'public pages|marketing pages') { return 'Marketing' }
  if ($sec -match 'auth pages') { return 'Auth' }
  if ($sec -match 'billing pages') { return 'Billing' }
  if ($sec -match 'developer pages') { return 'Developer' }
  if ($sec -eq 'settings') { return 'Settings' }
  if ($sec -match 'notifications') { return 'Notification' }
  if ($sec -match 'communications') { return 'Communication' }
  if ($sec -match 'legal pages') { return 'Legal' }
  if ($sec -match 'support pages|support') { return 'Ticket' }
  if ($sec -match 'ai intelligence|ai settings|ai foundation|ai insights|ai/ml|ai assistant|search/ai') { return 'AI' }
  if ($sec -match 'automation|workflow') { return 'Automation' }
  if ($sec -match 'analytics|reports') { return 'Analytics' }
  if ($sec -match 'case docs') { return 'Document' }
  if ($sec -match 'scheduling') { return 'Calendar' }
  if ($sec -match 'governance|compliance') { return 'Governance' }
  if ($sec -match 'infrastructure|platform|architecture|performance|security|resilience|validation|foundation|planning|operations|migration') { return 'Platform' }

  if ($s -match 'home|welcome summary|activity feed|daily goal|dashboard') { return 'Dashboard' }
  if ($s -match '\bleads?\b') { return 'Lead' }
  if ($s -match '\bcontacts?\b') { return 'Contact' }
  if ($s -match '\baccounts?\b') { return 'Account' }
  if ($s -match '\bdeals?\b|\bopportunit(?:y|ies)\b|pipeline|forecast|quote|order|price book|product') { return 'Deal' }
  if ($s -match '\btickets?\b|support') { return 'Ticket' }
  if ($s -match '\bcases?\b|deadline') { return 'Case' }
  if ($s -match '\bdocuments?\b|\bfiles?\b|ocr|ingestion|acl') { return 'Document' }
  if ($s -match 'appointment|calendar|scheduling') { return 'Calendar' }
  if ($s -match 'email|sms|whatsapp|communication|thread|template') { return 'Communication' }
  if ($s -match 'notification') { return 'Notification' }
  if ($s -match 'ai|agent|rag|churn|sentiment|drift|latency|scoring|nba|experiment|prompt|hallucination') { return 'AI' }
  if ($s -match 'report|analytics|metrics') { return 'Analytics' }
  if ($s -match 'billing|invoice|subscription|payment|receipt|checkout|stripe') { return 'Billing' }
  if ($s -match 'governance|compliance|audit|adr|policy') { return 'Governance' }

  return 'Platform'
}

function Get-Priority([string]$normalizedStatus, [string]$group, [string]$targetSprint) {
  if ($normalizedStatus -eq 'in_progress') { return 'P0' }
  if ($normalizedStatus -eq 'done') {
    if ($group -in @('Lead','Contact','Account','Deal','Ticket','Auth','Billing','Notification','AI','Marketing','Dashboard')) { return 'P1' }
    return 'P2'
  }

  $n = 0
  if ([int]::TryParse(([string]$targetSprint), [ref]$n)) {
    if ($n -le 16) { return 'P1' }
    if ($n -le 24) { return 'P2' }
  }
  return 'P3'
}

function Get-RequiredLayers([string]$group, [string]$primaryTaskId, [string]$primarySection, $primaryInfo, [string]$featureTitle) {
  $required = New-Object System.Collections.Generic.HashSet[string]
  $isPageTask = $primaryTaskId -match '^PG-'
  $section = ([string]$primarySection).ToLower()
  $title = ([string]$featureTitle).ToLower()
  $routerOnly = $title -match '\brouter\b'
  $allLayers = @('Entity','Domain','Database','Adapter','Router','Frontend')

  $nonExecutionSectionPattern = 'ai foundation|foundation setup|strategy|documentation|go-to-market|brand|design system|architecture governance|architecture|governance|operations|project operations|tracking|quality|testing|validation|planning|performance|resilience|security|compliance|risk mgmt|commercial assets|decision gate|investment gate|launch|engineering operations|mvp week 1|parallel track|infrastructure|observability|ai/ml|analytics & segmentation|intelligence|platform'
  if ($section -match $nonExecutionSectionPattern) {
    if ($isPageTask -or ($primaryInfo -and $primaryInfo.Frontend -and -not $routerOnly)) { [void]$required.Add('Frontend') }
    return $required
  }

  if ($section -match 'integrations?|integration') {
    foreach ($ln in @('Adapter','Router')) { [void]$required.Add($ln) }
    if ($primaryInfo -and $primaryInfo.Database) { [void]$required.Add('Database') }
    if ($primaryInfo -and $primaryInfo.Domain) { [void]$required.Add('Domain') }
    if ($isPageTask -and -not $routerOnly) { [void]$required.Add('Frontend') }
    return $required
  }

  if ($isPageTask) { [void]$required.Add('Frontend') }

  if ($group -in @('Marketing','Developer','Legal')) { return $required }

  if ($group -in @('Auth','Billing','Settings')) {
    foreach ($l in @('Domain','Database','Adapter','Router','Frontend')) { [void]$required.Add($l) }
    return $required
  }

  if ($group -in @('Lead','Contact','Account','Deal','Ticket','Case','Document','Notification','Dashboard','AI','Automation','Analytics','Communication','Calendar')) {
    foreach ($l in @('Entity','Domain','Database','Adapter','Router')) { [void]$required.Add($l) }
    if (($isPageTask -or $group -in @('Dashboard','AI','Notification')) -and -not $routerOnly) { [void]$required.Add('Frontend') }
    return $required
  }

  foreach ($l in @('Domain','Database','Adapter','Router')) { [void]$required.Add($l) }
  if ($isPageTask) { [void]$required.Add('Frontend') }
  return $required
}
function Get-TaskLayerFlags($row) {
  $desc = Clean-Cell $row.Description
  $dod = Clean-Cell $row.'Definition of Done'
  $kpi = Clean-Cell $row.KPIs
  $section = Clean-Cell $row.Section
  $status = Normalize-Status $row.Status
  $allText = ("$desc $dod $kpi $section").ToLower()

  $artifactPaths = Extract-TaggedValues $row.'Artifacts To Track' @('ARTIFACT','FILE','SPEC','PLAN','EVIDENCE')
  $prereqPaths = Extract-TaggedValues $row.'Pre-requisites' @('FILE','ARTIFACT','SPEC','PLAN')
  $paths = @($artifactPaths + $prereqPaths | ForEach-Object { (Clean-Cell $_).ToLower() })

  $hasPath = {
    param([string]$pattern)
    foreach ($p in $paths) { if ($p -match $pattern) { return $true } }
    return $false
  }

  $entity = (& $hasPath '^packages/domain/src/') -or ($allText -match 'aggregate|domain model|entity|conversation record|case document model')
  $domain = (& $hasPath '^packages/application/src/|^packages/domain/src/') -or ($allText -match 'logic|workflow|engine|business rule|conversion|service')
  $database = (& $hasPath '^packages/db/|prisma/|^infra/supabase/|migration|schema') -or ($allText -match 'prisma|migration|schema|database|supabase|sql|pgvector')
  $adapter = (& $hasPath '^packages/adapters/src/|^apps/workers/|^apps/ai-worker/') -or ($allText -match 'repository|adapter|connector|integration')
  $router = (& $hasPath '^apps/api/src/modules/.+router\.ts|^apps/api/src/router\.ts|^apps/api/src/trpc\.ts') -or ($allText -match 'router|endpoint|trpc|api')
  $frontend = (& $hasPath '^apps/web/src/') -or ($allText -match 'page|component|ui|lighthouse|frontend')

  $allRefs = New-Object System.Collections.Generic.List[string]
  foreach ($v in @($artifactPaths + $prereqPaths + @($desc, $dod, $kpi))) {
    if ($v) { $allRefs.Add((Clean-Cell $v)) }
  }

  $trackedPathCandidates = @(
    @($artifactPaths + $prereqPaths |
      ForEach-Object { Clean-Cell $_ } |
      Where-Object { Is-PathLike $_ } |
      Sort-Object -Unique)
  )
  $missingTrackedPaths = New-Object System.Collections.Generic.List[string]
  foreach ($tp in $trackedPathCandidates) {
    if (-not (Test-TrackedPathExists $tp)) {
      $missingTrackedPaths.Add($tp)
    }
  }

  $prd = New-Object System.Collections.Generic.HashSet[string]
  $adr = New-Object System.Collections.Generic.HashSet[string]
  foreach ($txt in $allRefs) {
    foreach ($m in [regex]::Matches($txt, 'docs/planning/prd-[A-Za-z0-9\-_]+\.md')) { [void]$prd.Add($m.Value) }
    foreach ($m in [regex]::Matches($txt, 'docs/architecture/adr/ADR-[0-9]{3}[A-Za-z0-9\-_]*\.md')) { [void]$adr.Add($m.Value) }
  }

  return [pscustomobject]@{
    TaskId = Clean-Cell $row.'Task ID'
    Status = $status
    Entity = $entity
    Domain = $domain
    Database = $database
    Adapter = $adapter
    Router = $router
    Frontend = $frontend
    KPI = $kpi
    Validation = Clean-Cell $row.'Validation Method'
    Artifacts = @($artifactPaths)
    Specs = @(Extract-TaggedValues $row.'Artifacts To Track' @('SPEC','PLAN'))
    Evidence = @(Extract-TaggedValues $row.'Artifacts To Track' @('EVIDENCE'))
    MissingTrackedPaths = @($missingTrackedPaths)
    PRDRefs = @($prd)
    ADRRefs = @($adr)
  }
}

$taskInfoById = @{}
foreach ($r in $rows) {
  $id = Clean-Cell $r.'Task ID'
  if ($id) { $taskInfoById[$id] = Get-TaskLayerFlags $r }
}

$flowRefsByTask = @{}
$flowFiles = Get-ChildItem -Path $flowsDir -File -Filter 'FLOW-*.md'
foreach ($flowFile in $flowFiles) {
  $flowId = [System.IO.Path]::GetFileNameWithoutExtension($flowFile.Name).ToUpper()
  if ($flowId -notmatch '^FLOW-\d+$') { continue }
  $content = Get-Content -Path $flowFile.FullName -Raw
  foreach ($taskId in (Parse-TaskIds $content)) {
    if (-not $flowRefsByTask.ContainsKey($taskId)) {
      $flowRefsByTask[$taskId] = New-Object System.Collections.Generic.HashSet[string]
    }
    [void]$flowRefsByTask[$taskId].Add($flowId)
  }
}

$flowIndexPath = Join-Path $flowsDir 'flow-index.md'
if (Test-Path $flowIndexPath) {
  $currentFlow = ''
  foreach ($line in (Get-Content -Path $flowIndexPath)) {
    if ($line -match '^###\s+(FLOW-\d+)\b') {
      $currentFlow = $Matches[1].ToUpper()
      continue
    }
    if (-not $currentFlow) { continue }
    foreach ($taskId in (Parse-TaskIds $line)) {
      if (-not $flowRefsByTask.ContainsKey($taskId)) {
        $flowRefsByTask[$taskId] = New-Object System.Collections.Generic.HashSet[string]
      }
      [void]$flowRefsByTask[$taskId].Add($currentFlow)
    }
  }
}

$decompose = @{
  'PG-001' = @('Home hero headline emphasizing AI-first CRM with governance','Home hero CTA: Start free trial','Home hero CTA: Talk to sales','Home quick-win badges (AI playbooks, audit-matrix ready, accessible by design)','Home interactive stats card: response target (<200ms)','Home interactive stats card: Lighthouse baseline (90%+)','Home interactive stats card: delivery efficiency metric','Home governance health indicators (WCAG, audit gates, LCP budget)','Home social proof bar','Home value pillars grid','Home flow highlights section','Home "How it works" section','Home assurance checklist (security, accessibility, reliability)','Home final conversion CTA section')
  'PG-004' = @('About hero section','About mission and vision cards','About core values grid','About team showcase','About conversion CTA section')
  'PG-127' = @('Partner application form','Specialized partner qualification fields','Partner submission routing workflow','Partner onboarding handoff flow')
  'PG-128' = @('AI chain versioning admin interface','AI chain version backend wiring')
  'PG-129' = @('Authenticated home welcome summary','Authenticated home activity feed','Authenticated home AI insights panel','Authenticated home pinned items','Authenticated home daily goals')
  'PG-130' = @('Notifications inbox list','Notification mark-as-read actions','Real-time notification updates','Notification filters')
  'PG-131' = @('Deal forecast probability gauge','Deal forecast risk factors','Deal forecast recommendations','Deal forecast history')
  'PG-132' = @('Lead routing rules configuration','Lead assignment dashboard','Lead routing SLA monitoring')
  'PG-133' = @('Contact search','Contact filters','Contact relationship view','Contact activity timeline')
  'PG-134' = @('Account hierarchy view','Account contacts panel','Account opportunities panel','Account revenue charts')
  'PG-135' = @('Deal pipeline Kanban board','Deal stage drag-drop','Stage value totals','Pipeline filtering')
  'PG-136' = @('Task list view','Task calendar view','Task assignments','Task reminders','Task entity linking')
  'PG-137' = @('Ticket list and detail view','Ticket SLA indicators','Ticket escalation handling','Ticket customer portal view')
  'PG-138' = @('Case party management','Case deadline tracking','Case document links','Case timeline view')
  'PG-139' = @('Appointment calendar view','Appointment conflict detection','Appointment-to-case linking','Appointment reminders')
  'PG-140' = @('Document upload flow','Document viewer','Document version history','Document ACL management','Document search')
  'PG-141' = @('Email thread view','Email compose flow','Email attachments handling','Email template usage')
  'PG-142' = @('Sentiment timeline','Sentiment badges','Sentiment trend visualization','Email sentiment preview')
  'PG-143' = @('Churn health scores','Churn risk indicators','Churn intervention triggers','Churn trend charts')
  'PG-144' = @('Universal AI search bar','AI-powered search results','Search citations display','Source highlighting')
  'PG-145' = @('Next-best-action recommendations','NBA deal insights','NBA action cards','NBA success metrics')
  'PG-146' = @('Model drift performance panel','Drift alerts','AI cost tracking','AI error rate monitoring')
  'PG-147' = @('Active workflow list','Workflow execution status','Workflow step visualization','Workflow execution logs')
  'PG-148' = @('Lead score distribution','Lead scoring model accuracy','Top-scored leads list','Lead scoring factor breakdown')
  'PG-149' = @('Experiment management dashboard','Experiment results view','Experiment statistical analysis','Variant comparison view')
  'PG-150' = @('AI review history list','AI review timeline','AI review audit trail')
  'PG-151' = @('Active agent status monitoring','Agent active sessions','Agent task assignments','Agent health indicators')
  'PG-152' = @('Conversation transcript viewer','Tool call record viewer','Searchable agent log timeline')
  'PG-153' = @('Latency SLO compliance panel','Latency percentile charts','Chain performance view','Phase-level latency monitoring')
}

$pgRows = $rows | Where-Object { $_.'Task ID' -match '^PG-' } | Sort-Object { [int]($_.'Task ID' -replace '^PG-', '') }
$ifcRows = $rows | Where-Object { $_.'Task ID' -match '^IFC-' } | Sort-Object { [int]($_.'Task ID' -replace '^IFC-', '') }
$otherRows = $rows | Where-Object { $_.'Task ID' -and $_.'Task ID' -notmatch '^(PG|IFC)-' } | Sort-Object { $_.'Task ID' }

$baseFeatures = New-Object System.Collections.Generic.List[object]
foreach ($r in $pgRows) {
  $taskId = Clean-Cell $r.'Task ID'
  $status = Normalize-Status $r.Status
  $section = Clean-Cell $r.Section
  $baseTitle = Clean-FeatureTitle (($r.Description -split ' - ', 2)[0])
  $immediate = @($taskId) + (Get-DependencyIds $r.Dependencies)

  if ($decompose.ContainsKey($taskId)) {
    foreach ($feature in $decompose[$taskId]) {
      $g = Get-Group $section $feature
      $baseFeatures.Add([pscustomobject]@{
        Group = $g
        Feature = Clean-Cell $feature
        Status = $status
        Purpose = Clean-Cell "Deliver $feature as part of $baseTitle."
        Owner = Clean-Cell $r.Owner
        Priority = Get-Priority $status $g $r.'Target Sprint'
        PrimaryTaskId = $taskId
        PrimaryTitle = $baseTitle
        PrimarySection = $section
        ImmediateTasks = $immediate
        Notes = Clean-Cell "Sub-feature extracted from CSV description for $taskId."
      })
    }
  } else {
    $featureTitle = Clean-FeatureTitle $r.Description
    $g = Get-Group $section $featureTitle
    $baseFeatures.Add([pscustomobject]@{
      Group = $g
      Feature = $featureTitle
      Status = $status
      Purpose = Clean-Cell "Deliver $featureTitle for $section."
      Owner = Clean-Cell $r.Owner
      Priority = Get-Priority $status $g $r.'Target Sprint'
      PrimaryTaskId = $taskId
      PrimaryTitle = $featureTitle
      PrimarySection = $section
      ImmediateTasks = $immediate
      Notes = Clean-Cell "CSV section: $section; source status: $($r.Status)."
    })
  }
}

foreach ($r in $ifcRows) {
  $taskId = Clean-Cell $r.'Task ID'
  $status = Normalize-Status $r.Status
  $section = Clean-Cell $r.Section
  $featureTitle = Clean-FeatureTitle $r.Description
  $g = Get-Group $section $featureTitle
  $immediate = @($taskId) + (Get-DependencyIds $r.Dependencies)
  $baseFeatures.Add([pscustomobject]@{
    Group = $g
    Feature = $featureTitle
    Status = $status
    Purpose = Clean-Cell "Implement capability: $featureTitle."
    Owner = Clean-Cell $r.Owner
    Priority = Get-Priority $status $g $r.'Target Sprint'
    PrimaryTaskId = $taskId
    PrimaryTitle = $featureTitle
    PrimarySection = $section
    ImmediateTasks = $immediate
    Notes = Clean-Cell "Backend/platform capability from CSV section $section; source status: $($r.Status)."
  })
}

foreach ($r in $otherRows) {
  $taskId = Clean-Cell $r.'Task ID'
  $status = Normalize-Status $r.Status
  $section = Clean-Cell $r.Section
  $featureTitle = Clean-FeatureTitle $r.Description
  $g = Get-Group $section $featureTitle
  $immediate = @($taskId) + (Get-DependencyIds $r.Dependencies)
  $baseFeatures.Add([pscustomobject]@{
    Group = $g
    Feature = $featureTitle
    Status = $status
    Purpose = Clean-Cell "Implement cross-cutting capability: $featureTitle."
    Owner = Clean-Cell $r.Owner
    Priority = Get-Priority $status $g $r.'Target Sprint'
    PrimaryTaskId = $taskId
    PrimaryTitle = $featureTitle
    PrimarySection = $section
    ImmediateTasks = $immediate
    Notes = Clean-Cell "Cross-cutting CSV capability from section $section; source status: $($r.Status)."
  })
}
function Get-LayerCell($infos, [string]$layerName, [bool]$required) {
  if (-not $required) { return 'not_required' }
  $hits = @($infos | Where-Object { $_.$layerName })
  if ($hits.Count -eq 0) { return 'missing' }

  $statuses = @($hits | Select-Object -ExpandProperty Status)
  $hasInProgress = $statuses -contains 'in_progress'
  $hasDone = $statuses -contains 'done'
  $hasPlanned = $statuses -contains 'planned'

  $state = 'planned'
  if ($hasInProgress) { $state = 'in_progress' }
  elseif ($hasDone -and -not $hasPlanned) { $state = 'done' }
  elseif ($hasDone -and $hasPlanned) { $state = 'partial' }

  $ids = @($hits | Select-Object -ExpandProperty TaskId | Sort-Object -Unique)
  return "$state ($($ids.Count) task(s))"
}

$layerNames = @('Entity','Domain','Database','Adapter','Router','Frontend')
$matrix = New-Object System.Collections.Generic.List[object]
$atRisk = New-Object System.Collections.Generic.List[object]
$missingByLayer = @{ Entity = 0; Domain = 0; Database = 0; Adapter = 0; Router = 0; Frontend = 0; 'Frontend-List' = 0; 'Frontend-Detail' = 0 }

# ── Wiring audit data (from entity detail wiring audits 2026-03-03 to 2026-03-06) ──
$auditedGroups = @('Lead','Contact','Account','Deal')
$wiringAudit = @{
  'Lead|Lead to Contact Conversion Logic' = 'verified'
  'Lead|Lead to Deal Conversion Logic' = 'issues'
  'Contact|Account contacts panel' = 'issues'
  'Contact|Contact 360 Page' = 'issues'
  'Contact|Contact activity timeline' = 'issues'
  'Contact|Contact Activity Tracking' = 'issues'
  'Contact|Contact filters' = 'verified'
  'Contact|Contact relationship view' = 'verified'
  'Contact|Contact search' = 'verified'
  'Contact|Contact tRPC Router' = 'issues'
  'Contact|Contacts Module' = 'issues'
  'Account|Account hierarchy view' = 'verified'
  'Account|Account opportunities panel' = 'issues'
  'Account|Account revenue charts' = 'verified'
  'Deal|Company & Product Master Brief' = 'verified'
  'Deal|Deal forecast history' = 'verified'
  'Deal|Deal forecast probability gauge' = 'verified'
  'Deal|Deal forecast recommendations' = 'verified'
  'Deal|Deal forecast risk factors' = 'verified'
  'Deal|Deal Forecasting & Reporting' = 'issues'
  'Deal|Deal Lost Closure Workflow' = 'issues'
  'Deal|Deal pipeline Kanban board' = 'verified'
  'Deal|Deal stage drag-drop' = 'verified'
  'Deal|Deal Won Closure Workflow' = 'issues'
  'Deal|Deal/Opportunity tRPC Router' = 'issues'
  'Deal|Deals Pipeline - Kanban Board' = 'verified'
  'Deal|Fix 6 broken Quick Action hrefs' = 'verified'
  'Deal|LangChain Pipeline Design' = 'verified'
  'Deal|Pipeline filtering' = 'issues'
  'Deal|Pipeline Stage Customization' = 'verified'
  'Deal|Ticket Stats Enhancement' = 'issues'
}
$groupEvents = @{
  Lead = 'partial (3/5 handlers)'; Contact = 'partial (2/4 handlers)'
  Account = 'not-wired (0/5 handlers)'; Deal = 'partial (1/4 handlers)'
}
$groupSecurity = @{
  Lead = 'issues (no audit logging)'; Contact = 'issues (raw ctx.prisma, no audit logging)'
  Account = 'critical (no tenantId, no audit logging)'; Deal = 'critical (no tenantId, no audit logging)'
}
# Frontend split heuristics
$listPatterns = @('\blist\b','\bpipeline board\b','\bkanban board\b','\bimport\b','\bmerge\b','\bpipeline filtering\b','\bindex\b','\bqueue\b')
$detailPatterns = @('\bdetail\b','\b360\b','^edit\s','^new\s','\btimeline\b','\bhierarchy view\b','\bpanel\b','\bcharts\b','\bforecast history\b','\bforecast probability\b','\bforecast recommend\b','\bforecast risk\b')

function Get-WiringStatus([string]$group, [string]$feature, [string]$status) {
  if ($status -in @('planned','in_progress')) { return '-' }
  if ($status -ne 'done') { return '-' }
  if ($group -notin $auditedGroups) { return '-' }
  foreach ($key in $wiringAudit.Keys) {
    $parts = $key -split '\|', 2
    if ($parts[0] -eq $group -and $feature.StartsWith($parts[1])) { return $wiringAudit[$key] }
  }
  return 'unaudited'
}

function Split-Frontend([string]$feature, [string]$frontendVal) {
  if ($frontendVal -in @('not_required','missing','')) { return @($frontendVal, $frontendVal) }
  $fl = $feature.ToLower().Trim()
  $isList = $false; $isDetail = $false
  foreach ($p in $listPatterns) { if ($fl -match $p) { $isList = $true; break } }
  foreach ($p in $detailPatterns) { if ($fl -match $p) { $isDetail = $true; break } }
  if ($isList -and -not $isDetail) { return @($frontendVal, 'not_required') }
  if ($isDetail -and -not $isList) { return @('not_required', $frontendVal) }
  return @($frontendVal, $frontendVal)
}

function Get-EventsStatus([string]$group, [string]$adapterVal, [string]$routerVal, [string]$domainVal) {
  $vals = @($adapterVal, $routerVal, $domainVal)
  if (($vals | Where-Object { $_ -notin @('not_required','missing','') }).Count -eq 0) { return 'not_required' }
  if ($groupEvents.ContainsKey($group)) { return $groupEvents[$group] }
  if ($group -notin $auditedGroups) { return '-' }
  return 'unaudited'
}

function Get-SecurityStatus([string]$group, [string]$adapterVal, [string]$routerVal) {
  $vals = @($adapterVal, $routerVal)
  if (($vals | Where-Object { $_ -notin @('not_required','missing','') }).Count -eq 0) { return 'not_required' }
  if ($groupSecurity.ContainsKey($group)) { return $groupSecurity[$group] }
  if ($group -notin $auditedGroups) { return '-' }
  return 'unaudited'
}

foreach ($f in $baseFeatures) {
  $immediate = @($f.ImmediateTasks | Sort-Object -Unique)
  $analysisTasks = Get-TaskClosure $immediate $rowsById
  $infos = @($analysisTasks | Where-Object { $taskInfoById.ContainsKey($_) } | ForEach-Object { $taskInfoById[$_] })
  $primaryInfo = if ($taskInfoById.ContainsKey($f.PrimaryTaskId)) { $taskInfoById[$f.PrimaryTaskId] } else { $null }
  $required = Get-RequiredLayers $f.Group $f.PrimaryTaskId $f.PrimarySection $primaryInfo $f.Feature
  if (-not $required) { $required = New-Object System.Collections.Generic.HashSet[string] }
  $requiredList = @($required | Sort-Object)

  $layerCells = @{}
  $missing = New-Object System.Collections.Generic.List[string]
  $requiredCount = 0
  $coveredCount = 0

  foreach ($ln in $layerNames) {
    $isReq = $required.Contains($ln)
    if ($isReq) { $requiredCount++ }
    $cell = Get-LayerCell $infos $ln $isReq
    $layerCells[$ln] = $cell

    if ($isReq) {
      if ($cell -eq 'missing') {
        $missing.Add($ln)
        $missingByLayer[$ln]++
      } else {
        $coveredCount++
      }
    }
  }

  if ($requiredCount -eq 0) { $requiredCount = 1 }

  $planCoverage = "complete ($coveredCount/$requiredCount)"
  if ($missing.Count -gt 0 -and ($f.Status -in @('done','in_progress'))) { $planCoverage = "at_risk ($coveredCount/$requiredCount)" }
  elseif ($missing.Count -ge 3) { $planCoverage = "gap ($coveredCount/$requiredCount)" }
  elseif ($missing.Count -gt 0) { $planCoverage = "partial ($coveredCount/$requiredCount)" }

  $reqRefs = New-Object System.Collections.Generic.List[string]
  $reqRefs.Add($f.PrimaryTaskId)
  if ($primaryInfo) {
    foreach ($s in $primaryInfo.Specs) { $reqRefs.Add((Clean-Cell $s)) }
    foreach ($a in $primaryInfo.Artifacts) {
      $aClean = Clean-Cell $a
      if ($aClean -match 'docs/specs/|docs/planning/prd|docs/architecture/adr') { $reqRefs.Add($aClean) }
    }
  }

  $flowRefs = New-Object System.Collections.Generic.List[string]
  $prdRefs = New-Object System.Collections.Generic.List[string]
  $adrRefs = New-Object System.Collections.Generic.List[string]
  if ($flowRefsByTask.ContainsKey($f.PrimaryTaskId)) {
    foreach ($fl in $flowRefsByTask[$f.PrimaryTaskId]) { $flowRefs.Add($fl) }
  }
  if ($taskInfoById.ContainsKey($f.PrimaryTaskId)) {
    foreach ($pr in $taskInfoById[$f.PrimaryTaskId].PRDRefs) { $prdRefs.Add($pr) }
    foreach ($ar in $taskInfoById[$f.PrimaryTaskId].ADRRefs) { $adrRefs.Add($ar) }
  }

  $immediateInfos = @($immediate | Where-Object { $taskInfoById.ContainsKey($_) } | ForEach-Object { $taskInfoById[$_] })
  $kpiIds = @($immediateInfos | Where-Object { $_.KPI -and $_.KPI.Trim() -ne '' } | Select-Object -ExpandProperty TaskId | Sort-Object -Unique)

  $validationRefs = New-Object System.Collections.Generic.List[string]
  foreach ($i in $immediateInfos) {
    if ($i.Validation -and $i.Validation.Trim() -ne '') {
      $validationRefs.Add("$($i.TaskId): $($i.Validation)")
    }
  }

  $evidenceRefs = New-Object System.Collections.Generic.List[string]
  if ($primaryInfo) {
    foreach ($e in $primaryInfo.Evidence) { $evidenceRefs.Add((Clean-Cell $e)) }
  }

  $missingTasks = 'None'
  if ($missing.Count -gt 0) {
    $missingTasks = "Create CSV task(s) for: " + ($missing -join ', ')
  }

  $flowRefText = Format-DocRefList @($flowRefs) 'Flow'
  $primaryTitle = Clean-Cell $f.PrimaryTitle
  $docPrd = Get-TaskScopedDocRefs @($prdRefs) $f.PrimaryTaskId $f.Feature $primaryTitle
  $docAdr = Get-TaskScopedDocRefs @($adrRefs) $f.PrimaryTaskId $f.Feature $primaryTitle
  $prdRefText = Format-DocRefList @($docPrd.TaskScoped) 'PRD'
  $adrRefText = Format-DocRefList @($docAdr.TaskScoped) 'ADR'
  $sharedContextRefs = New-Object System.Collections.Generic.List[string]
  foreach ($v in @($docPrd.Shared + $docAdr.Shared)) {
    if ($v) { $sharedContextRefs.Add((Clean-Cell $v)) }
  }
  $sharedContextRefText = Format-FullList @($sharedContextRefs)

  $executionRiskReasons = New-Object System.Collections.Generic.List[string]
  $missingDependencyRefs = New-Object System.Collections.Generic.List[string]
  $unresolvedDependencies = New-Object System.Collections.Generic.List[string]
  $missingArtifactPaths = New-Object System.Collections.Generic.List[string]
  if ($f.Status -in @('done', 'in_progress')) {
    $depHealth = Get-DependencyHealth $f.PrimaryTaskId $rowsById
    foreach ($d in $depHealth.MissingDependencies) { $missingDependencyRefs.Add($d) }
    foreach ($d in $depHealth.UnresolvedDependencies) { $unresolvedDependencies.Add($d) }

    if ($missingDependencyRefs.Count -gt 0) {
      $executionRiskReasons.Add("Dependency references missing from CSV: " + ((@($missingDependencyRefs) | Sort-Object -Unique) -join ', '))
    }
    if ($unresolvedDependencies.Count -gt 0) {
      $executionRiskReasons.Add("Dependencies not done: " + ((@($unresolvedDependencies) | Sort-Object -Unique) -join ', '))
    }
    if ($primaryInfo -and $primaryInfo.MissingTrackedPaths -and $primaryInfo.MissingTrackedPaths.Count -gt 0) {
      $missingPaths = @($primaryInfo.MissingTrackedPaths | Sort-Object -Unique)
      foreach ($mp in $missingPaths) { $missingArtifactPaths.Add($mp) }
      $preview = @($missingPaths | Select-Object -First 3)
      $suffix = if ($missingPaths.Count -gt $preview.Count) { " (+$($missingPaths.Count - $preview.Count) more)" } else { '' }
      $executionRiskReasons.Add("Missing artifact path(s): $($preview -join ', ')$suffix")
    }
  }

  $executionRiskText = if ($executionRiskReasons.Count -eq 0) { '-' } else { $executionRiskReasons -join ' | ' }
  $forecastRisk = Get-ForecastRisk -featureStatus $f.Status -missingRequiredLayers $missing.Count -unresolvedDependencyCount $unresolvedDependencies.Count -missingDependencyRefCount $missingDependencyRefs.Count -missingArtifactPathCount $missingArtifactPaths.Count

  if ($executionRiskReasons.Count -gt 0) {
    $docGapParts = New-Object System.Collections.Generic.List[string]
    if ($flowRefText -like 'No Flow*') { $docGapParts.Add('No Flow') }
    if ($prdRefText -like 'No PRD*') { $docGapParts.Add('No task-scoped PRD') }
    if ($adrRefText -like 'No ADR*') { $docGapParts.Add('No task-scoped ADR') }
    if (($prdRefText -like 'No PRD*' -or $adrRefText -like 'No ADR*') -and $sharedContextRefText -ne '-') {
      $docGapParts.Add('Shared docs only')
    }
    $docGap = if ($docGapParts.Count -eq 0) { '-' } else { $docGapParts -join ', ' }
    $missingLayersText = if ($missing.Count -eq 0) { '-' } else { $missing -join ', ' }

    $atRisk.Add([pscustomobject]@{
      Group = $f.Group
      Feature = $f.Feature
      Status = $f.Status
      Missing = $missingLayersText
      ForecastRisk = $forecastRisk
      ExecutionRisk = $executionRiskText
      PrimaryTask = $f.PrimaryTaskId
      FlowRef = $flowRefText
      PRDRef = $prdRefText
      ADRRef = $adrRefText
      SharedContextRef = $sharedContextRefText
      DocGap = $docGap
    })
  }

  $featureClean = Clean-Cell $f.Feature
  $statusClean = $f.Status
  $groupClean = Clean-Cell $f.Group
  $frontendClean = Clean-Cell $layerCells['Frontend']
  $adapterClean = Clean-Cell $layerCells['Adapter']
  $routerClean = Clean-Cell $layerCells['Router']
  $domainClean = Clean-Cell $layerCells['Domain']

  $wiringStatus = Get-WiringStatus $groupClean $featureClean $statusClean
  $feSplit = Split-Frontend $featureClean $frontendClean
  $eventsStatus = Get-EventsStatus $groupClean $adapterClean $routerClean $domainClean
  $securityStatus = Get-SecurityStatus $groupClean $adapterClean $routerClean

  $matrix.Add([pscustomobject]@{
    Group = $groupClean
    Feature = $featureClean
    Status = $statusClean
    WiringStatus = $wiringStatus
    ForecastRisk = $forecastRisk
    PlanCoverage = $planCoverage
    RequiredLayers = Format-FullList @($requiredList)
    Purpose = Clean-Cell $f.Purpose
    Owner = Clean-Cell $f.Owner
    Priority = $f.Priority
    RelatedTask = Format-FullList @($immediate)
    Requirements = Format-FullList @($reqRefs)
    FlowRef = $flowRefText
    PRDRef = $prdRefText
    ADRRef = $adrRefText
    SharedContextRef = $sharedContextRefText
    Entity = Clean-Cell $layerCells['Entity']
    Domain = $domainClean
    Database = Clean-Cell $layerCells['Database']
    Adapter = $adapterClean
    Router = $routerClean
    FrontendList = $feSplit[0]
    FrontendDetail = $feSplit[1]
    Events = $eventsStatus
    Security = $securityStatus
    KPIRef = Format-FullList @($kpiIds)
    ValidationRef = Format-FullList @($validationRefs)
    EvidenceRef = Format-FullList @($evidenceRefs)
    MissingTasks = Clean-Cell $missingTasks
    Notes = Clean-Cell $f.Notes
  })
}

$groupOrder = @{ Marketing = 1; Auth = 2; Billing = 3; Dashboard = 4; Lead = 5; Contact = 6; Account = 7; Deal = 8; Ticket = 9; Case = 10; Document = 11; Communication = 12; Calendar = 13; Notification = 14; AI = 15; Automation = 16; Analytics = 17; Settings = 18; Governance = 19; Developer = 20; Legal = 21; Platform = 22 }
$sorted = $matrix | Sort-Object @{ Expression = { if ($groupOrder.ContainsKey($_.Group)) { $groupOrder[$_.Group] } else { 99 } } }, @{ Expression = { $_.Group } }, @{ Expression = { $_.Feature } }

$totalEntries = $sorted.Count
$totalGroups = ($sorted | Select-Object -ExpandProperty Group -Unique).Count
$completeCount = ($sorted | Where-Object { $_.PlanCoverage -like 'complete*' }).Count
$partialCount = ($sorted | Where-Object { $_.PlanCoverage -like 'partial*' }).Count
$gapCount = ($sorted | Where-Object { $_.PlanCoverage -like 'gap*' }).Count
$atRiskCount = ($sorted | Where-Object { $_.PlanCoverage -like 'at_risk*' }).Count
$topAtRisk = $atRisk
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# Feature Matrix (Source of Truth)')
[void]$sb.AppendLine('')
$auditDate = (Get-Date).ToString('yyyy-MM-dd')
[void]$sb.AppendLine("Last audited: $auditDate  ")
[void]$sb.AppendLine('Owner: Product + Engineering')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Purpose')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Single artifact to track feature implementation state and delivery completeness across IntelliFlow CRM.')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('This matrix is the canonical view for:')
[void]$sb.AppendLine('- Feature status (`planned`, `in_progress`, `done`)')
[void]$sb.AppendLine('- Requirement traceability (`Related Task (CSV)`, `Flow Ref`, task-scoped `PRD Ref` / `ADR Ref`, `Shared Context Ref`)')
[void]$sb.AppendLine('- End-to-end chain coverage')
[void]$sb.AppendLine('  (`Entity -> Domain -> Database -> Adapter -> Router -> Frontend-List/Detail + Events/Security gates`)')
[void]$sb.AppendLine('- Validation sources (`KPI`, `Validation Method`, evidence artifacts)')
[void]$sb.AppendLine('- Missing CSV tasks needed to fully plan or complete a feature')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Status Rubric')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Status | Definition |')
[void]$sb.AppendLine('|---|---|')
[void]$sb.AppendLine('| `done` | Implemented and wired to active data/API paths for the primary user flow |')
[void]$sb.AppendLine('| `in_progress` | Partially implemented, mock/placeholder behavior, or known integration gaps |')
[void]$sb.AppendLine('| `planned` | Backlog item with no production-ready flow yet |')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('### Wiring Status (Audit Overlay)')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Wiring status is determined by entity detail wiring audits (2026-03-03 to 2026-03-06).')
[void]$sb.AppendLine('Audited entities: Lead, Contact, Account, Deal.')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Wiring Status | Definition |')
[void]$sb.AppendLine('|---|---|')
[void]$sb.AppendLine('| `verified` | Audit-confirmed: wiring is functional end-to-end for the primary user flow |')
[void]$sb.AppendLine('| `issues` | Audit found defects: functional but with gaps (no-op buttons, missing handlers, security issues) |')
[void]$sb.AppendLine('| `unaudited` | Feature is `done` but has not yet been audited for wiring correctness |')
[void]$sb.AppendLine('| `-` | Not applicable (feature is `planned`/`in_progress`, or group not yet audited) |')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Audit documents: `docs/audit/{lead,contact,account,deal}-detail-wiring-audit.md`')
[void]$sb.AppendLine('Cross-reference: `docs/audit/feature-matrix-vs-audit-comparison.md`')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Completeness Rubric')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Plan Coverage | Definition |')
[void]$sb.AppendLine('|---|---|')
[void]$sb.AppendLine('| `complete` | All required layers for this feature type are covered by CSV tasks |')
[void]$sb.AppendLine('| `partial` | 1-2 required layers are missing tasks |')
[void]$sb.AppendLine('| `gap` | 3+ required layers are missing tasks |')
[void]$sb.AppendLine('| `at_risk` | Feature is `done` or `in_progress` but still has missing required layers |')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Forecast risk rubric:')
[void]$sb.AppendLine('- `critical` = `done` with unresolved dependencies, missing dependency references, or missing artifact paths')
[void]$sb.AppendLine('- `high` = `in_progress` with dependency/path issues, or major layer risk')
[void]$sb.AppendLine('- `medium` = non-critical row with partial layer risk')
[void]$sb.AppendLine('- `low` = no immediate leading indicators of delivery slippage')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Doc-linking criteria:')
[void]$sb.AppendLine('- `PRD Ref` / `ADR Ref` include only task-scoped evidence (task ID or feature/title mention in the document)')
[void]$sb.AppendLine('- Range-only or generic docs are listed in `Shared Context Ref` to avoid masking row-level documentation gaps')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Layer cell legend:')
[void]$sb.AppendLine('- `not_required` = layer is not required for this feature type')
[void]$sb.AppendLine('- `missing` = required layer has no linked CSV task')
[void]$sb.AppendLine('- `done/in_progress/planned/partial (N task(s))` = layer has linked task')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('Quality gate legend (Events / Security columns):')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('- `verified` = audit-confirmed functional')
[void]$sb.AppendLine('- `issues (detail)` = audit found non-critical defects')
[void]$sb.AppendLine('- `critical (detail)` = audit found CRITICAL security/data issues')
[void]$sb.AppendLine('- `partial (N/M handlers)` = some event handlers implemented')
[void]$sb.AppendLine('- `not-wired (0/M handlers)` = events defined but zero handlers registered')
[void]$sb.AppendLine('- `not_required` = quality gate not applicable for this feature type')
[void]$sb.AppendLine('- `unaudited` = not yet audited')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Coverage Snapshot')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('- Route-backed product surfaces: 68 pages (`docs/design/sitemap.md`)')
[void]$sb.AppendLine("- CSV-linked PG tasks covered: $($pgRows.Count)")
[void]$sb.AppendLine("- CSV-linked IFC capabilities covered: $($ifcRows.Count)")
[void]$sb.AppendLine("- Other CSV capability tasks covered: $($otherRows.Count)")
[void]$sb.AppendLine("- Total feature entries: $totalEntries")
[void]$sb.AppendLine("- Groups covered: $totalGroups")
[void]$sb.AppendLine("- Plan coverage: complete=$completeCount, partial=$partialCount, gap=$gapCount, at_risk=$atRiskCount")
[void]$sb.AppendLine('- Missing required layers (count of features):')
foreach ($ln in @('Entity','Domain','Database','Adapter','Router','Frontend')) { [void]$sb.AppendLine("  - ${ln}: $($missingByLayer[$ln])") }
[void]$sb.AppendLine("  - Frontend-List: $($missingByLayer['Frontend-List'])")
[void]$sb.AppendLine("  - Frontend-Detail: $($missingByLayer['Frontend-Detail'])")
[void]$sb.AppendLine('  - Events: n/a (quality gate)')
[void]$sb.AppendLine('  - Security: n/a (quality gate)')
[void]$sb.AppendLine('')

if ($topAtRisk.Count -gt 0) {
  [void]$sb.AppendLine('## Immediate Gap Register (At-Risk Features)')
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('Execution-risk criteria: unresolved dependency task status or missing tracked artifact paths for `done`/`in_progress` features.')
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('| Group | Feature | Status | Forecast Risk | Missing Layers | Execution Risk | Primary Task | Flow Ref | PRD Ref | ADR Ref | Shared Context Ref | Doc Gap |')
  [void]$sb.AppendLine('|---|---|---|---|---|---|---|---|---|---|---|---|')
  foreach ($r in $topAtRisk) {
    [void]$sb.AppendLine("| $(Clean-Cell $r.Group) | $(Clean-Cell $r.Feature) | $($r.Status) | $($r.ForecastRisk) | $(Clean-Cell $r.Missing) | $(Clean-Cell $r.ExecutionRisk) | $($r.PrimaryTask) | $(Clean-Cell $r.FlowRef) | $(Clean-Cell $r.PRDRef) | $(Clean-Cell $r.ADRRef) | $(Clean-Cell $r.SharedContextRef) | $(Clean-Cell $r.DocGap) |")
  }
  [void]$sb.AppendLine('')
}

[void]$sb.AppendLine('## Feature Matrix')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| Group | Feature | Status | Wiring Status | Forecast Risk | Plan Coverage | Required Layers | Purpose | Owner | Priority | Related Task (CSV) | Requirements | Flow Ref | PRD Ref | ADR Ref | Shared Context Ref | Entity | Domain | Database | Adapter | Router | Frontend-List | Frontend-Detail | Events | Security | KPI Ref | Validation Ref | Evidence Ref | Missing CSV Task(s) | Notes |')
[void]$sb.AppendLine('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
foreach ($m in $sorted) {
  [void]$sb.AppendLine("| $($m.Group) | $($m.Feature) | $($m.Status) | $($m.WiringStatus) | $($m.ForecastRisk) | $($m.PlanCoverage) | $($m.RequiredLayers) | $($m.Purpose) | $($m.Owner) | $($m.Priority) | $($m.RelatedTask) | $($m.Requirements) | $($m.FlowRef) | $($m.PRDRef) | $($m.ADRRef) | $($m.SharedContextRef) | $($m.Entity) | $($m.Domain) | $($m.Database) | $($m.Adapter) | $($m.Router) | $($m.FrontendList) | $($m.FrontendDetail) | $($m.Events) | $($m.Security) | $($m.KPIRef) | $($m.ValidationRef) | $($m.EvidenceRef) | $($m.MissingTasks) | $($m.Notes) |")
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## Maintenance Rules')
[void]$sb.AppendLine('')
[void]$sb.AppendLine('1. Update this matrix in the same PR whenever a feature status changes.')
[void]$sb.AppendLine('2. Update `Related Task (CSV)` whenever task IDs or dependencies change in `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`.')
[void]$sb.AppendLine('3. Keep `Flow Ref`, task-scoped `PRD Ref` / `ADR Ref`, and `Shared Context Ref` updated as source docs are created or updated.')
[void]$sb.AppendLine('4. For any `Missing CSV Task(s)` entry, add task(s) to `Sprint_plan.csv` and replace the gap in the same PR.')
[void]$sb.AppendLine('5. Keep status values limited to `planned`, `in_progress`, `done`.')

Set-Content -Path $outPath -Value $sb.ToString() -Encoding UTF8

$featureRowsForHtml = @(
  $sorted | ForEach-Object {
    [pscustomobject]@{
      Group = $_.Group
      Feature = $_.Feature
      Status = $_.Status
      WiringStatus = $_.WiringStatus
      ForecastRisk = $_.ForecastRisk
      PlanCoverage = $_.PlanCoverage
      RequiredLayers = $_.RequiredLayers
      Purpose = $_.Purpose
      Owner = $_.Owner
      Priority = $_.Priority
      RelatedTask = $_.RelatedTask
      Requirements = $_.Requirements
      FlowRef = $_.FlowRef
      PRDRef = $_.PRDRef
      ADRRef = $_.ADRRef
      SharedContextRef = $_.SharedContextRef
      Entity = $_.Entity
      Domain = $_.Domain
      Database = $_.Database
      Adapter = $_.Adapter
      Router = $_.Router
      FrontendList = $_.FrontendList
      FrontendDetail = $_.FrontendDetail
      Events = $_.Events
      Security = $_.Security
      KPIRef = $_.KPIRef
      ValidationRef = $_.ValidationRef
      EvidenceRef = $_.EvidenceRef
      MissingTasks = $_.MissingTasks
      Notes = $_.Notes
    }
  }
)

$riskRowsForHtml = @(
  $topAtRisk | ForEach-Object {
    [pscustomobject]@{
      Group = $_.Group
      Feature = $_.Feature
      Status = $_.Status
      ForecastRisk = $_.ForecastRisk
      Missing = $_.Missing
      ExecutionRisk = $_.ExecutionRisk
      PrimaryTask = $_.PrimaryTask
      FlowRef = $_.FlowRef
      PRDRef = $_.PRDRef
      ADRRef = $_.ADRRef
      SharedContextRef = $_.SharedContextRef
      DocGap = $_.DocGap
    }
  }
)

$featureJson = $featureRowsForHtml | ConvertTo-Json -Depth 6 -Compress
$riskJson = $riskRowsForHtml | ConvertTo-Json -Depth 6 -Compress
$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

$htmlTemplate = @'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Feature Matrix - IntelliFlow CRM</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #111a2e;
      --panel-2: #17233c;
      --text: #e8eefc;
      --muted: #96a4c6;
      --line: #2b3b60;
      --accent: #1f6feb;
      --ok: #2ea043;
      --warn: #d29922;
      --risk: #f85149;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      background: radial-gradient(circle at top right, #1a2c4f 0%, var(--bg) 45%);
      min-height: 100vh;
    }
    .wrap {
      max-width: 1760px;
      margin: 0 auto;
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    .panel {
      background: linear-gradient(160deg, rgba(20, 31, 54, 0.95), rgba(14, 23, 42, 0.95));
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.22);
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .meta {
      margin-top: 6px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(6, minmax(110px, 1fr));
      gap: 10px;
    }
    .card {
      background: rgba(22, 35, 61, 0.86);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .card .k { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
    .card .v { margin-top: 5px; font-size: 1.35rem; font-weight: 700; }
    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto;
      gap: 10px;
      align-items: center;
    }
    input, select {
      width: 100%;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0d172c;
      color: var(--text);
      outline: none;
    }
    input:focus, select:focus { border-color: var(--accent); }
    .checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      white-space: nowrap;
      font-size: 0.9rem;
    }
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: auto;
      max-height: 68vh;
      background: #0d1629;
    }
    table {
      width: 100%;
      min-width: 1500px;
      border-collapse: collapse;
      font-size: 0.86rem;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #14213e;
      color: #d7e4ff;
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      white-space: nowrap;
    }
    tbody td {
      padding: 8px;
      border-bottom: 1px solid rgba(43, 59, 96, 0.7);
      vertical-align: top;
      line-height: 1.35;
    }
    tbody tr:hover td { background: rgba(33, 53, 88, 0.35); }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 0.75rem;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .status-done { background: rgba(46, 160, 67, 0.14); color: #67d987; border-color: rgba(46, 160, 67, 0.4); }
    .status-in_progress { background: rgba(31, 111, 235, 0.16); color: #74a8ff; border-color: rgba(31, 111, 235, 0.45); }
    .status-planned { background: rgba(210, 153, 34, 0.16); color: #f0c46a; border-color: rgba(210, 153, 34, 0.42); }
    .cov-complete { color: #67d987; }
    .cov-partial { color: #f0c46a; }
    .cov-gap { color: #ff9b6d; }
    .cov-at_risk { color: #ff8f8f; }
    .missing-ok { color: #67d987; }
    .missing-gap { color: #ff9b6d; font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tiny { font-size: 0.78rem; color: var(--muted); }
    .detail-row td {
      background: rgba(16, 29, 52, 0.9);
      border-bottom: 1px solid var(--line);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(280px, 1fr));
      gap: 10px;
    }
    .detail-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: rgba(11, 19, 35, 0.8);
    }
    .detail-box h4 {
      margin: 0 0 4px 0;
      font-size: 0.78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .toggle {
      border: 1px solid var(--line);
      background: #112243;
      color: #dbe7ff;
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 0.78rem;
    }
    .risk-wrap {
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: auto;
      max-height: 260px;
      background: #0d1629;
    }
    .risk-wrap table { min-width: 980px; }
    .risk-row-risk { color: #ff9393; }
    @media (max-width: 1100px) {
      .summary { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
      .controls { grid-template-columns: 1fr 1fr; }
      .detail-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <h1>Feature Matrix Visualizer</h1>
      <div class="meta">Generated: __GENERATED_AT__ • Source: docs/company/product/feature-matrix.md</div>
    </section>

    <section class="panel summary" id="summary-cards"></section>

    <section class="panel">
      <div class="controls">
        <input id="search-input" type="text" placeholder="Search feature, task ID, owner, notes..." />
        <select id="group-filter"><option value="all">All Groups</option></select>
        <select id="status-filter">
          <option value="all">All Statuses</option>
          <option value="done">done</option>
          <option value="in_progress">in_progress</option>
          <option value="planned">planned</option>
        </select>
        <select id="coverage-filter">
          <option value="all">All Coverage</option>
          <option value="complete">complete</option>
          <option value="partial">partial</option>
          <option value="gap">gap</option>
          <option value="at_risk">at_risk</option>
        </select>
        <label class="checkbox">
          <input id="missing-only" type="checkbox" />
          Only Missing CSV Tasks
        </label>
      </div>
    </section>

    <section class="panel">
      <div class="tiny" id="result-label"></div>
      <div class="table-wrap">
        <table aria-label="Feature Matrix">
          <thead>
            <tr>
              <th>Group</th>
              <th>Feature</th>
              <th>Status</th>
              <th>Coverage</th>
              <th>Required Layers</th>
              <th>Flow Ref</th>
              <th>PRD Ref</th>
              <th>ADR Ref</th>
              <th>Shared Context Ref</th>
              <th>Related Task (CSV)</th>
              <th>Missing CSV Task(s)</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="matrix-body"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2 style="margin:0 0 8px 0; font-size:1rem;">Immediate Gap Register (At-Risk)</h2>
      <div class="risk-wrap">
        <table aria-label="At Risk Features">
          <thead>
            <tr>
              <th>Group</th>
              <th>Feature</th>
              <th>Status</th>
              <th>Forecast Risk</th>
              <th>Missing Layers</th>
              <th>Execution Risk</th>
              <th>Primary Task</th>
              <th>Flow Ref</th>
              <th>PRD Ref</th>
              <th>ADR Ref</th>
              <th>Shared Context Ref</th>
              <th>Doc Gap</th>
            </tr>
          </thead>
          <tbody id="risk-body"></tbody>
        </table>
      </div>
    </section>
  </div>

  <script id="feature-data" type="application/json">__FEATURE_JSON__</script>
  <script id="risk-data" type="application/json">__RISK_JSON__</script>
  <script>
    const rows = JSON.parse(document.getElementById('feature-data').textContent || '[]');
    const riskRows = JSON.parse(document.getElementById('risk-data').textContent || '[]');

    const state = {
      search: '',
      group: 'all',
      status: 'all',
      coverage: 'all',
      missingOnly: false,
    };

    function esc(v) {
      const s = String(v ?? '');
      return s
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/"/g, '&quot;')
        .replaceAll(/'/g, '&#39;');
    }

    function covKind(v) {
      const x = String(v || '').toLowerCase();
      if (x.startsWith('complete')) return 'complete';
      if (x.startsWith('partial')) return 'partial';
      if (x.startsWith('gap')) return 'gap';
      if (x.startsWith('at_risk')) return 'at_risk';
      return '';
    }

    function toSearchText(row) {
      return Object.values(row).join(' ').toLowerCase();
    }

    function matchRow(row) {
      if (state.group !== 'all' && row.Group !== state.group) return false;
      if (state.status !== 'all' && row.Status !== state.status) return false;
      if (state.coverage !== 'all' && covKind(row.PlanCoverage) !== state.coverage) return false;
      if (state.missingOnly && row.MissingTasks === 'None') return false;
      if (state.search) {
        const hay = toSearchText(row);
        if (!hay.includes(state.search)) return false;
      }
      return true;
    }

    function summaryCounts(srcRows) {
      const counts = { total: srcRows.length, done: 0, in_progress: 0, planned: 0, complete: 0, partial: 0, gap: 0, at_risk: 0 };
      for (const r of srcRows) {
        if (r.Status in counts) counts[r.Status] += 1;
        const ck = covKind(r.PlanCoverage);
        if (ck && ck in counts) counts[ck] += 1;
      }
      return counts;
    }

    function renderSummary(allRows, filteredRows) {
      const total = summaryCounts(allRows);
      const visible = summaryCounts(filteredRows);
      const cards = [
        ['Total', total.total, 'Visible ' + visible.total],
        ['done', total.done, 'Visible ' + visible.done],
        ['in_progress', total.in_progress, 'Visible ' + visible.in_progress],
        ['planned', total.planned, 'Visible ' + visible.planned],
        ['at_risk', total.at_risk, 'Visible ' + visible.at_risk],
        ['Missing CSV', allRows.filter((r) => r.MissingTasks !== 'None').length, 'Visible ' + filteredRows.filter((r) => r.MissingTasks !== 'None').length],
      ];
      document.getElementById('summary-cards').innerHTML = cards
        .map((c) => '<div class="card"><div class="k">' + esc(c[0]) + '</div><div class="v">' + esc(c[1]) + '</div><div class="tiny">' + esc(c[2]) + '</div></div>')
        .join('');
    }

    function renderRiskTable() {
      const body = document.getElementById('risk-body');
      body.innerHTML = riskRows
        .map((r) => {
          const cls = String(r.DocGap || '').includes('No ') ? 'risk-row-risk' : '';
          return '<tr class="' + cls + '">' +
            '<td>' + esc(r.Group) + '</td>' +
            '<td>' + esc(r.Feature) + '</td>' +
            '<td><span class="badge status-' + esc(r.Status) + '">' + esc(r.Status) + '</span></td>' +
            '<td>' + esc(r.ForecastRisk || 'low') + '</td>' +
            '<td>' + esc(r.Missing) + '</td>' +
            '<td>' + esc(r.ExecutionRisk) + '</td>' +
            '<td class="mono">' + esc(r.PrimaryTask) + '</td>' +
            '<td>' + esc(r.FlowRef) + '</td>' +
            '<td>' + esc(r.PRDRef) + '</td>' +
            '<td>' + esc(r.ADRRef) + '</td>' +
            '<td>' + esc(r.SharedContextRef) + '</td>' +
            '<td>' + esc(r.DocGap) + '</td>' +
          '</tr>';
        })
        .join('');
    }

    function renderMatrix() {
      const filtered = rows.filter(matchRow);
      const body = document.getElementById('matrix-body');
      document.getElementById('result-label').textContent = 'Showing ' + filtered.length + ' of ' + rows.length + ' rows';
      renderSummary(rows, filtered);

      body.innerHTML = filtered
        .map((r, idx) => {
          const ck = covKind(r.PlanCoverage);
          const missClass = r.MissingTasks === 'None' ? 'missing-ok' : 'missing-gap';
          const details = [
            ['Purpose', r.Purpose],
            ['Forecast Risk', r.ForecastRisk || 'low'],
            ['Owner / Priority', r.Owner + ' / ' + r.Priority],
            ['Requirements', r.Requirements],
            ['Wiring Status', r.WiringStatus || '-'],
            ['Layer Status', 'Entity: ' + r.Entity + '\nDomain: ' + r.Domain + '\nDatabase: ' + r.Database + '\nAdapter: ' + r.Adapter + '\nRouter: ' + r.Router + '\nFE-List: ' + r.FrontendList + '\nFE-Detail: ' + r.FrontendDetail],
            ['Events', r.Events || 'unaudited'],
            ['Security', r.Security || 'unaudited'],
            ['KPI Ref', r.KPIRef],
            ['Validation Ref', r.ValidationRef],
            ['Evidence Ref', r.EvidenceRef],
            ['Notes', r.Notes]
          ];
          const detailHtml = details
            .map((d) => '<div class="detail-box"><h4>' + esc(d[0]) + '</h4><div class="mono tiny" style="white-space:pre-wrap;">' + esc(d[1]) + '</div></div>')
            .join('');

          return '' +
            '<tr>' +
              '<td>' + esc(r.Group) + '</td>' +
              '<td>' + esc(r.Feature) + '</td>' +
              '<td><span class="badge status-' + esc(r.Status) + '">' + esc(r.Status) + '</span></td>' +
              '<td class="cov-' + esc(ck) + '">' + esc(r.PlanCoverage) + '</td>' +
              '<td>' + esc(r.RequiredLayers) + '</td>' +
              '<td>' + esc(r.FlowRef) + '</td>' +
              '<td>' + esc(r.PRDRef) + '</td>' +
              '<td>' + esc(r.ADRRef) + '</td>' +
              '<td>' + esc(r.SharedContextRef) + '</td>' +
              '<td class="mono">' + esc(r.RelatedTask) + '</td>' +
              '<td class="' + missClass + '">' + esc(r.MissingTasks) + '</td>' +
              '<td><button class="toggle" data-detail-toggle="' + idx + '">View</button></td>' +
            '</tr>' +
            '<tr class="detail-row" data-detail-row="' + idx + '" hidden>' +
              '<td colspan="12"><div class="detail-grid">' + detailHtml + '</div></td>' +
            '</tr>';
        })
        .join('');
    }

    function populateGroupFilter() {
      const groups = Array.from(new Set(rows.map((r) => r.Group))).sort();
      const select = document.getElementById('group-filter');
      for (const g of groups) {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        select.appendChild(opt);
      }
    }

    document.getElementById('search-input').addEventListener('input', (e) => {
      state.search = String(e.target.value || '').trim().toLowerCase();
      renderMatrix();
    });
    document.getElementById('group-filter').addEventListener('change', (e) => {
      state.group = e.target.value;
      renderMatrix();
    });
    document.getElementById('status-filter').addEventListener('change', (e) => {
      state.status = e.target.value;
      renderMatrix();
    });
    document.getElementById('coverage-filter').addEventListener('change', (e) => {
      state.coverage = e.target.value;
      renderMatrix();
    });
    document.getElementById('missing-only').addEventListener('change', (e) => {
      state.missingOnly = !!e.target.checked;
      renderMatrix();
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-detail-toggle]');
      if (!btn) return;
      const idx = btn.getAttribute('data-detail-toggle');
      const row = document.querySelector('[data-detail-row="' + idx + '"]');
      if (!row) return;
      const hidden = row.hasAttribute('hidden');
      if (hidden) {
        row.removeAttribute('hidden');
        btn.textContent = 'Hide';
      } else {
        row.setAttribute('hidden', 'hidden');
        btn.textContent = 'View';
      }
    });

    populateGroupFilter();
    renderRiskTable();
    renderMatrix();
  </script>
</body>
</html>
'@

$htmlContent = $htmlTemplate.replaceAll('__FEATURE_JSON__', $featureJson).replaceAll('__RISK_JSON__', $riskJson).replaceAll('__GENERATED_AT__', $generatedAt)
Set-Content -Path $htmlOutPath -Value $htmlContent -Encoding UTF8

Write-Output "Wrote $outPath and $htmlOutPath with $totalEntries entries. complete=$completeCount partial=$partialCount gap=$gapCount at_risk=$atRiskCount"
