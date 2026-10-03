Option Explicit

Dim fso, shell, root, launcherPath, command

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = fso.BuildPath(root, "launcher\windows\GoWINBuddy.Launcher.ps1")
If Not fso.FileExists(launcherPath) Then
  launcherPath = fso.BuildPath(root, "GoWINBuddy.Launcher.ps1")
End If

If Not fso.FileExists(launcherPath) Then
  MsgBox "GoWIN!Buddy launcher not found:" & vbCrLf & launcherPath, 16, "GoWIN!Buddy"
  WScript.Quit 1
End If

command = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & launcherPath & """ -Action launch -Root """ & root & """"
shell.Run command, 0, False
