$ErrorActionPreference = 'Stop'
$ApiKey = "cca10956eed01a789dcdc0cffb2bacce"
$YearStart = 2000
$CurrentYear = (Get-Date).Year
$Today = (Get-Date).ToString('yyyy-MM-dd')
$OutFile = Join-Path (Get-Location) 'movies.json'
$MaxConcurrent = 4

function Invoke-TmdbRequest($Url, $Retries = 3) {
    for ($i = 0; $i -le $Retries; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $Url -Method Get -ErrorAction Stop
            return $resp
        } catch {
            Start-Sleep -Milliseconds (500 * [Math]::Pow(2, $i))
        }
    }
    throw "Failed: $Url"
}

function Normalize-Date($raw) {
    if (-not $raw) { return '0000-01-01' }
    if ($raw -match '^\d{4}$') { return "$raw-01-01" }
    if ($raw -match '^\d{4}-\d{2}-\d{2}$') { return $raw }
    return '0000-01-01'
}

function Language-Rank($lang) {
    $l = ($lang | ForEach-Object { $_.ToString().ToLower() })
    if ($l -eq 'hi') { return 0 }
    if ($l -eq 'en') { return 1 }
    return 2
}

$urls = New-Object System.Collections.Generic.List[string]
for ($year = $CurrentYear; $year -ge 2015; $year--) {
    for ($page = 1; $page -le 3; $page++) {
        $urls.Add("https://api.themoviedb.org/3/discover/movie?api_key=$ApiKey&primary_release_year=$year&sort_by=popularity.desc&release_date.lte=$Today&page=$page")
    }
}
for ($year = 2014; $year -ge $YearStart; $year--) {
    $urls.Add("https://api.themoviedb.org/3/discover/movie?api_key=$ApiKey&primary_release_year=$year&sort_by=popularity.desc&release_date.lte=$Today&page=1")
}

$sync = @()
foreach ($u in $urls) {
    $data = $null
    try {
        $data = Invoke-TmdbRequest $u
    } catch {
        Write-Warning "Fetch failed: $u"
        continue
    }

    if ($data -and $data.results) {
        foreach ($m in $data.results) {
            if (-not $m.release_date -or $m.release_date -gt $Today) { continue }
            $title = $m.title
            $poster = if ($m.poster_path) { "https://image.tmdb.org/t/p/w500$($m.poster_path)" } else { "https://via.placeholder.com/500x750?text=No+Image" }
            $overviewText = 'No description'
            if ($m.overview) {
                $len = [Math]::Min(80, $m.overview.Length)
                $overviewText = $m.overview.Substring(0, $len) + '...'
            }
            $obj = [PSCustomObject]@{
                id = $m.id
                title = $title
                poster = $poster
                details = "$(($m.genre_ids -join ', ')) | $overviewText"
                date = if ($m.release_date) { $m.release_date } else { '' }
                popularity = if ($m.popularity) { [double]$m.popularity } else { 0 }
                language = ($m.original_language | ForEach-Object { $_.ToString().ToLower() })
                overview = $m.overview
                link = "/movie/" + ($title -replace '\s+', '-').ToLower()
            }
            $sync += $obj
        }
    }
}

# De-dup by id
$unique = @{}
foreach ($m in $sync) {
    if (-not $unique.ContainsKey($m.id)) { $unique[$m.id] = $m }
}

$movies = $unique.Values | Sort-Object -Property @{
    Expression = { [datetime](Normalize-Date $_.date) }
    Descending = $true
}, @{
    Expression = { $_.popularity }
    Descending = $true
}, @{
    Expression = { Language-Rank $_.language }
    Descending = $false
}, @{
    Expression = { $_.title }
    Descending = $false
}

$movies | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Saved $($movies.Count) movies to $OutFile"
