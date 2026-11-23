# Local preview with the Firebase emulators: seeds the emulator database, then serves the app at
# http://localhost:5173 (emulator UI at http://localhost:4000). Picks up Node, Java and pnpm from the
# machine PATH, so it works even from a shell started before they were installed.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
Set-Location (Join-Path $PSScriptRoot '..')
pnpm exec firebase emulators:exec --only 'auth,firestore,functions,storage' --project demo-cottid --ui "pnpm seed:emulator && pnpm --filter @afb/web dev:emulators"
