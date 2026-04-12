# Determina dinamicamente a raiz do repositório (2 níveis acima deste script)
# Permite passar um caminho alternativo como primeiro argumento ao chamar o script
$scriptDir = Resolve-Path -Path (Join-Path $MyInvocation.MyCommand.Path '..\..') | Select-Object -ExpandProperty Path
$repoRoot = Resolve-Path -Path (Join-Path $scriptDir '..\..') | Select-Object -ExpandProperty Path
$rootPath = $repoRoot
if ($args.Count -gt 0 -and (Test-Path $args[0])) { $rootPath = (Resolve-Path $args[0]).Path }

# Arquivo de saída final (salvo na raiz do repositório)
$outputFile = Join-Path $rootPath 'tree_intelliflow_crm.txt'

# Arquivo temporário para gerar a árvore antes da filtragem (único por processo)
$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("tree_temp_{0}.txt" -f $PID)

# Diretórios e arquivos a serem ignorados na geração da árvore
$excludeDirs = @(
    "node_modules",
    ".bin",
    ".husky",
    ".dist",
    ".swc",
    ".cache",
    ".git",
    ".coverage",
    ".logs",
    ".tmp",
    ".out",
    ".vscode",
    ".turbo",
    ".next",
    "pnpm-store",
    "coverage",
    ".idea",
    "dist",
    "build"
)

$excludeFiles = @(
    "pnpm-lock.yaml",
    ".vscodeignore",
    ".env",
    ".env.local"
)

# Remove os arquivos de saída se existirem
if (Test-Path $outputFile) { Remove-Item -Path $outputFile -Force }
if (Test-Path $tempFile) { Remove-Item -Path $tempFile -Force }

# Função recursiva para escrever a árvore a partir de um caminho dado, escrevendo em UTF8
function Write-Tree {
    param (
        [string]$Path,
        [string]$Indent,
        [bool]$IsLast,
        [string]$OutFile
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Warning "Skipping missing path: $Path"
        return
    }
    
    $item = Get-Item -LiteralPath $Path

    if ($item.PSIsContainer) {
        $displayName = "$($item.Name)/"
    }
    else {
        $displayName = $item.Name
    }

    if ($IsLast) {
        $prefix = "+-- "
    }
    else {
        $prefix = "|-- "
    }

    $line = $Indent + $prefix + $displayName
    Add-Content -Path $OutFile -Value $line -Encoding UTF8

    if ($item.PSIsContainer) {
        $children = Get-ChildItem -LiteralPath $item.FullName -Force |
                    Where-Object { -not ($excludeDirs -contains $_.Name) -and -not ($excludeFiles -contains $_.Name) -and $_.Name -ne 'nul' } |
                    Sort-Object @{ Expression = { -not $_.PSIsContainer } }, Name
        $childCount = $children.Count
        for ($i = 0; $i -lt $childCount; $i++) {
            if ($IsLast) {
                $newIndent = $Indent + "    "
            }
            else {
                $newIndent = $Indent + "|   "
            }
            Write-Tree -Path $children[$i].FullName -Indent $newIndent -IsLast ($i -eq ($childCount - 1)) -OutFile $OutFile
        }
    }
}

# Gera a árvore no arquivo temporário (em UTF8)
$rootItem = Get-Item -LiteralPath $rootPath
if ($rootItem.PSIsContainer) {
    $rootDisplay = "$($rootItem.Name)/"
}
else {
    $rootDisplay = $rootItem.Name
}
Add-Content -Path $tempFile -Value $rootDisplay -Encoding UTF8

if ($rootItem.PSIsContainer) {
    $children = Get-ChildItem -LiteralPath $rootItem.FullName -Force |
                Where-Object { -not ($excludeDirs -contains $_.Name) -and -not ($excludeFiles -contains $_.Name) -and $_.Name -ne 'nul' } |
                Sort-Object @{ Expression = { -not $_.PSIsContainer } }, Name
    $childCount = $children.Count
    for ($i = 0; $i -lt $childCount; $i++) {
        Write-Tree -Path $children[$i].FullName -Indent "" -IsLast ($i -eq ($childCount - 1)) -OutFile $tempFile
    }
}

Write-Host "Árvore gerada no arquivo temporário: $tempFile"

# Aplica a filtragem usando UTF8 para leitura e gravação
Get-Content $tempFile -Encoding UTF8 | 
    Select-String -NotMatch 'node_modules' |
    Select-String -NotMatch '.bin' |
    Select-String -NotMatch 'pnpm-store' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*node_modules.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*pnpm-store.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*.pnpm-cache.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.pnpm-store.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*.cache.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.yarn.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*bower_components.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.npm-global.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/yarn.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/Cypress.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/ms-playwright.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/selenium.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/pip.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/pypoetry.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/pnpm.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/webdriver-manager.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/yarn.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/share/pnpm.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/share/pypoetry.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/share/virtualenvs.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/lib/python.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/bin.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/include.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.local/share/jupyter.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/pip.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/pypoetry.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/yarn.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/npm.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.config/bower.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/bower.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/node-gyp.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/npx.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/_*.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/eslint.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/prettier.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/stylelint.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/ts-node.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/v8-compile-cache.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/webpack.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/yarn/v*.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/yarn/__virtual__.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.cache/yarn/berry.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.npmrc.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.nvmrc.*' | 
    Select-String -NotMatch '^\s*[^A-Za-z]:\\.*\.editorconfig.*' |
    Select-String -NotMatch '^\s*[a-zA-Z0-9._-]+@.*' | 
    Select-String -NotMatch '^\s*\(.*\)' | 
    Select-String -NotMatch '^\s*[a-f0-9]{32,}$' | 
    Where-Object { $_ -notmatch '^[A-Z]:\\.*' } | 
    Where-Object { $_ -notmatch '^Folder PATH listing.*' } | 
    Where-Object { $_ -notmatch '^Volume serial number.*' } | 
    Out-File -Encoding UTF8 $outputFile

# Remove o arquivo temporário
Remove-Item $tempFile

Write-Host "Estrutura filtrada salva em: $outputFile"
