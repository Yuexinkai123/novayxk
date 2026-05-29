!include nsDialogs.nsh

!define MUI_BGCOLOR "0B1326"
!define MUI_TEXTCOLOR "DAE2FD"
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_WELCOMEPAGE_TITLE "Novayxk"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "一个更安静、更顺手的 AI 代码工作台。$\r$\n$\r$\n安装后你可以接入自己的模型供应商，打开项目，让 Novayxk 帮你读代码、写文件、应用补丁和执行受控命令。$\r$\n$\r$\n点击下一步，几秒钟后就可以开始。"
!define MUI_INSTFILESPAGE_COLORS "DAE2FD 0B1326"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth colored"
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Novayxk 已准备就绪"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "启动应用，接入模型，然后打开你的第一个项目。"
!define MUI_FINISHPAGE_TITLE "Novayxk 已安装"
!define MUI_FINISHPAGE_TEXT "已经为当前用户完成安装。你的模型配置和项目记忆会保存在用户目录下的 .novayxk 中。"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 Novayxk"
!define MUI_FINISHPAGE_BUTTON "完成"

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
