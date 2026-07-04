$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*C:\Users\viach\bin*") {
    [Environment]::SetEnvironmentVariable("Path", $currentPath + ";C:\Users\viach\bin", "User")
    Write-Output "Added C:\Users\viach\bin to User PATH"
} else {
    Write-Output "Already in PATH"
}
