!include nsDialogs.nsh

!define MUI_BGCOLOR "0B1326"
!define MUI_TEXTCOLOR "DAE2FD"
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_WELCOMEPAGE_TITLE "Novayxk"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "A quieter, smoother AI coding workspace.$\r$\n$\r$\nAfter installation, connect your preferred model provider, open a project, and let Novayxk help you read code, write files, apply patches, and run controlled commands.$\r$\n$\r$\nClick Next and you can get started in just a few seconds."
!define MUI_INSTFILESPAGE_COLORS "DAE2FD 0B1326"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth colored"
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Novayxk is ready"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "Launch the app, connect a model, and open your first project."
!define MUI_FINISHPAGE_TITLE "Novayxk is installed"
!define MUI_FINISHPAGE_TEXT "Installation for the current user is complete. Your model settings and project memory are stored in the .novayxk folder inside your user directory."
!define MUI_FINISHPAGE_RUN_TEXT "Launch Novayxk now"
!define MUI_FINISHPAGE_BUTTON "Finish"

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !insertmacro MUI_PAGE_FINISH
!macroend
