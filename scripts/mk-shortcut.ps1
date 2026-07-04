$ws = New-Object -COM WScript.Shell
$sc = $ws.CreateShortcut("C:\Users\viach\Desktop\termhost.lnk")
$sc.TargetPath = "C:\Users\viach\bin\termhost.cmd"
$sc.WorkingDirectory = "C:\Users\viach\Desktop\termhost"
$sc.Description = "termhost - Terminal Multiplexer"
$sc.IconLocation = "C:\Users\viach\Desktop\termhost\public\final-f7.ico, 0"
$sc.Save()
echo "Done: $($sc.FullName)"
